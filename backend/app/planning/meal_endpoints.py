"""Choose meal endpoints from local data before making timed transit queries."""

from contextlib import asynccontextmanager
from contextvars import ContextVar

from .time_rules import MEAL_WINDOWS, minutes, clock
from .trace import emit

_choices = ContextVar('meal_endpoint_choices', default=None)


@asynccontextmanager
async def meal_endpoint_scope():
    token = _choices.set({})
    try:
        yield
    finally:
        _choices.reset(token)


def _point(location):
    return tuple(round(location[field], 6) for field in ('longitude', 'latitude'))


def endpoint_choice(state, kind, destination):
    choices = _choices.get()
    if choices is None:
        return None
    return choices.get((state.plan_type, state.day['date'], kind,
                        _point(state.current_location), _point(destination)))


def prepare_meal_endpoints(request, response):
    """Compare two cheap local options per meal; reserve duck opportunities trip-wide."""
    choices = _choices.get()
    if choices is None:
        return False
    from .hex_matching import contains
    from .route_meals import hex_catalog, DUCK_MEAL_TARGETS

    catalog = hex_catalog()
    location_cache = {}

    def areas_at(location):
        point = _point(location)
        if point not in location_cache:
            location_cache[point] = [area for area in catalog.values()
                                     if contains(area['boundary'], point)]
        return location_cache[point]

    changed = False
    for plan in response['plans']:
        slots = []
        for index, day in enumerate(plan['days']):
            items, legs = day['items'], day['legs']
            kept = [i for i, item in enumerate(items)
                    if not (item['type'] == 'free_time' and item.get('meal_kind') in MEAL_WINDOWS)]
            for left, right in zip(kept, kept[1:]):
                meals = [item for item in items[left + 1:right] if item.get('meal_kind') in MEAL_WINDOWS]
                if len(meals) != 1:
                    continue
                meal = meals[0]
                previous, following = items[left], items[right]
                total = sum(leg['duration_minutes_rounded'] for leg in legs[left:right])
                limit = (minutes(request['trip_days'][index]['end_time']) if following['type'] == 'end'
                         else minutes(following['start_time']))
                earliest, window_end = MEAL_WINDOWS[meal['meal_kind']]
                earliest = min(earliest, minutes(meal['start_time']))
                options = []
                for side, location, elapsed in [('origin', previous['location'], 0),
                                                 ('destination', following['location'], total)]:
                    start = max(earliest, minutes(previous['end_time']) + elapsed)
                    if start > window_end - 60 or start + 60 + total - elapsed > limit:
                        continue
                    areas = areas_at(location)
                    ordinary = max((area['ordinary_count'] for area in areas
                                    if area['ordinary_count'] >= 15), default=0)
                    duck = max((area['duck_meal_count'] for area in areas), default=0)
                    current = _point(location) == _point(meal['location'])
                    options.append({'side': side, 'location': location, 'ordinary': ordinary,
                                    'duck': duck, 'current': current, 'start': clock(start),
                                    'areas': areas})
                if not options:
                    continue
                ordinary = max(options, key=lambda option: (option['ordinary'], option['current']))
                duck = max(options, key=lambda option: (option['duck'], option['ordinary'], option['current']))
                slots.append({'date': day['date'], 'kind': meal['meal_kind'], 'previous': previous,
                              'following': following, 'options': options, 'ordinary': ordinary,
                              'duck': duck, 'chosen': ordinary,
                              'transit': any(leg['mode'] == 'public_transit' for leg in legs[left:right])})
        if plan['plan_type'] == 'duck':
            remaining = [slot for slot in slots if slot['duck']['duck'] > 0]
            per_day = {}
            for _ in range(DUCK_MEAL_TARGETS[len(plan['days'])]):
                if not remaining:
                    break
                chosen = min(remaining, key=lambda slot: (per_day.get(slot['date'], 0),
                             -slot['duck']['duck'], slot['ordinary']['ordinary'], slot['date'], slot['kind']))
                chosen['chosen'] = chosen['duck']
                remaining.remove(chosen)
                per_day[chosen['date']] = per_day.get(chosen['date'], 0) + 1
        for slot in slots:
            if not slot['transit']:
                continue
            key = (plan['plan_type'], slot['date'], slot['kind'],
                   _point(slot['previous']['location']), _point(slot['following']['location']))
            # Traffic repairs can change the adjoining visits. Compare new
            # connections before querying them, without moving frozen decisions.
            if key in choices:
                continue
            choices[key] = slot['chosen']
            changed |= not slot['chosen']['current']
            emit('dining', f"{slot['date']}{'午餐' if slot['kind'] == 'lunch' else '晚餐'}：本地比较交通两端餐区",
                 date=slot['date'], selected_endpoint=slot['chosen']['side'],
                 endpoint_options=[{'side': option['side'], 'ordinary_count': option['ordinary'],
                                    'duck_count': option['duck'], 'start_time': option['start'],
                                    'areas': [{'id': area['id'], 'name': area['name'],
                                               'ordinary_count': area['ordinary_count'],
                                               'duck_count': area['duck_meal_count']} for area in option['areas']]}
                                   for option in slot['options']],
                 message='仅使用本地快照比较；先确定用餐先后，再核对选定时刻的公交，不逐个餐区查询高德。',
                 function='prepare_meal_endpoints')
    return changed
