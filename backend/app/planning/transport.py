"""Local conservative distance and travel-time estimates used during planning."""

from __future__ import annotations

import math
from typing import AbstractSet, Any, Mapping

from .transit_enrichment import (
    TransitQueryKey,
    enriched_transit_leg,
    transit_query_key,
)

MAX_PUBLIC_TRANSIT_MINUTES = 90
MAX_PUBLIC_TRANSIT_WALKING_MINUTES = 40


def transit_requires_taxi(details: Mapping[str, Any]) -> bool:
    return (details['total_minutes'] > MAX_PUBLIC_TRANSIT_MINUTES or
            (details.get('walking_minutes') or 0) > MAX_PUBLIC_TRANSIT_WALKING_MINUTES)


def location_payload(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "longitude": value["longitude"],
        "latitude": value["latitude"],
        "coord_system": "GCJ-02",
    }


def distance_km(first: dict[str, Any], second: dict[str, Any]) -> float:
    lat1 = math.radians(first["latitude"])
    lat2 = math.radians(second["latitude"])
    delta_lat = lat2 - lat1
    delta_lon = math.radians(second["longitude"] - first["longitude"])
    value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    return 6371.0 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def _rounded_half_hour(raw_minutes: int) -> int:
    if raw_minutes <= 0:
        return 0
    return int(math.ceil(raw_minutes / 30) * 30)


def estimate_leg(
    first: dict[str, Any],
    second: dict[str, Any],
    transport_preference: str,
    from_item_id: str,
    to_item_id: str,
    *,
    travel_details_by_key: Mapping[tuple, Mapping[str, Any]] | None = None,
    transit_details_by_key: Mapping[
        TransitQueryKey, Mapping[str, Any]
    ] | None = None,
    taxi_fallback_keys: AbstractSet[TransitQueryKey] | None = None,
    fallback_missing_transit_to_taxi: bool = False,
) -> dict[str, Any]:
    distance = distance_km(first, second)
    transit_key = (
        transit_query_key(first, second)
        if transport_preference == "public_transit"
        else None
    )
    transit_details = (
        transit_details_by_key.get(transit_key)
        if transit_key is not None and transit_details_by_key
        else None
    )
    use_taxi_fallback = transit_key is not None and (
        transit_key in (taxi_fallback_keys or ())
        or (transit_details is not None and transit_requires_taxi(transit_details))
        or (fallback_missing_transit_to_taxi and transit_details is None)
    )
    if distance < 0.05:
        mode = "walk"
        raw = 0
    elif distance <= 1.2:
        mode = "walk"
        estimated_walk_minutes = math.ceil(distance / 4.5 * 60)
        raw = 0 if estimated_walk_minutes < 5 else estimated_walk_minutes
    elif use_taxi_fallback:
        mode = "taxi"
        raw = max(5, math.ceil(distance / 28 * 60))
    elif transport_preference == "public_transit":
        mode = "public_transit"
        raw = max(20, math.ceil(distance / 20 * 60 + 15))
    elif transport_preference == "taxi":
        mode = "taxi"
        raw = max(5, math.ceil(distance / 28 * 60))
    else:
        mode = "self_drive"
        raw = max(5, math.ceil(distance / 26 * 60))
    rounded = _rounded_half_hour(raw)
    labels = {
        "walk": "短距离步行保守估算",
        "public_transit": "公共交通优先保守估算",
        "taxi": "出租车优先估算",
        "self_drive": "自驾优先估算",
    }
    if use_taxi_fallback and mode == "taxi":
        labels["taxi"] = "公共交通无可用结果、超过 90 分钟或步行超过 40 分钟，已改用出租车估算"
    leg = {
        "from_item_id": from_item_id,
        "to_item_id": to_item_id,
        "mode": mode,
        "duration_minutes_raw": raw,
        "duration_minutes_rounded": rounded,
        "route_summary": [labels[mode], f"两点直线距离约 {distance:.1f} 公里"],
        "is_estimated": True,
        "transit_details": None,
    }
    if mode == "public_transit" and transit_details is not None:
        leg = enriched_transit_leg(leg, transit_details)
    key = (mode, *transit_query_key(first, second))
    actual = (travel_details_by_key or {}).get(key)
    if actual is not None:
        if mode == 'public_transit' and actual.get('transit_details') is not None:
            leg = enriched_transit_leg(leg, actual['transit_details'])
        else:
            raw = int(actual['estimated_minutes'])
            rounded = 0 if mode == 'walk' and int(actual['raw_minutes']) < 5 else _rounded_half_hour(raw)
            leg.update(duration_minutes_raw=int(actual['raw_minutes']),
                       duration_minutes_rounded=rounded, is_estimated=False,
                       route_summary=[actual['display']])
        leg['path_details'] = actual.get('path_details')
    return leg
