"""Regroup split neighbors into gaps left by actual-route validation."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Callable

from ..amap_transport import check_plan_deadline
from .nearby_attractions import same_day_bonus
from .route_order import grouping_cost, visit_orders
from .schedule import build_plan
from .notices import constraint_warning_count, traffic_removal_notices

MAX_GROUPING_PROBES = 32
MAX_ACTUAL_GROUPINGS = 8


def _valid_move(previous, candidate, request, orders, dates, travel_limit):
    if visit_orders(candidate) != orders:
        return False
    if any(old != new for old, new in zip(previous['days'], candidate['days'])
           if old['date'] not in dates):
        return False
    locks = lambda plan: {(day['date'], item['ref_id'], item['start_time'])
                          for day in plan['days'] for item in day['items'] if item.get('locked')}
    meals = lambda plan: {(day['date'], item['meal_kind']) for day in plan['days']
                          for item in day['items'] if item.get('meal_kind')}
    budget = request['ticket_budget']
    return (locks(previous) == locks(candidate)
            and meals(previous) <= meals(candidate)
            and constraint_warning_count(candidate, ignore_traffic_removals=True) <= constraint_warning_count(previous, ignore_traffic_removals=True)
            and sum(leg['duration_minutes_rounded'] for day in candidate['days'] for leg in day['legs']) <= travel_limit
            and (budget['unlimited'] or candidate['total_ticket_cost'] <= max(previous['total_ticket_cost'], budget['total']))
            and grouping_cost(candidate) < grouping_cost(previous))


async def regroup_traffic_gaps(request: dict[str, Any], response: dict[str, Any], records,
                               *, traffic: Callable, verify_routes: Callable, travel_limits):
    """Move existing neighbors first, then let the caller refill remaining slots.

    Only dates losing visits to actual traffic receive neighbors. Every existing
    visit, lock and meal survives; both changed days require actual route checks.
    Rejected probes never replace the current plan or consume a second query budget.
    """
    result = deepcopy(response)
    locked = {item['ref_id'] for plan in response['plans'] for day in plan['days']
              for item in day['items'] if item.get('locked')}
    probes = actual_probes = 0
    for index, initial in enumerate(response['plans']):
        plan_type = initial['plan_type']
        plan_records = records.setdefault(plan_type, {})
        affected = [(date, record) for date, record in plan_records.items() if record.get('traffic_removed')]
        for date, record in affected:
            while len(visit_orders(result['plans'][index])[date]) < record['target_count']:
                previous = result['plans'][index]
                orders = visit_orders(previous)
                day = next(day for day in previous['days'] if day['date'] == date)
                neighbors = [item for item in day['items'] if item['type'] == 'attraction']
                candidates = []
                for source in previous['days']:
                    if source['date'] == date:
                        continue
                    for item in source['items']:
                        attraction_id = item['ref_id']
                        if item['type'] != 'attraction' or attraction_id in locked:
                            continue
                        if not same_day_bonus(item['location'], neighbors):
                            continue
                        for position in range(len(orders[date]) + 1):
                            check_plan_deadline()
                            if probes >= MAX_GROUPING_PROBES:
                                break
                            probes += 1
                            trial = {key: list(values) for key, values in orders.items()}
                            trial[source['date']].remove(attraction_id)
                            trial[date].insert(position, attraction_id)
                            candidate = build_plan(plan_type, request, visit_sequences=trial,
                                                   preserve_visit_order=True, **traffic())
                            dates = {date, source['date']}
                            if _valid_move(previous, candidate, request, trial, dates, travel_limits[plan_type]):
                                candidates.append((grouping_cost(candidate), source['date'], attraction_id, trial, candidate))
                inserted = False
                for _, source, attraction_id, trial, candidate in sorted(candidates, key=lambda value: value[:3]):
                    check_plan_deadline()
                    if actual_probes >= MAX_ACTUAL_GROUPINGS:
                        break
                    actual_probes += 1
                    verified = True
                    for changed in (date, source):
                        outcome = await verify_routes(candidate, changed)
                        if outcome is not True:
                            verified = False
                            if outcome is None:
                                actual_probes = MAX_ACTUAL_GROUPINGS
                            break
                    if not verified:
                        continue
                    candidate = build_plan(plan_type, request, visit_sequences=trial,
                                           preserve_visit_order=True, **traffic())
                    if not _valid_move(previous, candidate, request, trial, {date, source}, travel_limits[plan_type]):
                        continue
                    candidate['warnings'] = list(dict.fromkeys([
                        *candidate['warnings'], *traffic_removal_notices(previous),
                    ]))
                    result['plans'][index] = candidate
                    source_record = plan_records.setdefault(source, {
                        'target_count': len(orders[source]), 'removed_ids': set(),
                    })
                    source_record['removed_ids'].add(attraction_id)
                    inserted = True
                    break
                if not inserted:
                    if candidates and actual_probes >= MAX_ACTUAL_GROUPINGS:
                        previous['warnings'].append(f'{date}：邻近景点合并核对达到本次查询或尝试上限，保留当前安排。')
                    break
    return result
