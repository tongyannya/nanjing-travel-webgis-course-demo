"""Bounded local repair after day exchanges, with other days frozen."""

from __future__ import annotations

from typing import Any, Callable

from ..data_store import load_attractions
from .nearby_attractions import same_day_bonus
from .rules import is_excluded_by_preferences, score_attraction
from .time_rules import minutes
from .transport import distance_km


MAX_UNRELATED_DETOUR_KM = 3.0


def _visits(day: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in day['items'] if item['type'] == 'attraction']


def _detour(location: dict[str, Any], before: dict[str, Any], after: dict[str, Any]) -> float:
    return max(0.0, distance_km(before, location) + distance_km(location, after)
               - distance_km(before, after))


def _extra_distance(day: dict[str, Any], index: int) -> float:
    visits = _visits(day)
    before = visits[index - 1]['location'] if index else day['start_location']['location']
    after = visits[index + 1]['location'] if index + 1 < len(visits) else day['end_location']['location']
    return _detour(visits[index]['location'], before, after)


def is_unrelated_detour(day: dict[str, Any], attraction_id: str,
                        request: dict[str, Any], attractions: dict[str, dict[str, Any]]) -> bool:
    """Only automatic, unmatched and isolated visits with >3km extra distance."""
    preferences = request['preferences']
    protected = (set(preferences['must_visit_ids']) | set(preferences['interested_ids'])
                 | {lock['attraction_id'] for lock in request['manual_locks']})
    if attraction_id in protected:
        return False
    attraction = attractions[attraction_id]
    if set(attraction.get('tags', [])) & set(preferences['preferred_tags']):
        return False
    visits = _visits(day)
    index = next(index for index, item in enumerate(visits) if item['ref_id'] == attraction_id)
    neighbors = [item for item in visits if item['ref_id'] != attraction_id]
    return (same_day_bonus(attraction['location'], neighbors) == 0
            and _extra_distance(day, index) > MAX_UNRELATED_DETOUR_KM)


def replacement_options(plan: dict[str, Any], request: dict[str, Any], date: str,
                        banned: set[str]) -> list[tuple[str, list[str]]]:
    """Prefer nearby/on-the-way insertions, then extra distance, then score.

    Every option preserves the remaining visit order. This is a candidate list,
    not proof of feasibility; the caller must check scheduling and traffic.
    """
    day = next(day for day in plan['days'] if day['date'] == date)
    preferences = request['preferences']
    protected = set(preferences['must_visit_ids']) | set(preferences['interested_ids'])
    locked_ids = {lock['attraction_id'] for lock in request['manual_locks']}
    selected = {item['ref_id'] for value in plan['days'] for item in _visits(value)}
    keep = [item['ref_id'] for item in _visits(day)]
    locations = ([day['start_location']['location']]
                 + [item['location'] for item in _visits(day)]
                 + [day['end_location']['location']])
    start = next(value['start_time'] for value in request['trip_days'] if value['date'] == date)
    options = []
    for attraction in load_attractions():
        attraction_id = attraction['id']
        if attraction_id in selected | banned | locked_ids:
            continue
        if is_excluded_by_preferences(attraction, set(preferences['excluded_ids']),
                                      set(preferences['excluded_tags']), set(preferences['must_visit_ids'])):
            continue
        affinity = same_day_bonus(attraction['location'], _visits(day))
        tag_match = bool(set(attraction.get('tags', [])) & set(preferences['preferred_tags']))
        score = score_attraction(attraction, preferences, day['start_location']['location'],
                                 minutes(start)) + affinity
        for position in range(len(keep) + 1):
            extra = _detour(attraction['location'], locations[position], locations[position + 1])
            local = bool(affinity) or extra <= MAX_UNRELATED_DETOUR_KM
            if attraction_id not in protected and not tag_match and not local:
                continue
            rank = (attraction_id not in protected, not local, round(extra, 6), -score,
                    attraction_id, position)
            options.append((rank, attraction_id, keep[:position] + [attraction_id] + keep[position:]))
    return [(attraction_id, order) for _, attraction_id, order in sorted(options)]


def valid_replacement(previous: dict[str, Any], candidate: dict[str, Any],
                      request: dict[str, Any], date: str, order: list[str],
                      *, travel_limit: int) -> bool:
    """Check an insertion without altering any other date or existing visit."""
    if len(candidate['days']) != len(previous['days']):
        return False
    orders = {day['date']: [item['ref_id'] for item in _visits(day)] for day in previous['days']}
    orders[date] = order
    actual = {day['date']: [item['ref_id'] for item in _visits(day)] for day in candidate['days']}
    selected = [item for values in actual.values() for item in values]
    if actual != orders or len(selected) != len(set(selected)):
        return False
    if any(old != new for old, new in zip(previous['days'], candidate['days']) if old['date'] != date):
        return False
    locks = lambda plan: {(day['date'], item['ref_id'], item['start_time'])
                          for day in plan['days'] for item in _visits(day) if item.get('locked')}
    if locks(previous) != locks(candidate):
        return False
    meals = lambda plan: {(day['date'], item['meal_kind']) for day in plan['days']
                          for item in day['items'] if item.get('meal_kind')}
    if not meals(previous) <= meals(candidate):
        return False
    warnings = lambda plan: sum('未找到合适真实餐饮便利区，已保留 60 分钟用餐时间。' not in warning
                                for warning in plan['warnings'])
    if warnings(candidate) > warnings(previous):
        return False
    if sum(leg['duration_minutes_rounded'] for day in candidate['days'] for leg in day['legs']) > travel_limit:
        return False
    budget = request['ticket_budget']
    return budget['unlimited'] or candidate['total_ticket_cost'] <= max(previous['total_ticket_cost'], budget['total'])


