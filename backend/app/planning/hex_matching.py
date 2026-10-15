"""Actual polyline/polygon intersections, with elapsed time along the chosen path."""

from __future__ import annotations

from typing import Any

from .route_meals import hex_catalog
from .transport import distance_km

EPSILON = 1e-9


def contains(polygon, point) -> bool:
    x, y = point
    inside = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0])
        if abs(cross) < EPSILON and min(a[0], b[0]) - EPSILON <= x <= max(a[0], b[0]) + EPSILON and min(a[1], b[1]) - EPSILON <= y <= max(a[1], b[1]) + EPSILON:
            return True
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def intersection_intervals(polygon, a, b):
    values = [0.0, 1.0]
    dx, dy = b[0] - a[0], b[1] - a[1]
    for p, q in zip(polygon, polygon[1:] + polygon[:1]):
        ex, ey = q[0] - p[0], q[1] - p[1]
        divisor = dx * ey - dy * ex
        if abs(divisor) <= 1e-14:
            continue
        px, py = p[0] - a[0], p[1] - a[1]
        t, u = (px * ey - py * ex) / divisor, (px * dy - py * dx) / divisor
        if -EPSILON <= t <= 1 + EPSILON and -EPSILON <= u <= 1 + EPSILON:
            values.append(max(0.0, min(1.0, t)))
    values = sorted(set(values))
    return [(left, right) for left, right in zip(values, values[1:])
            if contains(polygon, [a[0] + dx * (left + right) / 2, a[1] + dy * (left + right) / 2])]


def _point(location):
    return [location['longitude'], location['latitude']]


def _length(a, b):
    return distance_km({'longitude': a[0], 'latitude': a[1]}, {'longitude': b[0], 'latitude': b[1]})


def route_hex_candidates(leg: dict[str, Any], previous, following, catalog=None):
    catalog = catalog if catalog is not None else hex_catalog()
    results = []
    total = leg['duration_minutes_rounded']
    details = leg.get('path_details')
    ratio = total / max(1, details['total_minutes']) if details else 1

    def point_candidates(location, elapsed, source):
        for area in catalog.values():
            if contains(area['boundary'], _point(location)):
                results.append({'area': area, 'source': source, 'enter': elapsed, 'exit': elapsed})

    point_candidates(previous['location'], 0, 'endpoint')
    point_candidates(following['location'], total, 'endpoint')
    if not details:
        return results
    elapsed = 0.0
    for segment in details['route_segments']:
        duration = segment['duration_minutes'] * ratio
        source = 'walk' if segment['mode'] == 'walk' else 'road'
        # A public-transit passenger cannot stop at every polygon crossed by a ride.
        if leg['mode'] != 'public_transit' or segment['mode'] == 'walk':
            path = segment['path']
            lengths = [_length(a, b) for a, b in zip(path, path[1:])]
            path_length = sum(lengths)
            covered = 0.0
            for a, b, length in zip(path, path[1:], lengths):
                if path_length > 0:
                    for area in catalog.values():
                        if max(a[0], b[0]) < min(p[0] for p in area['boundary']) or min(a[0], b[0]) > max(p[0] for p in area['boundary']) or max(a[1], b[1]) < min(p[1] for p in area['boundary']) or min(a[1], b[1]) > max(p[1] for p in area['boundary']):
                            continue
                        for enter, exit in intersection_intervals(area['boundary'], a, b):
                            results.append({'area': area, 'source': source,
                                            'enter': elapsed + duration * (covered + length * enter) / path_length,
                                            'exit': elapsed + duration * (covered + length * exit) / path_length})
                covered += length
        elapsed += duration
    if leg['mode'] == 'public_transit':
        for stop in details['stops']:
            point_candidates(stop['location'], stop['elapsed_minutes'] * ratio, 'station')
    return results
