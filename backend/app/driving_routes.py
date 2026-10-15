"""Normalize AMap driving payloads into drawable project-owned road routes."""

from __future__ import annotations

from typing import Any, Literal


DrivingMode = Literal["taxi", "self_drive"]


class DrivingRouteDataError(ValueError):
    """Raised when an AMap driving path has no usable road geometry."""


def _polyline_points(value: Any) -> list[list[float]]:
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


def _merged_path(path: dict[str, Any]) -> list[list[float]]:
    merged: list[list[float]] = []
    steps = path.get("steps") if isinstance(path.get("steps"), list) else []
    for step in steps:
        if not isinstance(step, dict):
            continue
        for point in _polyline_points(step.get("polyline")):
            if not merged or merged[-1] != point:
                merged.append(point)
    if len(merged) >= 2:
        return merged
    return _polyline_points(path.get("polyline"))


def normalize_driving_route(
    path: dict[str, Any], *, mode: DrivingMode, total_minutes: int
) -> dict[str, Any]:
    """Return the selected driving path without exposing raw AMap fields."""

    route_path = _merged_path(path)
    if not route_path:
        raise DrivingRouteDataError("高德返回的道路方案缺少可绘制轨迹。")
    mode_label = "出租车" if mode == "taxi" else "自驾"
    return {
        "total_minutes": total_minutes,
        "route_segments": [
            {
                "mode": mode,
                "line_name": f"{mode_label}道路路线",
                "path": route_path,
            }
        ],
        "summary": f"{mode_label}道路路线；预计行驶{total_minutes}分钟。",
    }
