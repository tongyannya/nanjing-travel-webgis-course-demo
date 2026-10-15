"""Coordinate-based affinity for same-day visits, without permanent score changes."""

from __future__ import annotations

from typing import Any, Iterable

from .transport import distance_km


NEARBY_FULL_BONUS_KM = 0.5
NEARBY_LIMIT_KM = 2.0
NEARBY_MAX_BONUS = 300.0
SPLIT_PENALTY_MINUTES = 30.0


def location_affinity(first: dict[str, Any], second: dict[str, Any]) -> float:
    """Full affinity within 500m, tapering to zero at 2km (straight line)."""
    distance = distance_km(first, second)
    if distance <= NEARBY_FULL_BONUS_KM:
        return NEARBY_MAX_BONUS
    return max(0.0, NEARBY_MAX_BONUS * (NEARBY_LIMIT_KM - distance)
               / (NEARBY_LIMIT_KM - NEARBY_FULL_BONUS_KM))


def same_day_bonus(location: dict[str, Any], visits: Iterable[dict[str, Any]]) -> float:
    """Use only the closest scheduled attraction; lodging/meals are not anchors."""
    return max((location_affinity(location, item['location'])
                for item in visits if item['type'] == 'attraction'), default=0.0)


def split_penalty(plan: dict[str, Any]) -> float:
    """Soft cost of separated neighbors, capped per attraction in dense areas.

    Each attraction contributes its strongest cross-day relationship once.
    Dividing by two avoids counting an isolated pair twice. This is a ranking
    penalty, not extra travel time written into the public response.
    """
    visits = [(day['date'], item) for day in plan['days'] for item in day['items']
              if item['type'] == 'attraction']
    loss = sum(max((location_affinity(item['location'], other['location'])
                    for other_date, other in visits if other_date != date), default=0.0)
               for date, item in visits)
    return loss / (2 * NEARBY_MAX_BONUS) * SPLIT_PENALTY_MINUTES
