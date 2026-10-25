"""Normalize AMap transit payloads into a small project-owned route structure."""

from __future__ import annotations

import math
import re
from typing import Any

from .travel_time_rules import reserved_travel_minutes

PUBLIC_TRANSIT_MODES = {"bus", "metro", "railway"}
_TERMINUS_SUFFIX = re.compile(r"^(?P<name>.+?)[（(](?P<termini>[^（）()]*)[）)]$")
_SUBWAY_EXIT_SUFFIX = re.compile(
    r"(?:地铁站|站)?\s*(?:[A-Za-z]?\d+[A-Za-z]?号|[A-Za-z])(?:出)?口$",
    re.IGNORECASE,
)


class TransitRouteDataError(ValueError):
    """Raised when an AMap payload has no usable transit route."""


def _mapping(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _items(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _optional_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    result = value.strip()
    return result or None


def _seconds(value: Any) -> int | None:
    try:
        seconds = int(float(value))
    except (TypeError, ValueError):
        return None
    return seconds if seconds >= 0 else None


def _minutes_from_seconds(value: Any, *, allow_zero: bool = True) -> int | None:
    seconds = _seconds(value)
    if seconds is None or (seconds == 0 and not allow_zero):
        return None
    return math.ceil(seconds / 60)


def _meters(value: Any) -> int | None:
    try:
        meters = int(float(value))
    except (TypeError, ValueError):
        return None
    return meters if meters >= 0 else None


def _polyline_points(value: Any) -> list[list[float]]:
    """Convert one AMap polyline string into bounded GCJ-02 coordinate pairs."""

    if isinstance(value, dict):
        value = value.get("polyline")
    if not isinstance(value, str):
        return []
    points: list[list[float]] = []
    for token in value.split(";"):
        parts = token.strip().split(",")
        if len(parts) != 2:
            continue
        try:
            longitude, latitude = (round(float(part), 6) for part in parts)
        except ValueError:
            continue
        if not (-180 <= longitude <= 180 and -90 <= latitude <= 90):
            continue
        point = [longitude, latitude]
        if not points or points[-1] != point:
            points.append(point)
    return points if len(points) >= 2 else []


def _merged_step_path(value: dict[str, Any]) -> list[list[float]]:
    paths = [
        _polyline_points(_mapping(step).get("polyline"))
        for step in _items(value.get("steps"))
    ]
    if not any(paths):
        return _polyline_points(value.get("polyline"))
    merged: list[list[float]] = []
    for path in paths:
        for point in path:
            if not merged or merged[-1] != point:
                merged.append(point)
    return merged if len(merged) >= 2 else []


def _duration_seconds(value: dict[str, Any]) -> int | None:
    """Read the current v5 walking/bus duration from its cost object."""

    return _seconds(_mapping(value.get("cost")).get("duration"))


def _conservative_minutes(total_minutes: int) -> int:
    return reserved_travel_minutes(total_minutes, mode="public_transit")


def _display_minutes(minutes: int) -> str:
    if minutes >= 60 and minutes % 60 == 0:
        return f"{minutes // 60}小时"
    return f"{minutes}分钟"


def _line_name(value: Any) -> str | None:
    name = _optional_text(value)
    if not name:
        return None
    match = _TERMINUS_SUFFIX.fullmatch(name)
    if not match:
        return name
    termini = match.group("termini")
    if "--" not in termini and "—" not in termini and "－" not in termini:
        return name
    return match.group("name").strip() or name


def _station_name(value: Any) -> str | None:
    name = _optional_text(value)
    if not name:
        return None
    without_exit = _SUBWAY_EXIT_SUFFIX.sub("", name).strip()
    return without_exit or name


def _stop_name(value: Any) -> str | None:
    return _station_name(_mapping(value).get("name"))


def _busline_segment(value: dict[str, Any]) -> dict[str, Any]:
    line_name = _line_name(value.get("name"))
    line_type = _optional_text(value.get("type")) or ""
    mode = "metro" if "地铁" in line_type or (line_name and "地铁" in line_name) else "bus"
    return {
        "mode": mode,
        "line_name": line_name,
        "departure_stop": _stop_name(value.get("departure_stop")),
        "arrival_stop": _stop_name(value.get("arrival_stop")),
        "duration_minutes": _minutes_from_seconds(_duration_seconds(value)),
    }


def _taxi_segment(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": "taxi",
        "line_name": "出租车接驳",
        "departure_stop": _station_name(value.get("startname")),
        "arrival_stop": _station_name(value.get("endname")),
        "duration_minutes": _minutes_from_seconds(value.get("drivetime")),
    }


def _railway_segment(value: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": "railway",
        "line_name": _line_name(value.get("name")) or _optional_text(value.get("trip")),
        "departure_stop": _stop_name(value.get("departure_stop")),
        "arrival_stop": _stop_name(value.get("arrival_stop")),
        "duration_minutes": _minutes_from_seconds(value.get("time")),
    }


def _first_busline(segment: dict[str, Any]) -> dict[str, Any] | None:
    recognized_fields = {
        "id",
        "name",
        "type",
        "departure_stop",
        "arrival_stop",
        "cost",
        "distance",
    }
    for candidate in _items(_mapping(segment.get("bus")).get("buslines")):
        if isinstance(candidate, dict) and recognized_fields.intersection(candidate):
            return candidate
    return None


def _ride_segments(segments: list[Any]) -> list[dict[str, Any]]:
    rides: list[dict[str, Any]] = []
    for value in segments:
        segment = _mapping(value)
        if not segment:
            continue

        taxi = _mapping(segment.get("taxi"))
        if taxi:
            rides.append(_taxi_segment(taxi))

        railway = _mapping(segment.get("railway"))
        if railway:
            rides.append(_railway_segment(railway))

        busline = _first_busline(segment)
        if busline:
            rides.append(_busline_segment(busline))
    return rides


def _route_segments(segments: list[Any]) -> list[dict[str, Any]]:
    """Keep only drawable paths from the selected AMap transit plan."""

    result: list[dict[str, Any]] = []
    for value in segments:
        segment = _mapping(value)
        if not segment:
            continue

        walking_path = _merged_step_path(_mapping(segment.get("walking")))
        if walking_path:
            result.append({"mode": "walk", "line_name": None, "path": walking_path})

        taxi = _mapping(segment.get("taxi"))
        taxi_path = _polyline_points(taxi.get("polyline"))
        if taxi_path:
            result.append(
                {"mode": "taxi", "line_name": "出租车接驳", "path": taxi_path}
            )

        railway = _mapping(segment.get("railway"))
        railway_path = _polyline_points(railway.get("polyline"))
        if railway_path:
            result.append(
                {
                    "mode": "railway",
                    "line_name": _line_name(railway.get("name"))
                    or _optional_text(railway.get("trip")),
                    "path": railway_path,
                }
            )

        busline = _first_busline(segment)
        bus_path = _polyline_points(busline.get("polyline")) if busline else []
        if busline and bus_path:
            line_name = _line_name(busline.get("name"))
            line_type = _optional_text(busline.get("type")) or ""
            mode = (
                "metro"
                if "地铁" in line_type or (line_name and "地铁" in line_name)
                else "bus"
            )
            result.append({"mode": mode, "line_name": line_name, "path": bus_path})
    return result


def _walking_distance(transit: dict[str, Any], segments: list[Any]) -> int | None:
    total = _meters(transit.get("walking_distance"))
    if total is not None:
        return total

    distances = [
        distance
        for value in segments
        if (distance := _meters(_mapping(_mapping(value).get("walking")).get("distance")))
        is not None
    ]
    return sum(distances) if distances else None


def _walking_minutes(segments: list[Any]) -> int | None:
    durations = [
        seconds
        for value in segments
        if (
            seconds := _duration_seconds(_mapping(_mapping(value).get("walking")))
        )
        is not None
    ]
    return math.ceil(sum(durations) / 60) if durations else None


def _transfers(rides: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "from_line_name": first["line_name"],
            "to_line_name": second["line_name"],
            "arrival_stop": first["arrival_stop"],
            "departure_stop": second["departure_stop"],
        }
        for first, second in zip(rides, rides[1:])
        if first["mode"] in PUBLIC_TRANSIT_MODES
        and second["mode"] in PUBLIC_TRANSIT_MODES
    ]


def _walking_summary(distance_m: int | None, minutes: int | None) -> str | None:
    if minutes is not None and minutes > 0:
        return f"步行约{minutes}分钟"
    if distance_m is None or distance_m <= 0:
        return None
    if distance_m < 1000:
        return f"步行约{distance_m}米"
    return f"步行约{distance_m / 1000:.1f}公里"


def _transfer_summaries(transfers: list[dict[str, Any]]) -> list[str]:
    summaries = []
    for transfer in transfers:
        arrival = transfer["arrival_stop"]
        departure = transfer["departure_stop"]
        if arrival and departure and arrival == departure:
            summaries.append(f"在{arrival}换乘")
        elif arrival and departure:
            summaries.append(f"在{arrival}下车，步行至{departure}换乘")
    return summaries


def _route_summary(
    rides: list[dict[str, Any]],
    transfers: list[dict[str, Any]],
    walking_distance_m: int | None,
    walking_minutes: int | None,
    conservative_minutes: int,
) -> str:
    public_lines = [
        ride["line_name"] or "公共交通线路"
        for ride in rides
        if ride["mode"] in PUBLIC_TRANSIT_MODES
    ]
    has_taxi = any(ride["mode"] == "taxi" for ride in rides)

    parts = []
    if public_lines:
        line_summary = "转".join(public_lines)
        parts.append(f"出租车接驳后乘{line_summary}" if has_taxi else line_summary)
    elif has_taxi:
        parts.append("出租车接驳")
    else:
        parts.append("步行方案")

    parts.extend(_transfer_summaries(transfers))
    walking = _walking_summary(walking_distance_m, walking_minutes)
    if walking:
        parts.append(walking)
    parts.append(f"全程约{_display_minutes(conservative_minutes)}")
    return "；".join(parts) + "。"


def normalize_transit_route(payload: Any) -> dict[str, Any]:
    """Convert the first AMap transit plan into the project's concise structure."""

    route = _mapping(_mapping(payload).get("route"))
    transits = _items(route.get("transits"))
    transit_candidates = [
        item for item in transits if isinstance(item, dict) and item
    ]
    if not transit_candidates:
        raise TransitRouteDataError("高德没有返回可用的公共交通方案。")

    transit = None
    total_minutes = None
    for candidate in transit_candidates:
        candidate_minutes = _minutes_from_seconds(
            _mapping(candidate.get("cost")).get("duration"),
            allow_zero=False,
        )
        if candidate_minutes is not None:
            transit = candidate
            total_minutes = candidate_minutes
            break
    if transit is None or total_minutes is None:
        raise TransitRouteDataError("高德返回的公共交通方案缺少有效总时长。")

    conservative_minutes = _conservative_minutes(total_minutes)
    segments = _items(transit.get("segments"))
    rides = _ride_segments(segments)
    walking_distance_m = _walking_distance(transit, segments)
    walking_minutes = _walking_minutes(segments)
    transfers = _transfers(rides)

    return {
        "total_minutes": total_minutes,
        "conservative_minutes": conservative_minutes,
        "walking_distance_m": walking_distance_m,
        "walking_minutes": walking_minutes,
        "transfer_count": len(transfers),
        "ride_segments": rides,
        "route_segments": _route_segments(segments),
        "transfers": transfers,
        "summary": _route_summary(
            rides,
            transfers,
            walking_distance_m,
            walking_minutes,
            conservative_minutes,
        ),
    }
