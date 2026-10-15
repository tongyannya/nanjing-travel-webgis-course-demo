"""Bounded selection of real dining areas around meal-adjacent route nodes."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import ValidationError

from ..amap_client import AMapConfigError, AMapUpstreamError, get_web_service_key
from ..amap_transport import check_plan_deadline, gather_amap_queries, planning_request_scope
from ..api_models import DiningArea
from ..dining_service import evaluate_dining_area
from .duck_dining_orchestration import (
    DuckRestaurantLookup,
    prepare_duck_restaurants,
)
from .models import PLAN_TYPES, DiningAreasBySlot, DiningSlotKey, PlanType
from .service import generate_plans
from .time_rules import minutes
from .transit_service import TransitLookup, generate_plans_with_transit_details
from .transport import distance_km


DINING_QUERY_CONCURRENCY = 3
MAX_DINING_AREA_EVALUATIONS = 24
logger = logging.getLogger("webgis.backend")

DiningLookup = Callable[..., Awaitable[dict[str, Any]]]
DiningLookupFailure = Literal["config", "upstream", "invalid"]
DiningCandidateKey = tuple[float, float, str]


@dataclass(frozen=True)
class DiningCandidate:
    """One route-adjacent point that may become a meal-area center."""

    key: DiningCandidateKey
    center: Mapping[str, Any]
    near_item_id: str
    route_order: int
    detour_km: float
    time_gap_minutes: int


@dataclass(frozen=True)
class DiningPreparation:
    """Prepared area choices plus user-facing orchestration warnings."""

    areas_by_slot: DiningAreasBySlot
    warnings: tuple[str, ...]
    evaluations_made: int
    query_limit_reached: bool


def _near_item_id(item: Mapping[str, Any], visit_date: str) -> str:
    ref_id = item.get("ref_id")
    if isinstance(ref_id, str) and ref_id:
        return ref_id
    return f"{item['type']}_{visit_date}"


def _candidate(
    *,
    item: Mapping[str, Any],
    previous: Mapping[str, Any],
    following: Mapping[str, Any],
    meal: Mapping[str, Any],
    visit_date: str,
    route_order: int,
) -> DiningCandidate:
    center = item["location"]
    near_item_id = _near_item_id(item, visit_date)
    direct_km = distance_km(previous["location"], following["location"])
    via_candidate_km = distance_km(previous["location"], center) + distance_km(
        center, following["location"]
    )
    boundary_time = (
        minutes(item["end_time"])
        if route_order == 0
        else minutes(item["start_time"])
    )
    meal_boundary = (
        minutes(meal["start_time"])
        if route_order == 0
        else minutes(meal["end_time"])
    )
    return DiningCandidate(
        key=(
            round(float(center["longitude"]), 6),
            round(float(center["latitude"]), 6),
            near_item_id,
        ),
        center=center,
        near_item_id=near_item_id,
        route_order=route_order,
        detour_km=max(0.0, via_candidate_km - direct_km),
        time_gap_minutes=abs(boundary_time - meal_boundary),
    )


def collect_dining_candidates(
    request: Mapping[str, Any], baseline_response: Mapping[str, Any]
) -> dict[DiningSlotKey, tuple[DiningCandidate, ...]]:
    """Collect the previous and next route node around every reserved meal."""

    slots: dict[DiningSlotKey, tuple[DiningCandidate, ...]] = {}
    for plan in baseline_response["plans"]:
        plan_type = plan["plan_type"]
        for day in plan["days"]:
            items = day["items"]
            for index, meal in enumerate(items):
                meal_kind = meal.get("meal_kind")
                if (
                    meal["type"] != "free_time"
                    or meal_kind not in ("lunch", "dinner")
                    or index == 0
                    or index == len(items) - 1
                ):
                    continue
                previous = items[index - 1]
                following = items[index + 1]
                candidates = [
                    _candidate(
                        item=item,
                        previous=previous,
                        following=following,
                        meal=meal,
                        visit_date=day["date"],
                        route_order=route_order,
                    )
                    for route_order, item in enumerate((previous, following))
                ]
                unique_candidates: dict[
                    DiningCandidateKey, DiningCandidate
                ] = {}
                for candidate in candidates:
                    unique_candidates.setdefault(candidate.key, candidate)
                slots[(plan_type, day["date"], meal_kind)] = tuple(
                    unique_candidates.values()
                )

    # Full three-plan generation keeps identical relaxed/duck meal centers shared;
    # a duck-only request still contributes its own candidates above.
    for day in request["trip_days"]:
        for meal_kind in ("lunch", "dinner"):
            relaxed_key: DiningSlotKey = ("relaxed", day["date"], meal_kind)
            duck_key: DiningSlotKey = ("duck", day["date"], meal_kind)
            if (
                relaxed_key in slots
                and duck_key in slots
                and tuple(item.key for item in slots[relaxed_key])
                == tuple(item.key for item in slots[duck_key])
            ):
                slots[duck_key] = slots[relaxed_key]
    return slots


def _selected_candidate_keys(
    candidates_by_slot: Mapping[DiningSlotKey, tuple[DiningCandidate, ...]]
) -> tuple[list[DiningCandidateKey], bool]:
    """Give every slot its first candidate before spending budget on alternatives."""

    selected: list[DiningCandidateKey] = []
    seen: set[DiningCandidateKey] = set()
    active_slots = list(candidates_by_slot.items())
    maximum_candidates = max(
        (len(candidates) for _slot, candidates in active_slots),
        default=0,
    )
    all_keys: set[DiningCandidateKey] = {
        candidate.key
        for _slot, candidates in active_slots
        for candidate in candidates
    }
    for candidate_index in range(maximum_candidates):
        for _slot, candidates in active_slots:
            if candidate_index >= len(candidates):
                continue
            key = candidates[candidate_index].key
            if key in seen:
                continue
            if len(selected) >= MAX_DINING_AREA_EVALUATIONS:
                return selected, len(seen) < len(all_keys)
            selected.append(key)
            seen.add(key)
    return selected, len(seen) < len(all_keys)


async def _lookup_one(
    candidate: DiningCandidate,
    lookup: DiningLookup,
    semaphore: asyncio.Semaphore,
) -> tuple[
    DiningCandidateKey,
    dict[str, Any] | None,
    DiningLookupFailure | None,
]:
    async with semaphore:
        check_plan_deadline()
        try:
            raw_area = await lookup(
                longitude=candidate.center["longitude"],
                latitude=candidate.center["latitude"],
                near_item_id=candidate.near_item_id,
            )
            area = DiningArea.model_validate(raw_area).model_dump(mode="json")
            return candidate.key, area, None
        except AMapConfigError:
            return candidate.key, None, "config"
        except AMapUpstreamError:
            return candidate.key, None, "upstream"
        except ValidationError:
            return candidate.key, None, "invalid"


async def _lookup_candidates(
    candidates: list[DiningCandidate],
    lookup: DiningLookup,
) -> tuple[
    dict[DiningCandidateKey, dict[str, Any]],
    dict[DiningLookupFailure, int],
    int,
]:
    """Evaluate all selected candidates with bounded concurrency."""

    if not candidates:
        return {}, {"config": 0, "upstream": 0, "invalid": 0}, 0
    semaphore = asyncio.Semaphore(DINING_QUERY_CONCURRENCY)
    outcomes = await gather_amap_queries(
        *(_lookup_one(candidate, lookup, semaphore) for candidate in candidates)
    )
    areas = {
        key: area
        for key, area, failure in outcomes
        if failure is None and area is not None
    }
    failure_counts = {
        failure: sum(outcome[2] == failure for outcome in outcomes)
        for failure in ("config", "upstream", "invalid")
    }
    return areas, failure_counts, len(outcomes)


_DENSITY_PRIORITY = {
    "cluster": 3,
    "rich": 2,
    "normal": 1,
    "unsuitable": 0,
}


def rank_dining_choices(
    candidates: tuple[DiningCandidate, ...],
    areas_by_key: Mapping[DiningCandidateKey, Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Rank suitable choices by detour, bounded density sample, then timing."""

    ranked = [
        (candidate, areas_by_key[candidate.key])
        for candidate in candidates
        if candidate.key in areas_by_key
        and areas_by_key[candidate.key]["has_suitable_area"]
    ]
    ranked.sort(
        key=lambda value: (
            round(value[0].detour_km, 6),
            -int(value[1]["restaurant_count"]),
            -_DENSITY_PRIORITY[value[1]["density_level"]],
            value[0].time_gap_minutes,
            value[0].route_order,
        )
    )
    return [deepcopy(dict(area)) for _candidate, area in ranked]


