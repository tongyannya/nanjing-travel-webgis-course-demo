"""Bounded grouping and ordering, followed by protected local replacements."""

from __future__ import annotations

from itertools import islice, permutations
from typing import Any, Callable

from .transport import distance_km
from .nearby_attractions import location_affinity, split_penalty
from .day_repair import repair_affected_days
from .notices import constraint_warning_count
from .trace import emit, tracing, plan_snapshot
from .time_rules import minutes


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
                         repair_records: dict[str, Any] | None = None,
                         priority_reservations: dict[str, set[str]] | None = None,
                         same_day_only: bool = False) -> dict[str, Any]:
    best = plan
    target = sorted(item for values in visit_orders(plan).values() for item in values)
    locks = {(day['date'], item['ref_id'], item['start_time'])
             for day in plan['days'] for item in day['items'] if item.get('locked')}
    limit = 32 if same_day_only else 100
    budget = limit
    repair_reserve = 20 if request is not None and not same_day_only else 0
    affected_dates: set[str] = set()
    grouped_dates: set[str] = set()
    original_travel = route_cost(plan)[0]
    original_meals = _meal_slots(plan)
    trace_names = {item['ref_id']: item['name'] for day in plan['days'] for item in day['items'] if item['type'] == 'attraction'} if tracing() else {}
    if tracing():
        emit('optimization', (f"{plan['days'][0]['date']}：开始优化重排当天的游览顺序" if same_day_only else
                              '初排完成，开始比较相近景点跨日交换与同日游览顺序'),
             scope='same_day' if same_day_only else 'global',
             plans=[plan_snapshot(plan)], function='optimize_visit_order')
    seen = {tuple((date, tuple(values)) for date, values in visit_orders(plan).items())}

    def consider(orders: dict[str, list[str]], *, repair_date: str | None = None,
                 grouped_date: str | None = None, optimization_kind: str = 'same_day_order') -> None:
        nonlocal best, budget
        signature = tuple((date, tuple(values)) for date, values in orders.items())
        if budget <= 0 or signature in seen:
            return
        seen.add(signature)
        budget -= 1
        candidate = rebuild(orders)
        def report(accepted, reason):
            if tracing():
                label = '跨天邻近景点交换' if optimization_kind == 'cross_day_nearby_exchange' else '同天内部顺序调整'
                emit('optimization', f"第{limit - budget}次比较（{label}）：{'采用调整' if accepted else '保留原安排'}", accepted=accepted,
                     optimization_kind=optimization_kind,
                     scope='same_day' if same_day_only else 'global',
                     message=reason, trial_orders={date: [trace_names.get(value, value) for value in ids] for date, ids in orders.items()},
                     before_cost=grouping_cost(best), candidate_cost=grouping_cost(candidate),
                     plans=[plan_snapshot(candidate)], previous_plans=[plan_snapshot(best)], function='optimize_visit_order / consider')
        visits = visit_orders(candidate)
        for date, reserved_ids in (priority_reservations or {}).items():
            original_ids = visit_orders(plan)[date]
            day = next(day for day in candidate['days'] if day['date'] == date)
            selected = {item['ref_id']: item for item in day['items'] if item['type'] == 'attraction'}
            for reserved_id in reserved_ids:
                if (reserved_id not in selected or minutes(selected[reserved_id]['start_time']) < 13 * 60 or
                    (original_ids.index(reserved_id) > 0 and visits[date][0] == reserved_id)):
                    report(False, '试排未能保留已预留的较晚优先景点及此前可用时段。')
                    return
        if sorted(item for values in visits.values() for item in values) != target:
            report(False, '试排未能保留原来的全部景点，拒绝这次调整。')
            return
        candidate_locks = {(day['date'], item['ref_id'], item['start_time'])
                           for day in candidate['days'] for item in day['items'] if item.get('locked')}
        if candidate_locks != locks or _constraint_warning_count(candidate) > _constraint_warning_count(plan):
            report(False, '锁定条件或约束提示不满足保留要求。')
            return
        if not original_meals <= _meal_slots(candidate):
            report(False, '试排未能保留全部餐次。')
            return
        if route_cost(candidate)[0] > original_travel:
            report(False, '整趟预留交通时间超过初稿。')
            return
        if grouping_cost(candidate) < grouping_cost(best):
            report(True, '景点、餐次和约束均保留，整体路线比较结果更好。依次比较交通加邻近分散代价、交通分钟数、相邻地点直线距离。')
            best = candidate
            if repair_date:
                affected_dates.add(repair_date)
            if grouped_date:
                grouped_dates.add(grouped_date)
        else:
            report(False, '整体路线比较结果没有优于当前安排。')

    locked_ids = {item for _, item, _ in locks}
    locations = {item['ref_id']: item['location'] for day in plan['days']
                 for item in day['items'] if item['type'] == 'attraction'}
    neighbors = sorted(
        ((location_affinity(locations[a], locations[b]), a, b)
         for index, a in enumerate(target) for b in target[index + 1:]
         if location_affinity(locations[a], locations[b]) > 0),
        reverse=True,
    )
    # Exchange visits only to bring a nearby pair onto the same date.
    for _ in range(0 if same_day_only else 3):
        previous = best
        for _, a, b in neighbors:
            for moving, anchor in ((a, b), (b, a)):
                orders = visit_orders(best)
                first = next(date for date, ids in orders.items() if moving in ids)
                second = next(date for date, ids in orders.items() if anchor in ids)
                if first == second or moving in locked_ids:
                    continue
                for replaced in orders[second]:
                    if budget <= 40 + repair_reserve:
                        break
                    if replaced == anchor or replaced in locked_ids:
                        continue
                    trial = {date: list(ids) for date, ids in orders.items()}
                    trial[first][trial[first].index(moving)] = replaced
                    trial[second][trial[second].index(replaced)] = moving
                    consider(trial, repair_date=first, grouped_date=second,
                             optimization_kind='cross_day_nearby_exchange')
        if best is previous or budget <= 40 + repair_reserve:
            break

    dates = list(visit_orders(best))
    # Share the remaining allowance across days, including days with >2 visits.
    for index, (date, values) in enumerate(visit_orders(best).items()):
        allowance = min(32, max(0, (budget - repair_reserve) // (len(dates) - index)))
        for order in islice(permutations(values), allowance):
            trial = {key: list(value) for key, value in visit_orders(best).items()}
            trial[date] = list(order)
            consider(trial)
    if request is not None and not same_day_only:
        # Repair after grouping/order settle, then freeze every other day.
        # Never feed the repaired selection back into swaps or external queries.
        best = repair_affected_days(best, request, rebuild,
                                   affected_dates - grouped_dates, attempts=repair_reserve,
                                   repair_records=repair_records)
    if tracing():
        emit('optimization', ('重排当天的游览顺序优化完成' if same_day_only else '相近景点跨日交换与同日顺序优化完成'),
             message=f'实际重建比较{limit - budget}份候选。',
             scope='same_day' if same_day_only else 'global',
             plans=[plan_snapshot(best)], function='optimize_visit_order / repair_affected_days')
    return best
