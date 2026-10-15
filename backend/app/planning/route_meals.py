"""Local hexagon snapshots and contracts for meals attached to transport legs."""

from __future__ import annotations

import json
import math
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

from ..data_store import LocalDataError, load_attractions
from .models import PlanGenerationError
from .time_rules import minutes, clock, MEAL_WINDOWS

ROOT = Path(__file__).resolve().parents[3]
DUCK_MEAL_TARGETS = {1: 1, 2: 1, 3: 2, 4: 3, 5: 3}


@lru_cache(maxsize=1)
def dining_snapshot() -> dict[str, Any]:
    try:
        data = json.loads((ROOT / 'data/formal/dining_map_snapshot.json').read_text(encoding='utf-8'))
        if len(data['cells']) != 461 or not data['data_version']:
            raise ValueError('Invalid hexagon catalog')
    except (OSError, ValueError, KeyError) as exc:
        raise LocalDataError('本地餐饮蜂巢资料暂时无法读取。') from exc
    return data


@lru_cache(maxsize=1)
def hex_catalog() -> dict[str, dict[str, Any]]:
    data = dining_snapshot()
    shops = {shop['poi_id']: shop for shop in data['shops']}
    from .transport import distance_km
    attractions = load_attractions()
    result = {}
    for cell in data['cells']:
        nearest = min(attractions, key=lambda item: distance_km(cell['center'], item['location']))
        name = f"{nearest['name']}周边餐饮区" if distance_km(cell['center'], nearest['location']) <= 2 else '沿途餐饮便利区'
        meal_shops = [shops[poi] for poi in cell['duck']['poi_ids']
                      if shops[poi]['service_mode'] == 'meal_candidate']
        result[cell['id']] = {
            'id': cell['id'], 'name': name, 'center': cell['center'],
            'boundary': cell['boundary'], 'ordinary_count': cell['ordinary']['meal_sample_count'],
            'duck_meal_count': len(meal_shops),
            'duck_types': sorted({kind for shop in meal_shops for kind in shop['duck_types']}),
            'data_version': data['data_version'],
        }
    return result


def validate_route_meals(response: Mapping[str, Any]) -> None:
    """Check actual catalog identity, adjacency, chronology and single meal accounting."""
    for plan in response.get('plans', []):
        for day in plan.get('days', []):
            adjustment = day.get('end_time_adjustment')
            if adjustment is not None:
                planned = minutes(adjustment['planned_end_time'])
                extended = minutes(adjustment['extended_end_time'])
                arrival = minutes(day['items'][-1]['end_time'])
                if extended - planned != 30 or not planned < arrival <= extended:
                    raise PlanGenerationError('结束时间延后必须为30分钟，且实际结束位于延后范围内。')
            items = {item['item_id']: item for item in day['items']}
            seen = set()
            for leg in day['legs']:
                meals = leg.get('meals', [])
                if not meals:
                    continue
                previous = items.get(leg['from_item_id'])
                following = items.get(leg['to_item_id'])
                if previous is None or following is None:
                    raise PlanGenerationError('用餐必须关联当前行程的有效交通段。')
                available = minutes(following['start_time']) - minutes(previous['end_time'])
                if available < leg['duration_minutes_rounded'] + 60 * len(meals):
                    raise PlanGenerationError('交通段不能容纳交通与完整用餐时间。')
                last_end = minutes(previous['end_time'])
                for meal in sorted(meals, key=lambda value: value['start_time']):
                    kind = meal['meal_kind']
                    start, end = minutes(meal['start_time']), minutes(meal['end_time'])
                    if kind in seen or end - start != 60 or meal['duration_minutes'] != 60:
                        raise PlanGenerationError('同一餐次只能预留一次完整60分钟用餐。')
                    if start < last_end or end > minutes(following['start_time']):
                        raise PlanGenerationError('用餐时间必须位于对应交通段内，且不能重叠。')
                    seen.add(kind)
                    last_end = end
                    if any(item.get('meal_kind') == kind for item in day['items']):
                        raise PlanGenerationError('用餐不能同时占用独立节点与交通段。')
                    area = meal['area']
                    if area is None:
                        if meal['area_kind'] == 'duck':
                            raise PlanGenerationError('鸭餐必须关联有正餐候选的实际蜂巢。')
                        continue
                    expected = hex_catalog().get(area.get('id'))
                    if expected is None or area != expected:
                        raise PlanGenerationError('用餐区域必须与本地完整蜂巢快照一致。')
                    if meal['area_kind'] == 'duck' and (
                        plan['plan_type'] != 'duck' or area['duck_meal_count'] < 1
                    ):
                        raise PlanGenerationError('鸭餐区域必须有适合正餐的南京鸭店。')


