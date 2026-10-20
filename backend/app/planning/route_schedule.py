"""Recheck a chosen route without selecting new visits or optimizing again."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .route_order import visit_orders
from .schedule import build_plan
from .notices import notice, traffic_removal_notices


def reschedule_fixed_routes(request: dict[str, Any], response: dict[str, Any], *,
                            repaired_days: set[tuple[str, str]],
                            repair_records: dict[str, dict[str, Any]] | None = None,
                            **traffic) -> dict[str, Any]:
    """Keep feasible days' order and repair only conflicting days.

    Each day permits at most one accepted local move; later repairs only remove
    visits, so orders cannot oscillate. No new attractions are selected.
    Optional predecessors yield to must-visits and fixed response nodes.
    Existing opening, budget, meal and endpoint rules remain in build_plan.
    """
    result = deepcopy(response)
    locked_ids = {item['ref_id'] for plan in response['plans'] for day in plan['days']
                  for item in day['items'] if item.get('locked')}
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
        warnings = traffic_removal_notices(previous)
        if removed:
            names = '、'.join(item['name'] for item in removed)
            warnings.append(notice('traffic_removed', f'核对交通与开放时间后，{names}未能安排。'))
            if repair_records is not None:
                records = repair_records.setdefault(previous['plan_type'], {})
                for day in previous['days']:
                    lost = {item['ref_id'] for item in day['items']
                            if item['type'] == 'attraction' and item['ref_id'] not in kept}
                    if not lost:
                        continue
                    count = sum(item['type'] == 'attraction' for item in day['items'])
                    record = records.setdefault(day['date'], {'target_count': count, 'removed_ids': set()})
                    record['target_count'] = max(record['target_count'], count)
                    record['removed_ids'].update(lost)
                    record['traffic_removed'] = True
        plan['warnings'] = list(dict.fromkeys([*plan['warnings'], *warnings]))
        result['plans'][index] = plan
    return result