async def prepare_dining_areas(
    request: dict[str, Any],
    baseline_response: dict[str, Any],
    *,
    lookup: DiningLookup | None = None,
) -> DiningPreparation:
    """Evaluate a bounded set of route-adjacent centers and prepare all plan slots."""

    candidates_by_slot = collect_dining_candidates(request, baseline_response)
    selected_keys, query_limit_reached = _selected_candidate_keys(
        candidates_by_slot
    )
    candidate_by_key = {
        candidate.key: candidate
        for candidates in candidates_by_slot.values()
        for candidate in candidates
    }
    selected_candidates = [candidate_by_key[key] for key in selected_keys]
    try:
        if lookup is None:
            get_web_service_key()
        areas_by_key, failure_counts, evaluations_made = await _lookup_candidates(
            selected_candidates, lookup or evaluate_dining_area,
        )
    except AMapConfigError:
        areas_by_key = {}
        failure_counts = {"config": 1, "upstream": 0, "invalid": 0}
        evaluations_made = 0

    areas_by_slot: dict[DiningSlotKey, list[dict[str, Any]]] = {
        slot: rank_dining_choices(candidates, areas_by_key)
        for slot, candidates in candidates_by_slot.items()
    }
    for day in request["trip_days"]:
        for plan_type in ("relaxed", "compact", "duck"):
            for meal_kind in ("lunch", "dinner"):
                areas_by_slot.setdefault(
                    (plan_type, day["date"], meal_kind),
                    [],
                )

    warnings = []
    if failure_counts["config"]:
        warnings.append(
            "未配置高德 Web 服务 Key，已保留用餐时间，但未生成餐饮便利区。"
        )
    if failure_counts["upstream"]:
        warnings.append(
            "部分餐饮候选区域未能从高德取得数据，相关餐次已使用其他候选或保留用餐时间。"
        )
    if failure_counts["invalid"]:
        warnings.append(
            "部分餐饮候选区域返回数据不符合项目契约，已忽略这些候选。"
        )
    if query_limit_reached:
        warnings.append(
            "为限制外部接口调用，部分次选餐饮区域未评估；每个餐次仍优先保留沿途首选候选。"
        )
    if areas_by_key:
        warnings.append(
            "餐饮便利区根据用餐前后路线节点动态评估，饭店数量是有限页去重样本。"
        )
    if any(failure_counts.values()) or query_limit_reached:
        logger.warning(
            "Dining planning degraded; config=%d upstream=%d invalid=%d "
            "evaluations=%d limit=%s",
            failure_counts["config"],
            failure_counts["upstream"],
            failure_counts["invalid"],
            evaluations_made,
            query_limit_reached,
        )
    return DiningPreparation(
        areas_by_slot=areas_by_slot,
        warnings=tuple(warnings),
        evaluations_made=evaluations_made,
        query_limit_reached=query_limit_reached,
    )


