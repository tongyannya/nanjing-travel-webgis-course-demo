"""Revisit the final selection round using the day's actual return endpoint."""

from copy import copy, deepcopy
from dataclasses import dataclass

from ..amap_transport import check_plan_deadline
from .day_schedule import append_attraction
from .meals import schedule_meal_break
from .models import DayState
from .nearby_attractions import same_day_bonus
from .notices import notice
from .rules import attraction_score_parts, DISTANCE_PENALTY_PER_KM
from .time_rules import clock
from .trace import emit, tracing
from .transport import distance_km


def _copy_state(state):
    result = copy(state)
    result.items = deepcopy(state.items)
    result.legs = deepcopy(state.legs)
    return result


@dataclass
class LastVisitRound:
    state: DayState
    candidates: list
    pending_meals: list
    used_ids: set
    total_cost: float
    skipped_meal_used: bool
    warnings: list
    round_number: int
    score_parts: dict | None = None

    @classmethod
    def capture(cls, state, candidates, pending_meals, used_ids, total_cost,
                skipped_meal_used, warnings, round_number, *, score_parts=None):
        return cls(_copy_state(state), deepcopy(candidates), list(pending_meals),
                   set(used_ids), total_cost, skipped_meal_used, list(warnings), round_number,
                   deepcopy(score_parts))


def _complete_candidate(checkpoint, candidate):
    """Apply one saved candidate and replay only meals remaining at that round."""
    _, attraction, duration, cost, saved_slot = candidate
    state = _copy_state(checkpoint.state)
    pending = list(checkpoint.pending_meals)
    warnings = list(checkpoint.warnings)
    slot = deepcopy(saved_slot)
    skipped = checkpoint.skipped_meal_used
    if 'meal_before_visit' in slot:
        kind, target, latest = pending.pop(0)
        prefix = slot['meal_before_visit']
        if not schedule_meal_break(state, kind, target, latest, deadline=None,
                                   deadline_location=None, destination=prefix['destination'],
                                   fixed_start=prefix['start']):
            return None
        slot['leg']['from_item_id'] = state.items[-1]['item_id']
    if 'skipped_meal' in slot:
        pending.pop(0)
        skipped = True
        label = '午餐' if slot['skipped_meal'] == 'lunch' else '晚餐'
        warnings.append(
            f"为完成{attraction['name']}的长时间游览，已按你的选择跳过 {state.day['date']} 的{label}（本行程最多一次）。"
        )
    append_attraction(state, attraction, duration, cost, slot, locked=False)
    for kind, target, latest in pending:
        reserved = schedule_meal_break(state, kind, target, latest, deadline=None,
                                       deadline_location=None)
        if not reserved and kind == 'dinner':
            reserved = schedule_meal_break(state, kind, target, latest, deadline=None,
                                           deadline_location=None,
                                           destination=state.end_location_ref['location'])
        label = '午餐' if kind == 'lunch' else '晚餐'
        warnings.append(notice('meal_reserved',
            f"{state.day['date']} 的{label}已预留60分钟，可自由选择餐馆。") if reserved else
            f"{state.day['date']} 的{label}无法在现有安排中安全预留。")
    return (state, checkpoint.used_ids | {attraction['id']}, checkpoint.total_cost + cost,
            skipped, warnings)


def reconsider_last_visit(checkpoint, state, used_ids, total_cost, skipped_meal_used,
                          warnings, preferences):
    """Rank that round once, preserving its prefix, other dates and existing meals."""
    unchanged = state, used_ids, total_cost, skipped_meal_used, warnings
    original = next(item for item in reversed(state.items) if item['type'] == 'attraction')
    original_id = original['ref_id']
    endpoint = state.end_location_ref
    title = f"第{state.day_index + 1}天末站返程复核：回到第{checkpoint.round_number}轮"
    if original_id in preferences['must_visit_ids'] or original.get('locked'):
        emit('selection', title + f"，保留{original['name']}",
             date=state.day['date'], return_review=True, selected_id=original_id,
             original_selected_id=original_id, reconsidered_round=checkpoint.round_number,
             message='最后一个景点为必去或已锁定景点，保留本次选择。',
             function='reconsider_last_visit')
        return unchanged
    expected_meals = {item['meal_kind'] for item in state.items if item.get('meal_kind')}
    options, rows = [], []
    for candidate in checkpoint.candidates:
        check_plan_deadline()
        score, attraction, duration, _cost, slot = candidate
        return_distance = distance_km(attraction['location'], endpoint['location'])
        return_score = -return_distance * DISTANCE_PENALTY_PER_KM
        result = unchanged if attraction['id'] == original_id else _complete_candidate(checkpoint, candidate)
        valid = result is not None and expected_meals <= {
            item['meal_kind'] for item in result[0].items if item.get('meal_kind')}
        if valid:
            options.append((score + return_score, attraction, result))
        if tracing():
            row = {'id': attraction['id'], 'name': attraction['name'], 'duration': duration,
                   'reason': '可行候选' if valid else '替换后无法保留原有完整餐次',
                   'return_distance_km': round(return_distance, 6),
                   'start_time': clock(slot['start']), 'end_time': clock(slot['end']),
                   'meal_before_visit': 'meal_before_visit' in slot}
            if valid:
                parts = (checkpoint.score_parts[attraction['id']] if checkpoint.score_parts is not None else
                         attraction_score_parts(attraction, preferences,
                             checkpoint.state.current_location, checkpoint.state.current_time) |
                         {'nearby': same_day_bonus(attraction['location'], checkpoint.state.items)})
                row.update(score=score + return_score,
                           parts=parts | {'return_distance': return_score})
            rows.append(row)
    _, selected, result = max(options, key=lambda option: (option[0], option[1]['id'] == original_id))
    changed = selected['id'] != original_id
    emit('selection', title + (f"，改选{selected['name']}" if changed else f"，保留{original['name']}"),
         date=state.day['date'], return_review=True, reconsidered_round=checkpoint.round_number,
         original_selected_id=original_id, selected_id=selected['id'], changed=changed,
         current_time=clock(checkpoint.state.current_time),
         current_location=checkpoint.state.items[-1]['name'],
         ticket_cost_so_far=checkpoint.total_cost, candidate_count=len(options),
         candidates=sorted(rows, key=lambda row: -row.get('score', -1e9)),
         message=f"当天选景已结束，重新比较最后一次选景的候选。去程与到达{endpoint['name']}的返程距离均按每公里6分扣除；已安排的其他景点与完整餐次保留。",
         function='reconsider_last_visit / attraction_score_parts / schedule_meal_break')
    return result