def fold_meal_breaks(response: dict[str, Any]) -> dict[str, Any]:
    """Move reserved meal breaks onto adjacent transport without moving visits."""
    result = deepcopy(response)
    for plan in result['plans']:
        for day in plan['days']:
            old_items, old_legs = day['items'], day['legs']
            kept = [index for index, item in enumerate(old_items)
                    if not (item['type'] == 'free_time' and item.get('meal_kind') in MEAL_WINDOWS)]
            legs = []
            for left, right in zip(kept, kept[1:]):
                portions = old_legs[left:right]
                # The real journey may precede a meal at the next attraction;
                # the subsequent transfer is then a zero-minute walk.
                leg = deepcopy(max(portions, key=lambda value: value['duration_minutes_raw']))
                leg['from_item_id'] = old_items[left]['item_id']
                leg['to_item_id'] = old_items[right]['item_id']
                leg['duration_minutes_raw'] = sum(value['duration_minutes_raw'] for value in portions)
                leg['duration_minutes_rounded'] = sum(value['duration_minutes_rounded'] for value in portions)
                leg.setdefault('path_details', None)
                leg['meals'] = [{
                    'meal_kind': item['meal_kind'], 'start_time': item['start_time'],
                    'end_time': item['end_time'], 'duration_minutes': 60,
                    'area_kind': 'ordinary', 'area': None, 'match_source': 'unmatched',
                    'elapsed_minutes': 0, 'message': '途中预留1小时用餐',
                } for item in old_items[left + 1:right] if item.get('meal_kind') in MEAL_WINDOWS]
                legs.append(leg)
            day['items'] = [old_items[index] for index in kept]
            day['legs'] = legs
        plan['warnings'] = [value for value in plan['warnings']
                            if '未找到合适真实餐饮' not in value and '鸭类餐饮目标' not in value
                            and not value.startswith('交通时间为坐标距离')]
    return result


def _feasible_candidates(meal, leg, previous, following, candidates, duck=False):
    earliest, window_end = MEAL_WINDOWS[meal['meal_kind']]
    earliest = min(earliest, minutes(meal['start_time']))
    latest = min(window_end - 60, minutes(following['start_time']) - 60)
    departure = minutes(previous['end_time'])
    total = leg['duration_minutes_rounded']
    valid = []
    for candidate in candidates:
        area = candidate['area']
        if (area['duck_meal_count'] if duck else area['ordinary_count']) < (1 if duck else 15):
            continue
        enter, exit = candidate['enter'], candidate['exit']
        # Choose an arrival point within the polygon's time interval, not its center.
        elapsed = max(enter, min(exit, earliest - departure))
        elapsed = max(0, min(total, math.ceil(elapsed - 1e-8)))
        start = max(earliest, departure + elapsed)
        if start > latest or start + 60 + total - elapsed > minutes(following['start_time']):
            continue
        if candidate['source'] == 'endpoint':
            elapsed_priority = 0
        else:
            elapsed_priority = 1
        rank = ((-area['duck_meal_count'], elapsed_priority) if duck else
                (elapsed_priority, -area['ordinary_count']))
        valid.append(((*rank, area['id'], elapsed), candidate, elapsed, start))
    return sorted(valid, key=lambda value: value[0])


def assign_hex_meals(response: dict[str, Any]) -> dict[str, Any]:
    from .hex_matching import route_hex_candidates
    result = fold_meal_breaks(response)
    for plan in result['plans']:
        duck_slots = []
        for day in plan['days']:
            items = {item['item_id']: item for item in day['items']}
            for leg in day['legs']:
                previous, following = items[leg['from_item_id']], items[leg['to_item_id']]
                candidates = route_hex_candidates(leg, previous, following)
                for meal in leg['meals']:
                    ordinary = _feasible_candidates(meal, leg, previous, following, candidates)
                    duck = _feasible_candidates(meal, leg, previous, following, candidates, duck=True)
                    if ordinary:
                        _apply_candidate(meal, ordinary[0], 'ordinary')
                    if plan['plan_type'] == 'duck' and duck:
                        duck_slots.append((duck[0][0], day['date'], meal['meal_kind'], meal, duck[0]))
        if plan['plan_type'] == 'duck':
            target = DUCK_MEAL_TARGETS[len(plan['days'])]
            selected = sorted(duck_slots, key=lambda value: value[:3])[:target]
            for _, _, _, meal, candidate in selected:
                _apply_candidate(meal, candidate, 'duck')
            plan['summary'] = f'按轻松节奏安排景点，途中安排{len(selected)}次南京鸭用餐区域，其余餐次自由选择普通餐饮。'
            if len(selected) < target:
                plan['warnings'].append(f'南京鸭用餐目标{target}次，实际匹配{len(selected)}次。')
        else:
            plan['summary'] = '按游览节奏安排景点，在交通途中预留用餐并推荐沿途餐饮蜂巢。'
        for day in plan['days']:
            for leg in day['legs']:
                for meal in leg['meals']:
                    if meal['area'] is None:
                        plan['warnings'].append(f"{day['date']}的{'午餐' if meal['meal_kind'] == 'lunch' else '晚餐'}保留1小时自由用餐，未匹配到沿途餐饮区域。")
    result['global_warnings'] = [value for value in result['global_warnings']
                                 if '未取得合适区域' not in value and not value.startswith('交通时间按坐标距离')]
    result['global_warnings'].append('已取得的交通方案使用实际路径及预留耗时，用餐区域由沿途蜂巢提供。')
    validate_route_meals(result)
    return result


def _apply_candidate(meal, selected, kind):
    _, candidate, elapsed, start = selected
    meal.update(area=deepcopy(candidate['area']), area_kind=kind,
                match_source=candidate['source'], elapsed_minutes=elapsed,
                start_time=clock(start), end_time=clock(start + 60),
                message='途中预留1小时南京鸭用餐' if kind == 'duck' else '途中预留1小时用餐')
