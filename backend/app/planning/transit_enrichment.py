"""Pure helpers for attaching project-owned transit details to plan legs.

This module deliberately performs no network access.  It identifies the final
public-transit legs that need lookup, deduplicates coordinate pairs, and validates
T1 transit details before they enter PlanResponse.
"""

from __future__ import annotations

import math
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Mapping, TypeAlias


COORDINATE_PRECISION = 6
TransitQueryKey: TypeAlias = tuple[float, float, float, float]

_TRANSIT_DETAIL_FIELDS = {
    "total_minutes",
    "conservative_minutes",
    "walking_distance_m",
    "walking_minutes",
    "transfer_count",
    "ride_segments",
    "route_segments",
    "transfers",
    "summary",
}
_RIDE_FIELDS = {
    "mode",
    "line_name",
    "departure_stop",
    "arrival_stop",
    "duration_minutes",
}
_TRANSFER_FIELDS = {
    "from_line_name",
    "to_line_name",
    "arrival_stop",
    "departure_stop",
}
_ROUTE_SEGMENT_FIELDS = {"mode", "line_name", "path"}
_RIDE_MODES = {"bus", "metro", "taxi", "railway"}
_ROUTE_MODES = {"walk", *_RIDE_MODES}


class TransitEnrichmentDataError(ValueError):
    """Raised when plan legs or transit details violate the T2 contract."""


@dataclass(frozen=True)
class TransitLegQuery:
    """One public-transit leg and the coordinates required for its lookup."""

    plan_index: int
    day_index: int
    leg_index: int
    key: TransitQueryKey
    origin: tuple[float, float]
    destination: tuple[float, float]


def _coordinate(location: Mapping[str, Any], field: str) -> tuple[float, float]:
    if not isinstance(location, Mapping):
        raise TransitEnrichmentDataError(f"{field} 缺少有效坐标对象。")
    if location.get("coord_system") != "GCJ-02":
        raise TransitEnrichmentDataError(f"{field} 必须使用 GCJ-02 坐标。")
    values = (location.get("longitude"), location.get("latitude"))
    if any(
        isinstance(value, bool) or not isinstance(value, (int, float))
        for value in values
    ):
        raise TransitEnrichmentDataError(f"{field} 缺少有效经纬度。")
    longitude, latitude = (float(value) for value in values)
    if not math.isfinite(longitude) or not math.isfinite(latitude):
        raise TransitEnrichmentDataError(f"{field} 缺少有效经纬度。")
    return longitude, latitude


def transit_query_key(
    origin: Mapping[str, Any], destination: Mapping[str, Any]
) -> TransitQueryKey:
    """Build a directional, stable key for one GCJ-02 coordinate pair."""

    origin_coord = _coordinate(origin, "origin")
    destination_coord = _coordinate(destination, "destination")
    return tuple(
        round(value, COORDINATE_PRECISION)
        for value in (*origin_coord, *destination_coord)
    )


def collect_transit_leg_queries(response: Mapping[str, Any]) -> list[TransitLegQuery]:
    """Collect every final public-transit leg without deduplicating occurrences."""

    queries: list[TransitLegQuery] = []
    for plan_index, plan in enumerate(response.get("plans", [])):
        for day_index, day in enumerate(plan.get("days", [])):
            items = {
                item.get("item_id"): item
                for item in day.get("items", [])
                if isinstance(item, Mapping)
            }
            for leg_index, leg in enumerate(day.get("legs", [])):
                if not isinstance(leg, Mapping) or leg.get("mode") != "public_transit":
                    continue
                first = items.get(leg.get("from_item_id"))
                second = items.get(leg.get("to_item_id"))
                if first is None or second is None:
                    raise TransitEnrichmentDataError(
                        "公共交通路段无法匹配起点或终点节点。"
                    )
                origin = _coordinate(first.get("location", {}), "origin")
                destination = _coordinate(second.get("location", {}), "destination")
                key = transit_query_key(first["location"], second["location"])
                queries.append(
                    TransitLegQuery(
                        plan_index=plan_index,
                        day_index=day_index,
                        leg_index=leg_index,
                        key=key,
                        origin=origin,
                        destination=destination,
                    )
                )
    return queries


def unique_transit_leg_queries(
    queries: list[TransitLegQuery],
) -> dict[TransitQueryKey, TransitLegQuery]:
    """Keep the first occurrence of each directional coordinate pair."""

    unique: dict[TransitQueryKey, TransitLegQuery] = {}
    for query in queries:
        unique.setdefault(query.key, query)
    return unique


