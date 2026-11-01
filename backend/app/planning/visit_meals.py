"""Try meals at the next visit endpoint before considering a permitted omission."""

from copy import copy
from typing import Any

from .day_schedule import slot_for_attraction
from .models import DayState
from .meals import meal_start_time
from .transport import estimate_leg, location_payload
from .time_rules import clock
from .meal_endpoints import endpoint_choice


def visit_after_meal(
    state: DayState,
    attraction: dict[str, Any],
    duration: int,
    meal: tuple[str, int, int],
    *,
    deadline: int | None,
    deadline_location: dict[str, Any] | None,
    exact_start: int | None = None,
    diagnostics: list | None = None,
) -> dict[str, Any] | None:
    """Try the locally chosen meal endpoint, then the original arrival meal."""
    selected = endpoint_choice(state, meal[0], attraction['location'])
    locations = [attraction['location']]
    if selected and selected['side'] == 'origin':
        locations.insert(0, state.current_location)
    for meal_location in locations:
        leg = estimate_leg(
            state.current_location, meal_location, state.transport_preference,
            state.items[-1]['item_id'], 'meal_probe',
            travel_details_by_key=state.travel_details_by_key,
            transit_details_by_key=state.transit_details_by_key,
            taxi_fallback_keys=state.taxi_fallback_keys,
            departure_date=state.day['date'],
            departure_time=clock(state.current_time),
            fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
        )
        start = meal_start_time(state, meal[1], leg)
        if start > meal[2]:
            if diagnostics is not None:
                diagnostics.append({'attempt': '先用餐再游览', 'valid': False,
                                    'detail': f'到达后最早{clock(start)}开始用餐，超过该餐最晚开始时间{clock(meal[2])}。'})
            continue
        probe = copy(state)
        probe.current_location = location_payload(meal_location)
        probe.current_time = start + 60
        slot, _ = slot_for_attraction(
            probe, attraction, duration, exact_start=exact_start,
            deadline=deadline, deadline_location=deadline_location,
            diagnostics=diagnostics, attempt='先用餐再游览',
        )
        if slot:
            slot['meal_before_visit'] = {'destination': meal_location, 'start': start}
            return slot
    return None


def visit_skipping_meal(
    state: DayState,
    attraction: dict[str, Any],
    duration: int,
    meal: tuple[str, int, int],
    *,
    deadline: int | None,
    deadline_location: dict[str, Any] | None,
    exact_start: int | None = None,
    diagnostics: list | None = None,
) -> dict[str, Any] | None:
    """Omit only a meal whose available window is consumed by a long visit."""
    if attraction['duration']['suggested_minutes'] < 240:
        return None
    slot, _ = slot_for_attraction(
        state, attraction, duration, exact_start=exact_start,
        deadline=deadline, deadline_location=deadline_location,
        diagnostics=diagnostics, attempt='允许长时游览跳餐的尝试',
    )
    if slot and slot['start'] < meal[2] + 60 and slot['end'] > meal[1]:
        slot['skipped_meal'] = meal[0]
        return slot
    return None
