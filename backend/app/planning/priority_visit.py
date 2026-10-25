"""Reserve a late priority visit before filling its earlier usable time."""

from copy import copy, deepcopy
from dataclasses import dataclass

from ..amap_transport import check_plan_deadline
from .day_schedule import append_attraction, slot_for_attraction
from .meals import schedule_meal_break
from .notices import notice
from .rules import DISTANCE_PENALTY_PER_KM
from .time_rules import opening_intervals
from .transport import distance_km, estimate_leg


def copy_day_state(state):
    result = copy(state)
    result.items = deepcopy(state.items)
    result.legs = deepcopy(state.legs)
    return result


def apply_visit(state, pending, warnings, candidate):
    """Apply a validated visit with its optional preceding or omitted meal."""
    _, attraction, duration, cost, saved_slot = candidate
    slot = deepcopy(saved_slot)
    if 'meal_before_visit' in slot:
        kind, target, latest = pending[0]
        prefix = slot['meal_before_visit']
        if not schedule_meal_break(state, kind, target, latest, deadline=None,
                                   deadline_location=None, destination=prefix['destination'],
                                   fixed_start=prefix['start']):
            return None
        pending.pop(0)
        slot['leg']['from_item_id'] = state.items[-1]['item_id']
    skipped = 'skipped_meal' in slot
    if skipped:
        pending.pop(0)
        label = '午餐' if slot['skipped_meal'] == 'lunch' else '晚餐'
        warnings.append(f"为完成{attraction['name']}的长时间游览，已按你的选择跳过 {state.day['date']} 的{label}（本行程最多一次）。")
    append_attraction(state, attraction, duration, cost, slot, locked=False)
    return skipped


def reserve_meal(state, meal, *, deadline=None, destination=None):
    kind, target, latest = meal
    reserved = schedule_meal_break(state, kind, target, latest, deadline=deadline,
                                   deadline_location=destination)
    if not reserved and kind == 'dinner':
        reserved = schedule_meal_break(state, kind, target, latest, deadline=deadline,
                                       deadline_location=destination,
                                       destination=state.end_location_ref['location'])
    return reserved


@dataclass
class PriorityVisit:
    candidate: tuple
    start: int

    @property
    def attraction(self):
        return self.candidate[1]

    @property
    def cost(self):
        return self.candidate[3]


def place_priority(state, pending, warnings, reservation):
    """Keep earlier meals and the reservation feasible from the current prefix."""
    attraction = reservation.attraction
    while pending and pending[0][1] < reservation.start:
        meal = pending[0]
        if not reserve_meal(state, meal, deadline=reservation.start,
                            destination=attraction['location']):
            return False
        pending.pop(0)
        label = '午餐' if meal[0] == 'lunch' else '晚餐'
        warnings.append(notice('meal_reserved', f"{state.day['date']} 的{label}已预留60分钟，可自由选择餐馆。"))
    slot, _ = slot_for_attraction(state, attraction, reservation.candidate[2],
                                  exact_start=reservation.start,
                                  deadline=pending[0][2] if pending else None)
    if slot is None:
        return False
    append_attraction(state, attraction, reservation.candidate[2], reservation.cost, slot, locked=False)
    return True


def priority_fits(state, pending, reservation, candidate=None):
    probe, meals = copy_day_state(state), list(pending)
    if candidate is not None and apply_visit(probe, meals, [], candidate) is None:
        return False
    if not place_priority(probe, meals, [], reservation):
        return False
    return all(reserve_meal(probe, meal) for meal in meals)


def reserve_first_priority(state, candidate, pending, preferences):
    """Prefer a feasible late afternoon slot when a distant first visit would wait."""
    _, attraction, duration, _cost, slot = candidate
    if (state.attraction_count or state.current_time >= 13 * 60 or
        attraction['id'] not in set(preferences['must_visit_ids']) | set(preferences['interested_ids'])):
        return None
    incoming = estimate_leg(state.current_location, attraction['location'],
                             state.transport_preference, '', '',
                             travel_details_by_key=state.travel_details_by_key,
                             transit_details_by_key=state.transit_details_by_key,
                             taxi_fallback_keys=state.taxi_fallback_keys,
                             fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi)
    distance_penalty = distance_km(state.current_location, attraction['location']) * DISTANCE_PENALTY_PER_KM
    earliest = state.current_time + incoming['duration_minutes_rounded'] + (60 if 'meal_before_visit' in slot else 0)
    if distance_penalty <= 50 and slot['start'] <= earliest:
        return None
    latest = min(state.day_end - duration,
                 max((min(closing - duration, last_entry) for _, closing, last_entry in
                      opening_intervals(attraction, state.visit_date)), default=-1))
    for start in range(latest, max(13 * 60, state.current_time) - 1, -10):
        check_plan_deadline()
        reservation = PriorityVisit(candidate, start)
        if priority_fits(state, pending, reservation):
            return reservation
    return None