@planning_request_scope()
async def generate_plans_with_dining_and_transit(
    request: dict[str, Any],
    *,
    dining_lookup: DiningLookup | None = None,
    transit_lookup: TransitLookup | None = None,
    duck_restaurant_lookup: DuckRestaurantLookup | None = None,
    plan_types: tuple[PlanType, ...] | None = None,
) -> dict[str, Any]:
    """Generate meal-aware plans, then enrich the final public-transit legs."""

    selected_plan_types = plan_types if plan_types is not None else PLAN_TYPES
    check_plan_deadline()
    baseline_response = generate_plans(
        request,
        dining_areas_by_slot={},
        plan_types=selected_plan_types,
    )
    preparation = await prepare_dining_areas(
        request,
        baseline_response,
        lookup=dining_lookup,
    )
    duck_restaurants_by_slot = None
    duck_warnings: tuple[str, ...] = ()
    if "duck" in selected_plan_types:
        check_plan_deadline()
        duck_baseline_response = generate_plans(
            request,
            dining_areas_by_slot=preparation.areas_by_slot,
            duck_restaurants_by_slot={},
            plan_types=("duck",),
        )
        duck_preparation = await prepare_duck_restaurants(
            request,
            duck_baseline_response,
            lookup=duck_restaurant_lookup,
        )
        duck_restaurants_by_slot = duck_preparation.restaurants_by_slot
        duck_warnings = duck_preparation.warnings
    check_plan_deadline()
    response = await generate_plans_with_transit_details(
        request,
        lookup=transit_lookup,
        dining_areas_by_slot=preparation.areas_by_slot,
        duck_restaurants_by_slot=duck_restaurants_by_slot,
        plan_types=selected_plan_types,
    )
    response["global_warnings"].extend(preparation.warnings)
    response["global_warnings"].extend(duck_warnings)
    response["global_warnings"] = list(dict.fromkeys(response["global_warnings"]))
    return response
