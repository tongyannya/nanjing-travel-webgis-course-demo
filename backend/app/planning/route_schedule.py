"""Recheck a chosen route without selecting new visits or optimizing again."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .route_order import visit_orders
from .schedule import build_plan


def reschedule_fixed_routes(request: dict[str, Any], response: dict[str, Any], *,
                            repaired_days: set[tuple[str, str]], **traffic) -> dict[str, Any]:
    """Keep feasible days' order and repair only conflicting days.

    Each day permits at most one accepted local move; later repairs only remove
    visits, so orders cannot oscillate. No new attractions are selected.
    Optional predecessors yield to must-visits and manual locks.
    Existing opening, budget, meal, lock and endpoint rules remain in build_plan.
    """
    result = deepcopy(response)
    locked_ids = {lock['attraction_id'] for lock in request['manual_locks']}
    mandatory = set(request['preferences']['must_visit_ids']) | locked_ids
    for index, previous in enumerate(response['plans']):
        orders = visit_orders(previous)
        while True:
            plan = build_plan(previous['plan_type'], request, visit_sequences=orders,
                              preserve_visit_order=True, **traffic)
            kept = {item for ids in visit_orders(plan).values() for item in ids}
            missing = [(date, attraction_id) for date, ids in orders.items()
                       for attraction_id in ids if attraction_id not in kept]
            if not missing:
                break
            # An earlier optional visit must not consume a required visit's slot.
            date, attraction_id = next((entry for entry in missing if entry[1] in mandatory), missing[0])
            repair_key = (previous['plan_type'], date)
            if repair_key not in repaired_days:
                repaired_days.add(repair_key)
                original = orders[date]
                position = original.index(attraction_id)
                # Only the conflicting visit moves; all others retain their
                # relative order. A manual lock never moves in this probe.
                if attraction_id not in locked_ids:
                    for destination in sorted(range(len(original)), key=lambda value: abs(value - position)):
                        if destination == position:
                            continue
                        moved = list(original)
                        moved.insert(destination, moved.pop(position))
                        candidate_orders = {**orders, date: moved}
                        candidate = build_plan(previous['plan_type'], request, visit_sequences=candidate_orders,
                                               preserve_visit_order=True, **traffic)
                        if set(visit_orders(candidate)[date]) == set(original):
                            orders = candidate_orders
                            break
                    if orders[date] != original:
                        continue
            predecessors = orders[date][:orders[date].index(attraction_id)]
            optional = [value for value in predecessors if value not in mandatory]
            removed = optional[-1] if attraction_id in mandatory and optional else attraction_id
            orders[date].remove(removed)

        removed = [item for day in previous['days'] for item in day['items']
                   if item['type'] == 'attraction' and item['ref_id'] not in kept]
        warnings = [value for value in previous['warnings'] if value.startswith('核对交通与开放时间后，')]
        if removed:
            names = '、'.join(item['name'] for item in removed)
            warnings.append(f'核对交通与开放时间后，{names}未能安排。')
        plan['warnings'] = list(dict.fromkeys([*plan['warnings'], *warnings]))
        result['plans'][index] = plan
    return result
