"""Recover a return-conflicting dinner without changing any chosen visit."""

from __future__ import annotations

from copy import deepcopy
from typing import Any
from types import SimpleNamespace

from ..amap_transport import check_plan_deadline
from .day_schedule import finish_day
from .meals import meal_start_time, schedule_meal_break
from .models import DayState
from .time_rules import clock, minutes, MEAL_WINDOWS
from .transport import estimate_leg
from .transit_enrichment import transit_query_key

EXTENSION_MINUTES = 30


def _state(plan_type, index, day, allowed, traffic):
    items = deepcopy(day['items'][:-1])
    serials = [int(parts[2]) for item in day['items']
               if len(parts := item['item_id'].split('_')) > 3 and parts[2].isdigit()]
    return DayState(
        plan_type=plan_type, day_index=index, day=allowed,
        start_location_ref=day['start_location'], end_location_ref=day['end_location'],
        transport_preference='taxi', items=items, legs=deepcopy(day['legs'][:-1]),
        current_time=minutes(items[-1]['end_time']), current_location=items[-1]['location'],
        serial=max([len(day['items']), *serials]), **traffic,
    )


def _meal_probe(plan_type, index, day, allowed, traffic):
    earliest, window_end = MEAL_WINDOWS['dinner']
    latest = min(window_end - 60, minutes(allowed['end_time']) - 60)
    for destination in (day['items'][-2]['location'], day['end_location']['location']):
        state = _state(plan_type, index, day, allowed, traffic)
        if schedule_meal_break(state, 'dinner', earliest, latest,
                               deadline=None, deadline_location=None, destination=destination):
            finish_day(state)
            return {**deepcopy(day), 'items': state.items, 'legs': state.legs}
    return None


def _adjustment(day, planned, extended):
    day['end_time_adjustment'] = {
        'planned_end_time': planned,
        'extended_end_time': extended,
        'reason': '晚餐与返回终点时间冲突；最后一程采用出租车后仍需额外时间，结束时间延后30分钟以保留完整晚餐及返程。',
    }


async def recover_return_dinners(request: dict[str, Any], response: dict[str, Any], *,
                                  traffic, lookup_taxi) -> dict[str, Any]:
    """Only late days with a demonstrable final-return conflict qualify.

    Reuse the original shared traffic budget. No visit, lunch, endpoint or other
    day is rescheduled. Explicit long-visit meal omissions are never recovered.
    """
    for plan in response['plans']:
        for index, day in enumerate(plan['days']):
            check_plan_deadline()
            allowed = request['trip_days'][index]
            planned_end = minutes(allowed['end_time'])
            missing_warning = f"{day['date']} 的晚餐无法在现有安排中安全预留。"
            if (planned_end <= 19 * 60 or day.get('end_time_adjustment') or
                missing_warning not in plan['warnings'] or not day['legs'] or
                day['legs'][-1]['mode'] not in {'public_transit', 'taxi'} or
                any(item.get('meal_kind') == 'dinner' for item in day['items']) or
                any(meal.get('meal_kind') == 'dinner' for leg in day['legs'] for meal in leg.get('meals', [])) or
                not any(item['type'] == 'attraction' for item in day['items'])):
                continue
            previous, endpoint = day['items'][-2:]
            if endpoint['type'] != 'end':
                continue
            current = minutes(previous['end_time'])
            earliest, window_end = MEAL_WINDOWS['dinner']
            meal_start = meal_start_time(SimpleNamespace(current_time=current),
                                         earliest, {'mode': 'walk', 'duration_minutes_rounded': 0})
            # A dinner in place fits, and only the final transfer makes it fail.
            if (meal_start > window_end - 60 or meal_start + 60 > planned_end or
                meal_start + 60 + day['legs'][-1]['duration_minutes_rounded'] <= planned_end):
                continue

            key = ('taxi', *transit_query_key(previous['location'], endpoint['location']))
            actual_taxi = await lookup_taxi(key)
            active_traffic = traffic()
            # Convert this return only; prefix legs keep their original modes.
            taxi = estimate_leg(previous['location'], endpoint['location'], 'taxi',
                                previous['item_id'], endpoint['item_id'], **active_traffic)
            taxi['route_summary'].append('晚餐与返程时间冲突，最后一程改用出租车以尝试保留晚餐')
            arrival = current + taxi['duration_minutes_rounded']
            # Never truncate a slower taxi journey to pretend it fits.
            if arrival > planned_end:
                plan['warnings'].append(f"{day['date']} 的出租车返程也无法在原计划结束前完成，未据此补排晚餐。")
                continue
            kept = deepcopy(day)
            kept['legs'][-1] = taxi
            kept['items'][-1].update(start_time=clock(arrival), end_time=clock(arrival))
            chosen = None
            extended = False
            if actual_taxi is not None and actual_taxi.get('path_details'):
                chosen = _meal_probe(plan['plan_type'], index, day, allowed, active_traffic)
                if chosen is None and planned_end + EXTENSION_MINUTES < 24 * 60:
                    extended_allowed = {**allowed, 'end_time': clock(planned_end + EXTENSION_MINUTES)}
                    chosen = _meal_probe(plan['plan_type'], index, day, extended_allowed, active_traffic)
                    if chosen is not None:
                        extended = True
                        _adjustment(chosen, allowed['end_time'], extended_allowed['end_time'])
            if chosen is not None:
                plan['warnings'].remove(missing_warning)
                plan['warnings'].append(
                    f"{day['date']} 的最后一程采用出租车，"
                    + (f"结束时间由{allowed['end_time']}延后至{chosen['end_time_adjustment']['extended_end_time']}，" if extended else '')
                    + '已补排60分钟晚餐。')
                plan['days'][index] = chosen
            else:
                plan['days'][index] = kept
                plan['warnings'].append(
                    f"{day['date']} 的最后一程保留出租车，"
                    + ('未取得可核对的实际出租车路径，无法确认补排晚餐。' if actual_taxi is None or not actual_taxi.get('path_details')
                       else '即使尝试延后30分钟也无法安排完整晚餐，保留原计划结束时间。'))
    return response
