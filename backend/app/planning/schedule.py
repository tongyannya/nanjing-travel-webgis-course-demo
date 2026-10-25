"""Day scheduling and three-plan assembly.

The event loop preserves three invariants: items stay chronological, every inserted
item still leaves enough time to reach the day's endpoint, and a future
meal cannot be displaced by an ordinary attraction.
"""

from __future__ import annotations

from typing import AbstractSet, Any, Mapping

from ..data_store import load_attractions
from .day_schedule import (
    append_attraction,
    finish_day,
    make_start,
    slot_for_attraction,
)
from .meals import schedule_meal_break
from .models import DayState, PlanType, PlanGenerationError
from .rules import (
    is_excluded_by_preferences,
    reason_for_unplanned,
    score_attraction,
    ticket_cost,
    attraction_score_parts,
)
from .time_rules import meal_targets, minutes, opening_intervals, clock
from .visit_meals import visit_after_meal, visit_skipping_meal
from .nearby_attractions import same_day_bonus
from .notices import notice
from .trace import tracing, emit, plan_snapshot
from .last_stop import LastVisitRound, reconsider_last_visit
from .priority_visit import apply_visit, reserve_first_priority, priority_fits, place_priority

def build_plan(
    plan_type: PlanType,
    request: dict[str, Any],
    *,
    visit_sequences: Mapping[str, list[str]] | None = None,
    preserve_visit_order: bool = False,
    travel_details_by_key: Mapping[tuple, Mapping[str, Any]] | None = None,
    transit_details_by_key: Mapping[
        tuple[float, float, float, float], Mapping[str, Any]
    ] | None = None,
    taxi_fallback_keys: AbstractSet[
        tuple[float, float, float, float]
    ] | None = None,
    fallback_missing_transit_to_taxi: bool = False,
    blocked_attraction_ids: AbstractSet[str] = frozenset(),
    skipped_meal_already_used: bool = False,
    day_index_offset: int = 0,
    priority_reservations: dict[str, set[str]] | None = None,
) -> dict[str, Any]:
    attractions = list(load_attractions())
    attraction_by_id = {item["id"]: item for item in attractions}
    if request.get('manual_locks'):
        raise PlanGenerationError('手动锁定时间已退出，请重新选择旅行条件。')
    preferences = request["preferences"]
    excluded_ids = set(preferences["excluded_ids"])
    excluded_tags = set(preferences["excluded_tags"])
    must_ids = set(preferences["must_visit_ids"])
    used_ids: set[str] = set(blocked_attraction_ids)
    skipped_meal_used = skipped_meal_already_used
    warnings = [notice('estimated_traffic', "交通耗时暂按距离估算。")]
    for attraction_id in sorted(must_ids):
        if set(attraction_by_id[attraction_id].get("tags", [])) & excluded_tags:
            warnings.append(
                f"{attraction_by_id[attraction_id]['name']} 是必去景点，同时命中排除标签；"
                "已按必去优先保留。"
            )
    total_cost = 0.0
    days_output = []
    max_per_day = 4 if plan_type == "compact" else None
    observing = tracing() and visit_sequences is None
    for day_index, day in enumerate(request["trip_days"]):
        start_ref = (
            request["first_day_start"]
            if day_index == 0 and request["first_day_start"]
            else request["lodging"]
        )
        end_ref = (
            request["last_day_end"]
            if day_index == len(request["trip_days"]) - 1 and request["last_day_end"]
            else request["lodging"]
        )
        state = DayState(
            plan_type=plan_type,
            day_index=day_index + day_index_offset,
            day=day,
            start_location_ref=start_ref,
            end_location_ref=end_ref,
            transport_preference=request["transport_preference"],
            travel_details_by_key=travel_details_by_key or {},
            transit_details_by_key=transit_details_by_key or {},
            taxi_fallback_keys=taxi_fallback_keys or frozenset(),
            fallback_missing_transit_to_taxi=fallback_missing_transit_to_taxi,
        )
        make_start(state)
        pending_meals = meal_targets(day)
        last_round = None
        priority = None
        priority_checked = False

        for _ in range(50):
            next_meal = pending_meals[0] if pending_meals else None
            meal_time = next_meal[1] if next_meal else None
            event_kind = None
            if meal_time is not None:
                event_kind = "meal"
            candidate_deadline = next_meal[2] if next_meal else None
            candidate_deadline_location = None

            normal_candidates = []
            trace_rows = [] if observing else None
            sequence = (visit_sequences or {}).get(day['date'], [])
            last_visited = max((index for index, attraction_id in enumerate(sequence)
                                if attraction_id in used_ids), default=-1)
            next_visit = next((attraction_id for attraction_id in sequence[last_visited + 1:]
                               if attraction_id not in used_ids), None)
            following_deadline = pending_meals[1][2] if len(pending_meals) > 1 else None
            following_location = None
            active_cap = max_per_day - bool(priority) if max_per_day is not None else None
            if max_per_day is None or state.attraction_count < max_per_day or any(
                item in must_ids for item in attraction_by_id if item not in used_ids
            ):
                for attraction in attractions:
                    attraction_id = attraction["id"]
                    row = None
                    if observing:
                        row = {'id': attraction_id, 'name': attraction['name'], 'reason': '当天景点数量已达上限'}
                        trace_rows.append(row)
                    if visit_sequences is not None and attraction_id not in visit_sequences.get(day['date'], []):
                        continue
                    if preserve_visit_order and attraction_id != next_visit:
                        continue
                    if attraction_id in used_ids:
                        if row is not None:
                            row['reason'] = '已在本次旅行中安排'
                        continue
                    if priority is not None and attraction_id == priority.attraction['id']:
                        if row is not None:
                            row['reason'] = '已在当天较晚时段预留'
                        continue
                    if is_excluded_by_preferences(
                        attraction, excluded_ids, excluded_tags, must_ids
                    ):
                        if row is not None:
                            row['reason'] = '命中不去的景点或排除标签'
                        continue
                    if active_cap is not None and state.attraction_count >= active_cap and attraction_id not in must_ids:
                        continue
                    cost, price_complete = ticket_cost(attraction, request["party"])
                    if not price_complete and attraction_id not in must_ids:
                        if row is not None:
                            row['reason'] = '当前人员所需参考票价不完整'
                        continue
                    budget = request["ticket_budget"]
                    if (
                        not budget["unlimited"]
                        and total_cost + cost + (priority.cost if priority else 0) > budget["total"]
                        and attraction_id not in must_ids
                    ):
                        if row is not None:
                            row['reason'] = '加入后超过门票预算'
                        continue
                    duration_key = "minimum_minutes" if plan_type == "compact" else "suggested_minutes"
                    duration = attraction["duration"][duration_key]
                    diagnostics = [] if row is not None else None
                    slot, _reason = slot_for_attraction(
                        state,
                        attraction,
                        duration,
                        deadline=candidate_deadline,
                        deadline_location=candidate_deadline_location,
                        diagnostics=diagnostics,
                    )
                    if slot is None and event_kind == 'meal' and next_meal:
                        slot = visit_after_meal(
                            state, attraction, duration, next_meal,
                            deadline=following_deadline, deadline_location=following_location,
                            diagnostics=diagnostics,
                        )
                        if slot is None and request.get('allow_skip_meal_for_long_visit', False) and not skipped_meal_used:
                            slot = visit_skipping_meal(
                                state, attraction, duration, next_meal,
                                deadline=following_deadline, deadline_location=following_location,
                                diagnostics=diagnostics,
                            )
                    if slot and priority is not None and not priority_fits(
                        state, pending_meals, priority, (0, attraction, duration, cost, slot)):
                        slot = None
                        _reason = 'time_conflict'
                        if diagnostics is not None:
                            diagnostics.append({'attempt': '较晚优先景点衔接', 'valid': False,
                                                'detail': '无法同时保留已预留景点、完整用餐及返程。'})
                    if slot:
                        normal_candidates.append(
                            (
                                score_attraction(
                                    attraction,
                                    preferences,
                                    state.current_location,
                                    state.current_time,
                                ) + same_day_bonus(attraction['location'], state.items)
                                if visit_sequences is None else -visit_sequences[day['date']].index(attraction_id),
                                attraction,
                                duration,
                                cost,
                                slot,
                            )
                        )
                    if row is not None:
                        row['duration'] = duration
                        row['attempts'] = diagnostics
                        row['ticket_cost'] = cost
                        if slot:
                            row.update(reason='可行候选', score=normal_candidates[-1][0],
                                       parts=attraction_score_parts(attraction, preferences, state.current_location, state.current_time) |
                                             {'nearby': same_day_bonus(attraction['location'], state.items)},
                                       matching_tags=sorted(set(attraction.get('tags', [])) & set(preferences['preferred_tags'])),
                                       start_time=clock(slot['start']), end_time=clock(slot['end']),
                                       meal_before_visit='meal_before_visit' in slot)
                        else:
                            row['reason'] = {'closed': '当天不开放', 'capacity': '游览与到达当天终点无法同时放下',
                                             'time_conflict': '开放时间或用餐衔接不满足'}.get(_reason, '当前时段无法放入')
            if observing:
                selected = max(normal_candidates, key=lambda value: value[0]) if normal_candidates else None
                action = f"选中{selected[1]['name']}" if selected else (
                    f"无可行景点，先尝试预留{'午餐' if next_meal[0] == 'lunch' else '晚餐'}" if next_meal else '无可行景点，结束当天选景')
                emit('selection', f"第{day_index + day_index_offset + 1}天第{_ + 1}轮：{action}", date=day['date'],
                     current_time=clock(state.current_time), current_location=state.items[-1]['name'],
                     selected_id=selected[1]['id'] if selected else None, candidate_count=len(normal_candidates),
                     ticket_cost_so_far=total_cost, candidates=sorted(trace_rows, key=lambda value: -value.get('score', -1e9)),
                     meal_deadline=clock(candidate_deadline) if candidate_deadline is not None else None,
                     function='build_plan / slot_for_attraction / score_attraction / same_day_bonus')
            if normal_candidates and priority is None and not priority_checked and visit_sequences is None:
                priority_checked = True
                priority = reserve_first_priority(state, max(normal_candidates, key=lambda value: value[0]),
                                                   pending_meals, preferences)
                if priority is not None:
                    if priority_reservations is not None:
                        priority_reservations.setdefault(day['date'], set()).add(priority.attraction['id'])
                    if observing:
                        emit('selection', f"第{day_index + day_index_offset + 1}天：先预留{priority.attraction['name']}的较晚时段", date=day['date'],
                             message=f"已确保{clock(priority.start)}开始游览，先从当前地点安排此前可用时段，再核对完整用餐与返程。",
                             reserved_priority_id=priority.attraction['id'], reserved_start=clock(priority.start),
                             function='reserve_first_priority / priority_fits')
                    continue
            if normal_candidates:
                if visit_sequences is None:
                    last_round = LastVisitRound.capture(
                        state, normal_candidates, pending_meals, used_ids, total_cost,
                        skipped_meal_used, warnings, _ + 1)
                _, attraction, duration, cost, slot = max(
                    normal_candidates, key=lambda value: value[0]
                )
                skipped = apply_visit(state, pending_meals, warnings, (0, attraction, duration, cost, slot))
                if skipped is None:
                    raise RuntimeError('A validated arrival meal could not be applied')
                skipped_meal_used = skipped_meal_used or skipped
                used_ids.add(attraction["id"])
                total_cost += cost
                continue

            if priority is not None:
                if not place_priority(state, pending_meals, warnings, priority):
                    raise RuntimeError('A validated priority reservation could not be applied')
                used_ids.add(priority.attraction['id'])
                total_cost += priority.cost
                if observing:
                    emit('selection', f"第{day_index + day_index_offset + 1}天：接续已预留的{priority.attraction['name']}",
                         date=day['date'], message=f"按预留时段{clock(priority.start)}开始游览。",
                         function='place_priority')
                priority = None
                last_round = None
                continue

            if event_kind == "meal" and next_meal:
                pending_meals.pop(0)
                meal_kind, target, latest = next_meal
                unused_open_candidates = any(
                    attraction["id"] not in used_ids
                    and not is_excluded_by_preferences(
                        attraction, excluded_ids, excluded_tags, must_ids
                    )
                    and bool(opening_intervals(attraction, state.visit_date))
                    for attraction in attractions
                )
                if state.attraction_count == 0 and not unused_open_candidates:
                    pending_meals.clear()
                    continue
                deadline = deadline_location = None
                reserved = schedule_meal_break(
                    state,
                    meal_kind,
                    target,
                    latest,
                    deadline=deadline,
                    deadline_location=deadline_location,
                )
                if not reserved and meal_kind == 'dinner':
                    reserved = schedule_meal_break(
                        state, meal_kind, target, latest,
                        deadline=None, deadline_location=None,
                        destination=state.end_location_ref['location'],
                    )
                meal_label = "午餐" if meal_kind == "lunch" else "晚餐"
                if observing:
                    emit('selection', f"第{day_index + day_index_offset + 1}天{meal_label}{'已预留' if reserved else '未能预留'}", date=day['date'],
                         message=f"当前时间{clock(state.current_time)}，随后继续检查是否能加入景点。", function='schedule_meal_break')
                if reserved:
                    warnings.append(notice('meal_reserved',
                        f"{day['date']} 的{meal_label}已预留60分钟，可自由选择餐馆。"))
                else:
                    warnings.append(
                        f"{day['date']} 的{meal_label}无法在现有安排中安全预留。"
                    )
                continue

            break

        if last_round is not None:
            state, used_ids, total_cost, skipped_meal_used, warnings = reconsider_last_visit(
                last_round, state, used_ids, total_cost, skipped_meal_used, warnings, preferences)
        finish_day(state)
        days_output.append(
            {
                "date": day["date"],
                "start_location": start_ref,
                "end_location": end_ref,
                "items": state.items,
                "legs": state.legs,
            }
        )
        if observing:
            emit('selection', f"第{day_index + day_index_offset + 1}天初稿完成", plans=[plan_snapshot({
                'plan_type': plan_type, 'total_ticket_cost': round(total_cost, 2), 'days': [days_output[-1]],
            })], function='finish_day')

    explicit_ids = (
        set(preferences["must_visit_ids"])
        | set(preferences["interested_ids"])
        | excluded_ids
    )
    unplanned = []
    for attraction_id in sorted(explicit_ids - used_ids):
        attraction = attraction_by_id[attraction_id]
        reason, message = reason_for_unplanned(attraction, request, total_cost)
        unplanned.append(
            {"attraction_id": attraction_id, "reason_code": reason, "message": message}
        )

    budget = request["ticket_budget"]
    budget_exceeded = not budget["unlimited"] and total_cost > budget["total"]
    if budget_exceeded:
        warnings.append("为优先安排必须去景点，本方案超过了门票预算。")
    summaries = {
        "relaxed": "按轻松节奏安排景点，并预留用餐与交通时间。",
        "compact": "使用最短合理游玩时长，在保留用餐时间的前提下安排更多景点。",
        "duck": "按轻松节奏安排景点，随后选择沿途南京鸭用餐区域。",
    }
    return {
        "plan_type": plan_type,
        "summary": summaries[plan_type],
        "total_ticket_cost": round(total_cost, 2),
        "budget_exceeded": budget_exceeded,
        "days": days_output,
        "warnings": list(dict.fromkeys(warnings)),
        "unplanned_attractions": unplanned,
    }
