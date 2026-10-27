"""Replan long connections once and optimize that day's order before routing."""

from copy import deepcopy

from ..amap_transport import check_plan_deadline
from ..data_store import load_attractions
from .rules import reason_for_unplanned
from .schedule import build_plan
from .route_order import optimize_visit_order
from .trace import emit
from .transport import distance_km
from .priority_scoring import priority_ids_for_request, daily_priority_target

MAX_DAY_DISTANCE_KM = 8.0


def long_day_distances(day):
    visits = [item for item in day['items'] if item['type'] in {'start', 'attraction', 'end'}]
    pairs = list(zip(visits, visits[1:]))
    return [{'from': first['name'], 'to': second['name'],
             'distance_km': round(distance_km(first['location'], second['location']), 6)}
            for first, second in pairs
            if distance_km(first['location'], second['location']) > MAX_DAY_DISTANCE_KM]


def _day_request(request, plan, index):
    day = plan['days'][index]
    blocked = {item['ref_id'] for other in plan['days'] if other['date'] != day['date']
               for item in other['items'] if item['type'] == 'attraction'}
    local = deepcopy(request)
    local.update(trip_days=[deepcopy(request['trip_days'][index])],
                 first_day_start=deepcopy(day['start_location']),
                 last_day_end=deepcopy(day['end_location']))
    local['preferences']['must_visit_ids'] = [key for key in request['preferences']['must_visit_ids'] if key not in blocked]
    others_cost = sum(item['ticket_cost'] for other in plan['days'] if other['date'] != day['date']
                      for item in other['items'])
    if not local['ticket_budget']['unlimited']:
        local['ticket_budget']['total'] = max(0, request['ticket_budget']['total'] - others_cost)
    skipped = any('跳过 ' in warning and day['date'] not in warning for warning in plan['warnings'])
    return local, dict(blocked_attraction_ids=blocked, skipped_meal_already_used=skipped,
                       day_index_offset=index)


def review_long_distance_days(request, response, *, traffic=None, repair_records=None, priority_day_targets=None):
    result = deepcopy(response)
    catalog = {item['id']: item for item in load_attractions()}
    for plan in result['plans']:
        targets = dict((priority_day_targets or {}).get(plan['plan_type'], {}))
        remaining = priority_ids_for_request(request, list(catalog.values()))
        for index, day in enumerate(plan['days']):
            targets.setdefault(day['date'], daily_priority_target(len(remaining), len(plan['days']) - index))
            remaining.difference_update(item['ref_id'] for item in day['items'] if item['type'] == 'attraction')
        changed_plan = False
        for index in range(len(plan['days'])):
            check_plan_deadline()
            old = plan['days'][index]
            violations = long_day_distances(old)
            if not violations:
                continue
            emit('repair', f"{old['date']}：发现超过8公里的距离，单独重排当天", date=old['date'],
                 long_distances=violations, message='；'.join(
                     f"{pair['from']}→{pair['to']}约{pair['distance_km']:.2f}公里" for pair in violations)
                     + '。保留其他日期，按当前分数重新选择当天景点，再优化当天游览顺序；本日只尝试一次，随后统一查询高德。',
                 function='review_long_distance_days / build_plan')
            local, options = _day_request(request, plan, index)
            reservations = {}
            candidate = build_plan(plan['plan_type'], local, priority_reservations=reservations,
                                   priority_day_targets=targets, priority_trip_request=request,
                                   **options, **(traffic or {}))
            checked = optimize_visit_order(candidate, lambda orders: build_plan(
                plan['plan_type'], local, visit_sequences=orders, preserve_visit_order=True,
                **options, **(traffic or {})), same_day_only=True,
                priority_reservations=reservations)
            new = checked['days'][0]
            old_meals = {item['meal_kind'] for item in old['items'] if item.get('meal_kind')}
            new_meals = {item['meal_kind'] for item in new['items'] if item.get('meal_kind')}
            ids = {item['ref_id'] for item in new['items'] if item['type'] == 'attraction'}
            required = {item['ref_id'] for item in old['items'] if item['type'] == 'attraction' and
                        (item['ref_id'] in request['preferences']['must_visit_ids'] or item.get('locked'))}
            if not required <= ids or not old_meals <= new_meals:
                emit('repair', f"{old['date']}：重排无法保留必去景点或完整餐次，保留原安排", date=old['date'],
                     function='review_long_distance_days')
                continue
            plan['days'][index] = new
            changed_plan = True
            if repair_records is not None:
                repair_records.get(plan['plan_type'], {}).pop(old['date'], None)
            plan['warnings'] = [warning for warning in plan['warnings'] if old['date'] not in warning]
            plan['warnings'].extend(warning for warning in checked['warnings'] if old['date'] in warning)
            remaining = long_day_distances(new)
            emit('repair', f"{old['date']}：单日重排检查完成", date=old['date'], changed=new != old,
                 long_distances=remaining,
                 message=('重排后仍有超过8公里的距离，本日保留此次安排，随后统一查询高德。' if remaining else
                          '重排后各相邻景点及首末连接均在8公里内，随后统一查询高德。'),
                 function='review_long_distance_days')
        if not changed_plan:
            continue
        plan['total_ticket_cost'] = round(sum(item['ticket_cost'] for day in plan['days'] for item in day['items']), 2)
        budget = request['ticket_budget']
        plan['budget_exceeded'] = not budget['unlimited'] and plan['total_ticket_cost'] > budget['total']
        budget_warning = '为优先安排必须去景点，本方案超过了门票预算。'
        plan['warnings'] = [warning for warning in plan['warnings'] if warning != budget_warning]
        if plan['budget_exceeded']:
            plan['warnings'].append(budget_warning)
        used = {item['ref_id'] for day in plan['days'] for item in day['items'] if item['type'] == 'attraction'}
        explicit = set().union(*(request['preferences'][key] for key in ('must_visit_ids', 'interested_ids', 'excluded_ids')))
        plan['unplanned_attractions'] = []
        for key in sorted(explicit - used):
            reason, message = reason_for_unplanned(catalog[key], request, plan['total_ticket_cost'])
            plan['unplanned_attractions'].append({'attraction_id': key, 'reason_code': reason, 'message': message})
        plan['warnings'] = list(dict.fromkeys(plan['warnings']))
    return result
