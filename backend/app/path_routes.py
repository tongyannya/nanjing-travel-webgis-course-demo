"""Normalize actual transport geometry and accessible boarding/alighting locations."""

from __future__ import annotations

import math
from typing import Any

from .transit_routes import _mapping, _items, _merged_step_path, _polyline_points, _duration_seconds


def _coordinate(value: Any) -> dict[str, Any] | None:
    if isinstance(value, str):
        try:
            lon, lat = (float(part) for part in value.split(','))
            if math.isfinite(lon) and math.isfinite(lat) and 118 <= lon <= 119.3 and 31.2 <= lat <= 32.7:
                return {'longitude': lon, 'latitude': lat, 'coord_system': 'GCJ-02'}
        except (ValueError, TypeError):
            pass
    return None


def normalize_path_details(payload: dict[str, Any], mode: str, total_minutes: int) -> dict[str, Any]:
    route = _mapping(payload.get('route'))
    segments, stops = [], []
    elapsed = 0.0

    def append_segment(raw: dict[str, Any], kind: str, name: str | None = None) -> None:
        nonlocal elapsed
        path = _merged_step_path(raw)
        duration = (_duration_seconds(raw) or _seconds(raw.get('duration'))) / 60
        if path:
            segments.append({'mode': kind, 'line_name': name, 'path': path, 'duration_minutes': duration})
        elapsed += duration

    def append_stop(raw: Any, when: float) -> None:
        raw = _mapping(raw)
        location = _coordinate(raw.get('location'))
        if location:
            stops.append({'name': str(raw.get('name') or '车站'), 'location': location, 'elapsed_minutes': when})

    if mode == 'public_transit':
        transits = _items(route.get('transits'))
        for raw in _items(_mapping(transits[0] if transits else {}).get('segments')):
            raw = _mapping(raw)
            append_segment(_mapping(raw.get('walking')), 'walk')
            buslines = _items(_mapping(raw.get('bus')).get('buslines'))
            if buslines:
                line = _mapping(buslines[0])
                kind = 'metro' if '地铁' in str(line.get('type', '')) + str(line.get('name', '')) else 'bus'
                append_stop(line.get('departure_stop'), elapsed)
                append_segment(line, kind, line.get('name'))
                append_stop(line.get('arrival_stop'), elapsed)
            railway = _mapping(raw.get('railway'))
            if railway:
                append_stop(railway.get('departure_stop'), elapsed)
                append_segment(railway, 'railway', railway.get('name'))
                append_stop(railway.get('arrival_stop'), elapsed)
            taxi = _mapping(raw.get('taxi'))
            if taxi:
                append_segment(taxi, 'taxi', '出租车接驳')
    else:
        paths = _items(route.get('paths'))
        if paths:
            append_segment(_mapping(paths[0]), mode)
    if not segments:
        raise ValueError('交通方案缺少可用于匹配蜂巢的实际路径。')
    # Normalize component times to the selected route duration. Geometry never changes.
    measured = sum(segment['duration_minutes'] for segment in segments)
    if measured > 0:
        factor = total_minutes / measured
        for segment in segments:
            segment['duration_minutes'] *= factor
        for stop in stops:
            stop['elapsed_minutes'] *= factor
    elif len(segments) == 1:
        segments[0]['duration_minutes'] = total_minutes
    else:
        raise ValueError('交通方案缺少可用的分段耗时。')
    return {'mode': mode, 'total_minutes': total_minutes, 'route_segments': segments, 'stops': stops}


def _seconds(value: Any) -> int:
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return 0
