"""Bounded grouping and ordering, followed by protected local replacements."""

from __future__ import annotations

from itertools import islice, permutations
from typing import Any, Callable

from .transport import distance_km
from .nearby_attractions import location_affinity, split_penalty
from .day_repair import repair_affected_days
from .notices import constraint_warning_count


def visit_orders(plan: dict[str, Any]) -> dict[str, list[str]]:
    return {day['date']: [item['ref_id'] for item in day['items'] if item['type'] == 'attraction']
            for day in plan['days']}


def route_cost(plan: dict[str, Any]) -> tuple[int, float]:
    travel = sum(leg['duration_minutes_rounded'] for day in plan['days'] for leg in day['legs'])
    distance = sum(distance_km(a['location'], b['location'])
                   for day in plan['days'] for a, b in zip(day['items'], day['items'][1:]))
    return travel, round(distance, 6)


def grouping_cost(plan: dict[str, Any]) -> tuple[float, int, float]:
    """Combine estimated travel with a bounded soft penalty for split neighbors."""
    travel, distance = route_cost(plan)
    return round(travel + split_penalty(plan), 6), travel, distance


def _meal_slots(plan: dict[str, Any]) -> set[tuple[str, str]]:
    return {(day['date'], item['meal_kind']) for day in plan['days']
            for item in day['items'] if item.get('meal_kind')}


def _constraint_warning_count(plan: dict[str, Any]) -> int:
    # Arrival-before-meal and standalone meals emit different informational
    # messages for the same valid reservation. Do not reject a better route
    # because the latter happens to report its preserved meal explicitly.
    return constraint_warning_count(plan)


def optimize_visit_order(plan: dict[str, Any], rebuild: Callable,
                         *, request: dict[str, Any] | None = None,
                         repair_records: dict[str, Any] | None = None) -> dict[str, Any]:
    best = plan
    target = sorted(item for values in visit_orders(plan).values() for item in values)
    locks = {(day['date'], item['ref_id'], item['start_time'])
             for day in plan['days'] for item in day['items'] if item.get('locked')}
    budget = 100
    repair_reserve = 20 if request is not None else 0
    affected_dates: set[str] = set()
    grouped_dates: set[str] = set()
    original_travel = route_cost(plan)[0]
    original_meals = _meal_slots(plan)
    seen = {tuple((date, tuple(values)) for date, values in visit_orders(plan).items())}

    def consider(orders: dict[str, list[str]], *, repair_date: str | None = None,
                 grouped_date: str | None = None) -> None:
        nonlocal best, budget
        signature = tuple((date, tuple(values)) for date, values in orders.items())
        if budget <= 0 or signature in seen:
            return
        seen.add(signature)
        budget -= 1
        candidate = rebuild(orders)
        visits = visit_orders(candidate)
        if sorted(item for values in visits.values() for item in values) != target:
            return
        candidate_locks = {(day['date'], item['ref_id'], item['start_time'])
                           for day in candidate['days'] for item in day['items'] if item.get('locked')}
        if candidate_locks != locks or _constraint_warning_count(candidate) > _constraint_warning_count(plan):
            return
        if not original_meals <= _meal_slots(candidate):
            return
        if route_cost(candidate)[0] > original_travel:
            return
        if grouping_cost(candidate) < grouping_cost(best):
            best = candidate
            if repair_date:
                affected_dates.add(repair_date)
            if grouped_date:
                grouped_dates.add(grouped_date)

    locked_ids = {item for _, item, _ in locks}
    locations = {item['ref_id']: item['location'] for day in plan['days']
                 for item in day['items'] if item['type'] == 'attraction'}
    neighbors = sorted(
        ((location_affinity(locations[a], locations[b]), a, b)
         for index, a in enumerate(target) for b in target[index + 1:]
         if location_affinity(locations[a], locations[b]) > 0),
        reverse=True,
    )
    # Prioritize actual split neighbors across ANY dates. A move can merge a
    # two-visit day with a one-visit day; exchanges alone cannot do that.
    for _ in range(3):
        previous = best
        for _, a, b in neighbors:
            for moving, anchor in ((a, b), (b, a)):
                orders = visit_orders(best)
                first = next(date for date, ids in orders.items() if moving in ids)
                second = next(date for date, ids in orders.items() if anchor in ids)
                if first == second or moving in locked_ids:
                    continue
                position = orders[second].index(anchor)
                for destination in (position, position + 1):
                    if budget <= 40 + repair_reserve:
                        break
                    trial = {date: list(ids) for date, ids in orders.items()}
                    trial[first].remove(moving)
                    trial[second].insert(destination, moving)
                    consider(trial, repair_date=first, grouped_date=second)
                for replaced in orders[second]:
                    if budget <= 40 + repair_reserve:
                        break
                    if replaced == anchor or replaced in locked_ids:
                        continue
                    trial = {date: list(ids) for date, ids in orders.items()}
                    trial[first][trial[first].index(moving)] = replaced
                    trial[second][trial[second].index(replaced)] = moving
                    consider(trial, repair_date=first, grouped_date=second)
        if best is previous or budget <= 40 + repair_reserve:
            break

    # Retain general adjacent-day exchanges for travel improvements; preserve
    # at least 30 rebuilds for ordering within the resulting days.
    dates = list(visit_orders(best))
    for first, second in zip(dates, dates[1:]):
        orders = visit_orders(best)
        for a in orders[first]:
            for b in orders[second]:
                if budget <= 30 + repair_reserve:
                    break
                if a in locked_ids or b in locked_ids:
                    continue
                trial = {date: list(values) for date, values in visit_orders(best).items()}
                if a not in trial[first] or b not in trial[second]:
                    continue
                trial[first][trial[first].index(a)] = b
                trial[second][trial[second].index(b)] = a
                consider(trial, repair_date=first)
    # Share the remaining allowance across days, including days with >2 visits.
    for index, (date, values) in enumerate(visit_orders(best).items()):
        allowance = min(32, max(0, (budget - repair_reserve) // (len(dates) - index)))
        for order in islice(permutations(values), allowance):
            trial = {key: list(value) for key, value in visit_orders(best).items()}
            trial[date] = list(order)
            consider(trial)
    if request is not None:
        # Repair after grouping/order settle, then freeze every other day.
        # Never feed the repaired selection back into swaps or external queries.
        best = repair_affected_days(best, request, rebuild,
                                   affected_dates - grouped_dates, attempts=repair_reserve,
                                   repair_records=repair_records)
    return best
