"""Continue local replacement search when actual traffic rejects a candidate."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Callable

from ..amap_transport import check_plan_deadline
from .day_repair import replacement_options, valid_replacement
from .route_order import visit_orders
from .schedule import build_plan


MAX_REPLACEMENT_PROBES = 32
MAX_ACTUAL_REPLACEMENTS = 12


async def refill_repaired_days(request: dict[str, Any], response: dict[str, Any],
                               records: dict[str, dict[str, Any]], *,
                               traffic: Callable, verify_routes: Callable,
                               travel_limits: dict[str, int]) -> dict[str, Any]:
    """Freeze all other days, reuse traffic, and try more than one alternative.

    Only dates explicitly repaired after exchanges are eligible. The target
    count restores those removed slots, never imposes a general daily cap.
    The caller shares its original query/deadline budget with these probes.
    """
    result = deepcopy(response)
    probes, actual_probes = 0, 0
    for index, initial in enumerate(response['plans']):
        for date, record in records.get(initial['plan_type'], {}).items():
            rejected = set(record['removed_ids'])
            selected = {value for ids in visit_orders(result['plans'][index]).values() for value in ids}
            # Do not repeat the replacement already rejected during enrichment.
            rejected.update(record.get('replacement_ids', set()) - selected)
            while len(visit_orders(result['plans'][index])[date]) < record['target_count']:
                previous = result['plans'][index]
                inserted = False
                exhausted = False
                unavailable = False
                for attraction_id, order in replacement_options(previous, request, date, rejected):
                    check_plan_deadline()
                    if probes >= MAX_REPLACEMENT_PROBES or actual_probes >= MAX_ACTUAL_REPLACEMENTS:
                        exhausted = True
                        break
                    probes += 1
                    orders = {**visit_orders(previous), date: order}
                    candidate = build_plan(previous['plan_type'], request, visit_sequences=orders,
                                           preserve_visit_order=True, **traffic())
                    if not valid_replacement(previous, candidate, request, date, order,
                                             travel_limit=travel_limits[previous['plan_type']]):
                        continue
                    actual_probes += 1
                    verified = await verify_routes(candidate, date)
                    if verified is None:
                        # The shared route-query budget cannot complete this
                        # probe. Keep the existing plan and report the limit.
                        exhausted = True
                        break
                    if not verified:
                        unavailable = True
                        continue
                    candidate = build_plan(previous['plan_type'], request, visit_sequences=orders,
                                           preserve_visit_order=True, **traffic())
                    if not valid_replacement(previous, candidate, request, date, order,
                                             travel_limit=travel_limits[previous['plan_type']]):
                        continue
                    candidate['warnings'] = list(dict.fromkeys([
                        *candidate['warnings'],
                        *(warning for warning in previous['warnings']
                          if warning.startswith('核对交通与开放时间后，')),
                    ]))
                    result['plans'][index] = candidate
                    inserted = True
                    break
                if inserted:
                    continue
                message = ('邻近／顺路替代景点的核对达到本次查询或尝试上限，保留当前安排；'
                           '未认定其他景点全部不可行。' if exhausted else
                           '已继续检查替代候选，但部分候选未取得可用实际交通，保留当前安排；'
                           '未认定这些候选时间上不可行。' if unavailable else
                           '已检查未安排的邻近／顺路替代及其他符合偏好的候选插入位置，'
                           '本日未找到同时满足开放、游览、用餐、预算和交通条件的替代安排。')
                result['plans'][index]['warnings'].append(f'{date}：{message}')
                break
    return result