def repair_affected_days(plan: dict[str, Any], request: dict[str, Any], rebuild: Callable,
                         dates: set[str], *, attempts: int,
                         repair_records: dict[str, Any] | None = None) -> dict[str, Any]:
    """Repair only exchange source days, never rebuilding the whole selection.

    Remove an unrelated detour, then try one useful replacement per removal.
    Trials use fixed visit lists and estimates; no external queries occur here.
    Internal records let actual traffic verification continue failed insertions.
    Other day snapshots must match exactly, including meals and locked times.
    """
    attractions = {item['id']: item for item in load_attractions()}
    preferences = request['preferences']
    protected = (set(preferences['must_visit_ids']) | set(preferences['interested_ids'])
                 | {lock['attraction_id'] for lock in request['manual_locks']})
    selected_before = {item['ref_id'] for day in plan['days'] for item in _visits(day)}
    required = selected_before & protected
    locks = {(day['date'], item['ref_id'], item['start_time'])
             for day in plan['days'] for item in _visits(day) if item.get('locked')}
    travel_limit = sum(leg['duration_minutes_rounded'] for day in plan['days'] for leg in day['legs'])
    original_meals = {(day['date'], item['meal_kind']) for day in plan['days']
                      for item in day['items'] if item.get('meal_kind')}
    warning_count = sum('未找到合适真实餐饮便利区，已保留 60 分钟用餐时间。' not in warning
                        for warning in plan['warnings'])
    budget = request['ticket_budget']
    cost_limit = max(plan['total_ticket_cost'], budget['total'] or 0) if not budget['unlimited'] else None
    best = plan
    removed: set[str] = set()

    def trial(date: str, visits: list[str]) -> dict[str, Any] | None:
        nonlocal attempts
        if attempts <= 0:
            return None
        attempts -= 1
        orders = {day['date']: [item['ref_id'] for item in _visits(day)] for day in best['days']}
        orders[date] = visits
        candidate = rebuild(orders)
        # A fixed-order rebuild can lose an infeasible visit. Do not accept it
        # as a successful insertion or silently change protected visits.
        actual = {day['date']: [item['ref_id'] for item in _visits(day)] for day in candidate['days']}
        if actual != orders:
            return None
        selected = [item for values in actual.values() for item in values]
        if len(selected) != len(set(selected)) or not required <= set(selected):
            return None
        if any(old != new for old, new in zip(best['days'], candidate['days']) if old['date'] != date):
            return None
        candidate_locks = {(day['date'], item['ref_id'], item['start_time'])
                           for day in candidate['days'] for item in _visits(day) if item.get('locked')}
        if candidate_locks != locks:
            return None
        meals = {(day['date'], item['meal_kind']) for day in candidate['days']
                 for item in day['items'] if item.get('meal_kind')}
        if not original_meals <= meals:
            return None
        if sum('未找到合适真实餐饮便利区，已保留 60 分钟用餐时间。' not in warning
               for warning in candidate['warnings']) > warning_count:
            return None
        if sum(leg['duration_minutes_rounded'] for day in candidate['days'] for leg in day['legs']) > travel_limit:
            return None
        if cost_limit is not None and candidate['total_ticket_cost'] > cost_limit:
            return None
        return candidate

    for date in [day['date'] for day in plan['days'] if day['date'] in dates]:
        day = next(day for day in best['days'] if day['date'] == date)
        bad = [item['ref_id'] for item in _visits(day)
               if is_unrelated_detour(day, item['ref_id'], request, attractions)]
        for unwanted in bad:
            day = next(day for day in best['days'] if day['date'] == date)
            if not is_unrelated_detour(day, unwanted, request, attractions):
                continue
            keep = [item['ref_id'] for item in _visits(day) if item['ref_id'] != unwanted]
            candidate = trial(date, keep)
            if candidate is None:
                continue
            best = candidate
            removed.add(unwanted)
            if repair_records is not None:
                record = repair_records.setdefault(date, {
                    'target_count': len(_visits(next(value for value in plan['days'] if value['date'] == date))),
                    'removed_ids': set(),
                })
                record['removed_ids'].add(unwanted)
            for attraction_id, order in replacement_options(best, request, date, removed):
                if attempts <= 0:
                    break
                candidate = trial(date, order)
                if candidate is None:
                    continue
                candidate_day = next(value for value in candidate['days'] if value['date'] == date)
                if is_unrelated_detour(candidate_day, attraction_id, request, attractions):
                    continue
                best = candidate
                if repair_records is not None:
                    repair_records[date].setdefault('replacement_ids', set()).add(attraction_id)
                break
    return best