def _require_int(value: Any, field: str, *, minimum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise TransitEnrichmentDataError(f"transit_details.{field} 不是有效整数。")
    return value


def _optional_non_negative_int(value: Any, field: str) -> None:
    if value is not None:
        _require_int(value, field, minimum=0)


def _optional_text(value: Any, field: str) -> None:
    if value is not None and (not isinstance(value, str) or not value.strip()):
        raise TransitEnrichmentDataError(f"{field} 必须为非空字符串或 null。")


def _exact_fields(value: Mapping[str, Any], expected: set[str], field: str) -> None:
    missing = expected - set(value)
    extra = set(value) - expected
    if missing or extra:
        raise TransitEnrichmentDataError(
            f"{field} 字段不完整或包含未定义内容。"
        )


def validate_transit_details(details: Mapping[str, Any]) -> None:
    """Validate the project-owned T1 detail shape without accepting raw AMap data."""

    if not isinstance(details, Mapping):
        raise TransitEnrichmentDataError("transit_details 必须为对象。")
    _exact_fields(details, _TRANSIT_DETAIL_FIELDS, "transit_details")
    _require_int(details["total_minutes"], "total_minutes", minimum=1)
    conservative = _require_int(
        details["conservative_minutes"], "conservative_minutes", minimum=30
    )
    if conservative % 30:
        raise TransitEnrichmentDataError(
            "transit_details.conservative_minutes 必须按 30 分钟取整。"
        )
    _optional_non_negative_int(details["walking_distance_m"], "walking_distance_m")
    _optional_non_negative_int(details["walking_minutes"], "walking_minutes")
    transfer_count = _require_int(
        details["transfer_count"], "transfer_count", minimum=0
    )

    rides = details["ride_segments"]
    route_segments = details["route_segments"]
    transfers = details["transfers"]
    if not all(
        isinstance(value, list) for value in (rides, route_segments, transfers)
    ):
        raise TransitEnrichmentDataError("公交乘车段、轨迹分段和换乘必须为数组。")
    for index, ride in enumerate(rides):
        if not isinstance(ride, Mapping):
            raise TransitEnrichmentDataError("公交乘车段必须为对象。")
        _exact_fields(ride, _RIDE_FIELDS, f"ride_segments[{index}]")
        if not isinstance(ride["mode"], str) or ride["mode"] not in _RIDE_MODES:
            raise TransitEnrichmentDataError("公交乘车段包含未定义交通方式。")
        for field in ("line_name", "departure_stop", "arrival_stop"):
            _optional_text(ride[field], f"ride_segments[{index}].{field}")
        _optional_non_negative_int(
            ride["duration_minutes"], f"ride_segments[{index}].duration_minutes"
        )
    for index, segment in enumerate(route_segments):
        if not isinstance(segment, Mapping):
            raise TransitEnrichmentDataError("公交轨迹分段必须为对象。")
        _exact_fields(segment, _ROUTE_SEGMENT_FIELDS, f"route_segments[{index}]")
        if not isinstance(segment["mode"], str) or segment["mode"] not in _ROUTE_MODES:
            raise TransitEnrichmentDataError("公交轨迹分段包含未定义交通方式。")
        _optional_text(segment["line_name"], f"route_segments[{index}].line_name")
        path = segment["path"]
        if not isinstance(path, list) or len(path) < 2:
            raise TransitEnrichmentDataError("公交轨迹分段至少需要两个坐标点。")
        for point in path:
            if not isinstance(point, list) or len(point) != 2:
                raise TransitEnrichmentDataError("公交轨迹点必须为经纬度二元数组。")
            longitude, latitude = point
            if (
                any(
                    isinstance(value, bool) or not isinstance(value, (int, float))
                    for value in point
                )
                or not math.isfinite(float(longitude))
                or not math.isfinite(float(latitude))
                or not -180 <= float(longitude) <= 180
                or not -90 <= float(latitude) <= 90
            ):
                raise TransitEnrichmentDataError("公交轨迹点包含无效经纬度。")
    for index, transfer in enumerate(transfers):
        if not isinstance(transfer, Mapping):
            raise TransitEnrichmentDataError("公交换乘必须为对象。")
        _exact_fields(transfer, _TRANSFER_FIELDS, f"transfers[{index}]")
        for field in _TRANSFER_FIELDS:
            _optional_text(transfer[field], f"transfers[{index}].{field}")
    if transfer_count != len(transfers):
        raise TransitEnrichmentDataError(
            "transit_details.transfer_count 与 transfers 数量不一致。"
        )
    if not isinstance(details["summary"], str) or not details["summary"].strip():
        raise TransitEnrichmentDataError("transit_details.summary 不能为空。")


def validate_plan_leg_transit_details(leg: Mapping[str, Any]) -> None:
    """Check mode/null rules and duration consistency for one PlanResponse leg."""

    details = leg.get("transit_details")
    if leg.get("mode") != "public_transit":
        if details is not None:
            raise TransitEnrichmentDataError("非公共交通路段不能包含公交详情。")
        return
    if details is None:
        return
    validate_transit_details(details)
    if leg.get("duration_minutes_raw") != details["total_minutes"]:
        raise TransitEnrichmentDataError("公交原始耗时与路段耗时不一致。")
    if leg.get("duration_minutes_rounded") != details["conservative_minutes"]:
        raise TransitEnrichmentDataError("公交保守耗时与路段耗时不一致。")
    if leg.get("route_summary") != [details["summary"]]:
        raise TransitEnrichmentDataError("公交摘要与路段说明不一致。")


def enriched_transit_leg(
    leg: Mapping[str, Any], details: Mapping[str, Any]
) -> dict[str, Any]:
    """Return one copied public-transit leg populated with validated T1 details."""

    if leg.get("mode") != "public_transit":
        raise TransitEnrichmentDataError("只能向公共交通路段写入公交详情。")
    validate_transit_details(details)
    result = dict(leg)
    result.update(
        {
            "duration_minutes_raw": details["total_minutes"],
            "duration_minutes_rounded": details["conservative_minutes"],
            "route_summary": [details["summary"]],
            "is_estimated": True,
            "transit_details": deepcopy(dict(details)),
        }
    )
    validate_plan_leg_transit_details(result)
    return result
