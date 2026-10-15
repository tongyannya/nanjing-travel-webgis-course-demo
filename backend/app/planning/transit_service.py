"""Async orchestration for enriching final plans with AMap transit details."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping
from typing import Any, Literal

from ..amap_client import AMapConfigError, AMapUpstreamError, get_web_service_key, travel_time
from ..amap_transport import check_plan_deadline, gather_amap_queries
from .models import DiningAreasBySlot, DuckRestaurantsBySlot, PlanType
from .service import generate_plans
from .transport import MAX_PUBLIC_TRANSIT_MINUTES, MAX_PUBLIC_TRANSIT_WALKING_MINUTES, transit_requires_taxi
from .transit_enrichment import (
    TransitEnrichmentDataError,
    TransitLegQuery,
    TransitQueryKey,
    collect_transit_leg_queries,
    unique_transit_leg_queries,
    validate_plan_leg_transit_details,
    validate_transit_details,
)


TRANSIT_QUERY_CONCURRENCY = 4
MAX_TRANSIT_QUERY_PASSES = 3
MAX_TRANSIT_QUERIES = 48
logger = logging.getLogger("webgis.backend")

_LOCAL_PLAN_WARNING = "交通时间为坐标距离的保守估算，具体线路需在展示时按需查询高德。"
_LOCAL_GLOBAL_WARNING = "交通时间按坐标距离估算并向上取整到半小时。"

TransitLookup = Callable[..., Awaitable[dict[str, Any]]]
LookupFailure = Literal["config", "upstream", "invalid"]


async def _lookup_one(
    query: TransitLegQuery,
    lookup: TransitLookup,
    semaphore: asyncio.Semaphore,
) -> tuple[TransitQueryKey, Mapping[str, Any] | None, LookupFailure | None]:
    async with semaphore:
        check_plan_deadline()
        try:
            response = await lookup(
                origin=query.origin,
                destination=query.destination,
                mode="public_transit",
            )
            if not isinstance(response, Mapping):
                raise TransitEnrichmentDataError("公交耗时服务没有返回项目对象。")
            details = response.get("transit_details")
            validate_transit_details(details)
            return query.key, details, None
        except AMapConfigError:
            return query.key, None, "config"
        except AMapUpstreamError:
            return query.key, None, "upstream"
        except TransitEnrichmentDataError:
            return query.key, None, "invalid"


async def _lookup_batch(
    queries: list[TransitLegQuery], lookup: TransitLookup
) -> tuple[
    list[tuple[TransitQueryKey, Mapping[str, Any] | None, LookupFailure | None]],
    bool,
]:
    """Run the selected directed queries with bounded concurrency."""

    semaphore = asyncio.Semaphore(TRANSIT_QUERY_CONCURRENCY)
    outcomes = await gather_amap_queries(
        *(_lookup_one(query, lookup, semaphore) for query in queries)
    )
    return outcomes, any(outcome[2] == "config" for outcome in outcomes)


def _replace_transport_warnings(
    response: dict[str, Any], *, query_limit_reached: bool
) -> None:
    all_public_legs: list[dict[str, Any]] = []
    all_taxi_fallback_legs: list[dict[str, Any]] = []
    for plan in response["plans"]:
        public_legs = [
            leg
            for day in plan["days"]
            for leg in day["legs"]
            if leg["mode"] == "public_transit"
        ]
        for leg in public_legs:
            validate_plan_leg_transit_details(leg)
        taxi_fallback_legs = [
            leg
            for day in plan["days"]
            for leg in day["legs"]
            if leg["mode"] == "taxi"
        ]
        all_public_legs.extend(public_legs)
        all_taxi_fallback_legs.extend(taxi_fallback_legs)
        warnings = [
            warning
            for warning in plan["warnings"]
            if warning != _LOCAL_PLAN_WARNING
        ]
        detailed_count = sum(leg["transit_details"] is not None for leg in public_legs)
        if taxi_fallback_legs and public_legs:
            warnings.append(
                "部分路段未取得可用公共交通方案、公共交通超过 90 分钟或步行超过 40 分钟，已改用出租车估算。"
            )
        elif taxi_fallback_legs:
            warnings.append(
                "公共交通未取得可用方案、超过 90 分钟或步行超过 40 分钟，相关路段已改用出租车估算。"
            )
        elif public_legs and detailed_count == len(public_legs):
            warnings.append(
                "公共交通路段采用高德主要线路和半小时精度估算耗时。"
            )
        plan["warnings"] = list(dict.fromkeys(warnings))

    response["global_warnings"] = [
        warning
        for warning in response["global_warnings"]
        if warning != _LOCAL_GLOBAL_WARNING
    ]
    detailed_count = sum(
        leg["transit_details"] is not None for leg in all_public_legs
    )
    if all_taxi_fallback_legs and all_public_legs:
        response["global_warnings"].append(
            "可用、总时长不超过 90 分钟且步行不超过 40 分钟的路段保留公共交通，其余路段已改用出租车估算。"
        )
    elif all_taxi_fallback_legs:
        response["global_warnings"].append(
            "公共交通未取得可用方案、超过 90 分钟或步行超过 40 分钟，相关路段已改用出租车估算。"
        )
    elif all_public_legs and detailed_count == len(all_public_legs):
        response["global_warnings"].append(
            "公共交通路段采用高德主要线路和估算耗时。"
        )
    else:
        response["global_warnings"].append(_LOCAL_GLOBAL_WARNING)
    if query_limit_reached:
        response["global_warnings"].append(
            "为限制外部接口调用，少量未完成查询的公共交通路段已改用出租车估算。"
        )
    response["global_warnings"] = list(dict.fromkeys(response["global_warnings"]))


async def generate_plans_with_transit_details(
    request: dict[str, Any],
    *,
    lookup: TransitLookup | None = None,
    dining_areas_by_slot: DiningAreasBySlot | None = None,
    duck_restaurants_by_slot: DuckRestaurantsBySlot | None = None,
    plan_types: tuple[PlanType, ...] | None = None,
) -> dict[str, Any]:
    """Generate plans, query only selected transit legs, and re-run scheduling."""

    response = generate_plans(
        request,
        dining_areas_by_slot=dining_areas_by_slot,
        duck_restaurants_by_slot=duck_restaurants_by_slot,
        plan_types=plan_types,
    )
    if request["transport_preference"] != "public_transit":
        return response

    active_lookup = lookup or travel_time
    details_by_key: dict[TransitQueryKey, Mapping[str, Any]] = {}
    taxi_fallback_keys: set[TransitQueryKey] = set()
    attempted_keys: set[TransitQueryKey] = set()
    calls_made = 0
    query_limit_reached = False
    configuration_unavailable = False

    for _pass_index in range(MAX_TRANSIT_QUERY_PASSES):
        check_plan_deadline()
        unique_queries = unique_transit_leg_queries(
            collect_transit_leg_queries(response)
        )
        pending = [
            query
            for key, query in unique_queries.items()
            if key not in attempted_keys
        ]
        if not pending:
            break
        remaining_budget = MAX_TRANSIT_QUERIES - calls_made
        if remaining_budget <= 0:
            query_limit_reached = True
            break
        if len(pending) > remaining_budget:
            pending = pending[:remaining_budget]
            query_limit_reached = True

        try:
            if lookup is None:
                get_web_service_key()
            outcomes, config_unavailable = await _lookup_batch(pending, active_lookup)
        except AMapConfigError:
            outcomes = [(pending[0].key, None, "config")]
            config_unavailable = True
        calls_made += len(outcomes)
        attempted_keys.update(key for key, _details, _failure in outcomes)
        failure_counts = {
            failure: sum(outcome[2] == failure for outcome in outcomes)
            for failure in ("config", "upstream", "invalid")
        }
        if any(failure_counts.values()):
            logger.warning(
                "Plan transit enrichment degraded; config=%d upstream=%d invalid=%d",
                failure_counts["config"],
                failure_counts["upstream"],
                failure_counts["invalid"],
            )
        over_limit_count = 0
        for key, details, failure in outcomes:
            if failure is not None:
                taxi_fallback_keys.add(key)
            elif details is not None and transit_requires_taxi(details):
                taxi_fallback_keys.add(key)
                over_limit_count += 1
            elif details is not None:
                details_by_key[key] = details
        if over_limit_count:
            logger.info(
                "Plan transit legs switched to taxi above threshold; count=%d total_limit=%d walking_limit=%d",
                over_limit_count,
                MAX_PUBLIC_TRANSIT_MINUTES,
                MAX_PUBLIC_TRANSIT_WALKING_MINUTES,
            )

        if details_by_key or taxi_fallback_keys:
            response = generate_plans(
                request,
                transit_details_by_key=details_by_key,
                taxi_fallback_keys=taxi_fallback_keys,
                dining_areas_by_slot=dining_areas_by_slot,
                duck_restaurants_by_slot=duck_restaurants_by_slot,
                plan_types=plan_types,
            )
        if config_unavailable:
            configuration_unavailable = True
            break

    final_queries = unique_transit_leg_queries(collect_transit_leg_queries(response))
    if not configuration_unavailable and any(
        key not in attempted_keys for key in final_queries
    ):
        query_limit_reached = True
    if query_limit_reached:
        logger.warning(
            "Plan transit enrichment reached its lookup limit; calls=%d passes=%d",
            calls_made,
            MAX_TRANSIT_QUERY_PASSES,
        )
    response = generate_plans(
        request,
        transit_details_by_key=details_by_key,
        taxi_fallback_keys=taxi_fallback_keys,
        fallback_missing_transit_to_taxi=True,
        dining_areas_by_slot=dining_areas_by_slot,
        duck_restaurants_by_slot=duck_restaurants_by_slot,
        plan_types=plan_types,
    )
    _replace_transport_warnings(
        response,
        query_limit_reached=query_limit_reached,
    )
    return response
