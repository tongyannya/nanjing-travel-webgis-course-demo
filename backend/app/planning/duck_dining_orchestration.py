"""Bounded asynchronous F4 preparation using deterministic duck selection rules."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from ..amap_client import AMapConfigError, AMapUpstreamError
from ..amap_transport import check_plan_deadline
from ..api_models import DuckRestaurantSearchResponse
from ..duck_restaurant_service import search_duck_restaurants
from .models import DiningSlotKey, DuckRestaurantsBySlot
from .duck_selection import (
    DUCK_SEARCH_RADIUS_METERS,
    DuckRestaurantCandidate,
    DuckSearchCacheKey,
    SelectedDuckRestaurant,
    collect_duck_meal_search_slots,
    duck_schedule_choices,
    duck_search_cache_key,
    rank_duck_restaurant_candidates,
    select_duck_restaurants,
    target_duck_restaurant_count,
)


logger = logging.getLogger("webgis.backend")
DuckRestaurantLookup = Callable[..., Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class DuckDiningPreparation:
    """Selected schedule choices plus bounded-search audit information."""

    restaurants_by_slot: DuckRestaurantsBySlot
    warnings: tuple[str, ...]
    target_count: int
    selected_count: int
    searches_made: int
    centers_considered: int
    stopped_for_config: bool
    query_limit_reached: bool



async def prepare_duck_restaurants(
    request: Mapping[str, Any],
    baseline_response: Mapping[str, Any],
    *,
    lookup: DuckRestaurantLookup | None = None,
) -> DuckDiningPreparation:
    """Search bounded F4 centers sequentially and prepare deterministic choices."""

    day_count = len(request["trip_days"])
    target_count = target_duck_restaurant_count(day_count)
    slots = collect_duck_meal_search_slots(
        baseline_response,
        day_count=day_count,
    )
    active_lookup = lookup or search_duck_restaurants
    cache: dict[DuckSearchCacheKey, tuple[dict[str, Any], ...]] = {}
    candidates_by_slot: dict[
        DiningSlotKey, tuple[DuckRestaurantCandidate, ...]
    ] = {}
    searches_made = 0
    centers_considered = 0
    config_failures = 0
    upstream_failures = 0
    invalid_failures = 0
    partial_centers = 0
    stopped_for_config = False
    selections: tuple[SelectedDuckRestaurant, ...] = ()

    for slot in slots:
        check_plan_deadline()
        centers_considered += 1
        key = duck_search_cache_key(slot)
        restaurants = cache.get(key)
        if restaurants is None:
            searches_made += 1
            try:
                raw_response = await active_lookup(
                    longitude=slot.center["longitude"],
                    latitude=slot.center["latitude"],
                    radius_meters=DUCK_SEARCH_RADIUS_METERS,
                )
                response = DuckRestaurantSearchResponse.model_validate(raw_response)
            except AMapConfigError:
                config_failures += 1
                stopped_for_config = True
                break
            except AMapUpstreamError:
                upstream_failures += 1
                continue
            except (TypeError, ValidationError):
                invalid_failures += 1
                continue
            if response.is_partial:
                partial_centers += 1
            restaurants = tuple(
                restaurant.model_dump(mode="json")
                for restaurant in response.restaurants
            )
            cache[key] = restaurants

        candidates_by_slot[slot.key] = rank_duck_restaurant_candidates(
            slot,
            restaurants,
            transport_preference=str(request["transport_preference"]),
        )
        selections = select_duck_restaurants(
            candidates_by_slot,
            target_count=target_count,
        )
        if len(selections) >= target_count:
            break

    warnings: list[str] = []
    if config_failures:
        warnings.append(
            "未配置高德 Web 服务 Key，鸭类餐饮增强已停止；"
            "鸭子方案继续保留普通真实餐饮区域或用餐时间。"
        )
    if upstream_failures:
        warnings.append(
            "部分鸭类餐饮搜索中心未能从高德取得数据，已继续尝试其他中心。"
        )
    if invalid_failures:
        warnings.append(
            "部分鸭类餐饮搜索结果不符合 F4 项目契约，已忽略并继续规划。"
        )
    if partial_centers:
        warnings.append(
            "部分鸭类检索词请求失败，路线只使用其余成功返回且通过受控分类的候选。"
        )
    if len(selections) < target_count:
        warnings.append(
            f"鸭类餐饮目标 {target_count} 家，候选筛选后可安排 {len(selections)} 家。"
        )
    elif selections:
        warnings.append(
            "按鸭菜类别和路线位置筛选餐馆。"
        )
    query_limit_reached = bool(slots) and centers_considered >= len(slots) and len(
        selections
    ) < target_count
    if query_limit_reached:
        warnings.append(
            f"鸭类餐饮搜索已达到本次 {len(slots)} 个搜索中心。"
        )
    if any((config_failures, upstream_failures, invalid_failures, partial_centers)):
        logger.warning(
            "Duck dining planning degraded; config=%d upstream=%d invalid=%d partial=%d "
            "searches=%d centers=%d",
            config_failures,
            upstream_failures,
            invalid_failures,
            partial_centers,
            searches_made,
            centers_considered,
        )
    return DuckDiningPreparation(
        restaurants_by_slot=duck_schedule_choices(candidates_by_slot, selections),
        warnings=tuple(warnings),
        target_count=target_count,
        selected_count=len(selections),
        searches_made=searches_made,
        centers_considered=centers_considered,
        stopped_for_config=stopped_for_config,
        query_limit_reached=query_limit_reached,
    )
