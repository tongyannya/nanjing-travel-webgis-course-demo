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
)
from .time_rules import meal_targets, minutes, opening_intervals
from .visit_meals import visit_after_meal, visit_skipping_meal
from .nearby_attractions import same_day_bonus
from .notices import notice

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
) -> dict[str, Any]:
    attractions = list(load_attractions())
    attraction_by_id = {item["id"]: item for item in attractions}
    if request.get('manual_locks'):
        raise PlanGenerationError('手动锁定时间已退出，请重新选择旅行条件。')
    preferences = request["preferences"]
    excluded_ids = set(preferences["excluded_ids"])
    excluded_tags = set(preferences["excluded_tags"])
    must_ids = set(preferences["must_visit_ids"])
    used_ids: set[str] = set()
    skipped_meal_used = False
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
            day_index=day_index,
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

        for _ in range(50):
            next_meal = pending_meals[0] if pending_meals else None
            meal_time = next_meal[1] if next_meal else None
            event_kind = None
            if meal_time is not None:
                event_kind = "meal"
            candidate_deadline = next_meal[2] - 30 if next_meal else None
            candidate_deadline_location = None

            normal_candidates = []
            sequence = (visit_sequences or {}).get(day['date'], [])
            last_visited = max((index for index, attraction_id in enumerate(sequence)
                                if attraction_id in used_ids), default=-1)
            next_visit = next((attraction_id for attraction_id in sequence[last_visited + 1:]
                               if attraction_id not in used_ids), None)
            following_deadline = pending_meals[1][2] - 30 if len(pending_meals) > 1 else None
            following_location = None
            if max_per_day is None or state.attraction_count < max_per_day or any(
                item in must_ids for item in attraction_by_id if item not in used_ids
            ):
                for attraction in attractions:
                    attraction_id = attraction["id"]
                    if visit_sequences is not None and attraction_id not in visit_sequences.get(day['date'], []):
                        continue
                    if preserve_visit_order and attraction_id != next_visit:
                        continue
                    if attraction_id in used_ids:
                        continue
                    if is_excluded_by_preferences(
                        attraction, excluded_ids, excluded_tags, must_ids
                    ):
                        continue
                    if max_per_day is not None and state.attraction_count >= max_per_day and attraction_id not in must_ids:
                        continue
                    cost, price_complete = ticket_cost(attraction, request["party"])
                    if not price_complete and attraction_id not in must_ids:
                        continue
                    budget = request["ticket_budget"]
                    if (
                        not budget["unlimited"]
                        and total_cost + cost > budget["total"]
                        and attraction_id not in must_ids
                    ):
                        continue
                    duration_key = "minimum_minutes" if plan_type == "compact" else "suggested_minutes"
                    duration = attraction["duration"][duration_key]
                    slot, _reason = slot_for_attraction(
                        state,
                        attraction,
                        duration,
                        deadline=candidate_deadline,
                        deadline_location=candidate_deadline_location,
                    )
                    if slot is None and event_kind == 'meal' and next_meal:
                        slot = visit_after_meal(
                            state, attraction, duration, next_meal,
                            deadline=following_deadline, deadline_location=following_location,
                        )
                        if slot is None and request.get('allow_skip_meal_for_long_visit', False) and not skipped_meal_used:
                            slot = visit_skipping_meal(
                                state, attraction, duration, next_meal,
                                deadline=following_deadline, deadline_location=following_location,
                            )
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
            if normal_candidates:
                _, attraction, duration, cost, slot = max(
                    normal_candidates, key=lambda value: value[0]
                )
                if 'meal_before_visit' in slot:
                    meal_kind, target, latest = pending_meals.pop(0)
                    prefix = slot['meal_before_visit']
                    reserved = schedule_meal_break(
                        state, meal_kind, target, latest, deadline=None, deadline_location=None,
                        destination=prefix['destination'], fixed_start=prefix['start'],
                    )
                    if not reserved:
                        raise RuntimeError('A validated arrival meal could not be applied')
                    slot['leg']['from_item_id'] = state.items[-1]['item_id']
                if 'skipped_meal' in slot:
                    pending_meals.pop(0)
                    skipped_meal_used = True
                    label = '午餐' if slot['skipped_meal'] == 'lunch' else '晚餐'
                    warnings.append(
                        f"为完成{attraction['name']}的长时间游览，已按你的选择跳过 {day['date']} 的{label}（本行程最多一次）。"
                    )
                append_attraction(state, attraction, duration, cost, slot, locked=False)
                used_ids.add(attraction["id"])
                total_cost += cost
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
                if reserved:
                    warnings.append(notice('meal_reserved',
                        f"{day['date']} 的{meal_label}已预留60分钟，可自由选择餐馆。"))
                else:
                    warnings.append(
                        f"{day['date']} 的{meal_label}无法在现有安排中安全预留。"
                    )
                continue

            break

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
