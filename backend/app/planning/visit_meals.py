"""Try meals at the next visit endpoint before considering a permitted omission."""

from copy import copy
from typing import Any

from .day_schedule import slot_for_attraction
from .models import DayState
from .meals import meal_start_time
from .transport import estimate_leg, location_payload


def visit_after_meal(
    state: DayState,
    attraction: dict[str, Any],
    duration: int,
    meal: tuple[str, int, int],
    *,
    deadline: int | None,
    deadline_location: dict[str, Any] | None,
    exact_start: int | None = None,
) -> dict[str, Any] | None:
    """Probe travel, an hour near the attraction, then a legal uninterrupted visit."""
    leg = estimate_leg(
        state.current_location, attraction['location'], state.transport_preference,
        state.items[-1]['item_id'], 'meal_probe',
        travel_details_by_key=state.travel_details_by_key,
        transit_details_by_key=state.transit_details_by_key,
        taxi_fallback_keys=state.taxi_fallback_keys,
        fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
    )
    start = meal_start_time(state, meal[1], leg)
    if start > meal[2]:
        return None
    probe = copy(state)
    probe.current_location = location_payload(attraction['location'])
    probe.current_time = start + 60
    slot, _ = slot_for_attraction(
        probe, attraction, duration, exact_start=exact_start,
        deadline=deadline, deadline_location=deadline_location,
    )
    if slot:
        slot['meal_before_visit'] = {'destination': attraction['location'], 'start': start}
    return slot


def visit_skipping_meal(
    state: DayState,
    attraction: dict[str, Any],
    duration: int,
    meal: tuple[str, int, int],
    *,
    deadline: int | None,
    deadline_location: dict[str, Any] | None,
    exact_start: int | None = None,
) -> dict[str, Any] | None:
    """Omit only a meal whose available window is consumed by a long visit."""
    if attraction['duration']['suggested_minutes'] < 240:
        return None
    slot, _ = slot_for_attraction(
        state, attraction, duration, exact_start=exact_start,
        deadline=deadline, deadline_location=deadline_location,
    )
    if slot and slot['start'] < meal[2] + 60 and slot['end'] > meal[1]:
        slot['skipped_meal'] = meal[0]
        return slot
    return None
