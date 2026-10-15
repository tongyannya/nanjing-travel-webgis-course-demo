"""Day scheduling and three-plan assembly.

The event loop preserves three invariants: items stay chronological, every inserted
item still leaves enough time to reach the day's endpoint, and a future meal or
manual lock cannot be displaced by an ordinary attraction.
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
from .duck_selection import target_duck_restaurant_count
from .meals import schedule_meal, schedule_meal_break
from .models import DayState, DiningAreasBySlot, DuckRestaurantsBySlot, PlanType
from .rules import (
    is_excluded_by_preferences,
    reason_for_unplanned,
    score_attraction,
    ticket_cost,
)
from .time_rules import meal_targets, minutes, opening_intervals
from .visit_meals import visit_after_meal, visit_skipping_meal
from .nearby_attractions import same_day_bonus

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
    dining_areas_by_slot: DiningAreasBySlot | None = None,
    duck_restaurants_by_slot: DuckRestaurantsBySlot | None = None,
) -> dict[str, Any]:
    attractions = list(load_attractions())
    attraction_by_id = {item["id"]: item for item in attractions}
    dining_areas_by_slot = dining_areas_by_slot or {}
    duck_restaurants_by_slot = duck_restaurants_by_slot or {}
    preferences = request["preferences"]
    excluded_ids = set(preferences["excluded_ids"])
    excluded_tags = set(preferences["excluded_tags"])
    must_ids = set(preferences["must_visit_ids"])
    locked_ids = {lock["attraction_id"] for lock in request["manual_locks"]}
    used_ids: set[str] = set()
    skipped_meal_used = False
    failed_locks: dict[str, tuple[str, str]] = {}
    warnings = ["交通时间为坐标距离的保守估算，具体线路需在展示时按需查询高德。"]
    used_duck_poi_ids: set[str] = set()
    used_duck_types: set[str] = set()
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
        pending_locks = sorted(
            [lock for lock in request["manual_locks"] if lock["date"] == day["date"]],
            key=lambda lock: lock["start_time"],
        )

        for _ in range(50):
            while pending_locks and minutes(pending_locks[0]["start_time"]) < state.current_time:
                missed = pending_locks.pop(0)
                failed_locks[missed["attraction_id"]] = (
                    "time_conflict",
                    "手动锁定时间早于前序安排完成时间。",
                )
            next_lock = pending_locks[0] if pending_locks else None
            next_meal = pending_meals[0] if pending_meals else None
            lock_time = minutes(next_lock["start_time"]) if next_lock else None
            meal_time = next_meal[1] if next_meal else None
            event_kind = None
            event_time = None
            if lock_time is not None and (meal_time is None or lock_time <= meal_time):
                event_kind, event_time = "lock", lock_time
            elif meal_time is not None:
                event_kind, event_time = "meal", meal_time
            candidate_deadline = next_meal[2] - 30 if event_kind == "meal" and next_meal else event_time
            candidate_deadline_location = None
            if next_lock and lock_time is not None and (
                candidate_deadline is None or lock_time <= candidate_deadline
            ):
                candidate_deadline = lock_time
                candidate_deadline_location = attraction_by_id[next_lock["attraction_id"]]["location"]

            normal_candidates = []
            sequence = (visit_sequences or {}).get(day['date'], [])
            last_visited = max((index for index, attraction_id in enumerate(sequence)
                                if attraction_id in used_ids), default=-1)
            next_visit = next((attraction_id for attraction_id in sequence[last_visited + 1:]
                               if attraction_id not in used_ids), None)
            following_deadline = pending_meals[1][2] - 30 if len(pending_meals) > 1 else None
            following_location = None
            if next_lock and (following_deadline is None or lock_time <= following_deadline):
                following_deadline = lock_time
                following_location = attraction_by_id[next_lock['attraction_id']]['location']
            if max_per_day is None or state.attraction_count < max_per_day or any(
                item in must_ids for item in attraction_by_id if item not in used_ids
            ):
                for attraction in attractions:
                    attraction_id = attraction["id"]
                    if visit_sequences is not None and attraction_id not in visit_sequences.get(day['date'], []):
                        continue
                    if preserve_visit_order and attraction_id != next_visit:
                        continue
                    if attraction_id in used_ids or attraction_id in locked_ids:
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
                    if slot is None and event_kind == 'meal' and next_meal and not dining_areas_by_slot and not duck_restaurants_by_slot:
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
                    and attraction["id"] not in locked_ids
                    and not is_excluded_by_preferences(
                        attraction, excluded_ids, excluded_tags, must_ids
                    )
                    and bool(opening_intervals(attraction, state.visit_date))
                    for attraction in attractions
                )
                if state.attraction_count == 0 and not pending_locks and not unused_open_candidates:
                    pending_meals.clear()
                    continue
                deadline = lock_time if next_lock and lock_time is not None and lock_time > target else None
                deadline_location = (
                    attraction_by_id[next_lock["attraction_id"]]["location"] if deadline else None
                )
                slot_key = (plan_type, day["date"], meal_kind)
                dining_choices = [
                    dict(item)
                    for item in dining_areas_by_slot.get(slot_key, ())
                ]
                selected = None
                if plan_type == "duck":
                    duck_choices = [
                        dict(item)
                        for item in duck_restaurants_by_slot.get(slot_key, ())
                        if item.get("featured_duck_type") not in used_duck_types
                        and item.get("restaurant", {}).get("poi_id")
                        not in used_duck_poi_ids
                    ]
                    selected = schedule_meal(
                        state,
                        meal_kind,
                        target,
                        latest,
                        duck_choices,
                        item_type="duck_restaurant",
                        ref_key="poi_id",
                        location_key="location",
                        deadline=deadline,
                        deadline_location=deadline_location,
                    )
                    if selected is not None:
                        used_duck_poi_ids.add(selected["restaurant"]["poi_id"])
                        used_duck_types.add(selected["featured_duck_type"])
                if selected is None:
                    selected = schedule_meal(
                        state,
                        meal_kind,
                        target,
                        latest,
                        dining_choices,
                        item_type="meal_area",
                        ref_key="id",
                        location_key="center",
                        deadline=deadline,
                        deadline_location=deadline_location,
                    )
                if selected is None:
                    reserved = schedule_meal_break(
                        state,
                        meal_kind,
                        target,
                        latest,
                        deadline=deadline,
                        deadline_location=deadline_location,
                    )
                    if not reserved and meal_kind == 'dinner' and not pending_locks and not dining_areas_by_slot and not duck_restaurants_by_slot:
                        reserved = schedule_meal_break(
                            state, meal_kind, target, latest,
                            deadline=None, deadline_location=None,
                            destination=state.end_location_ref['location'],
                        )
                    meal_label = "午餐" if meal_kind == "lunch" else "晚餐"
                    if reserved:
                        warnings.append(
                            f"{day['date']} 的{meal_label}未找到合适真实餐饮便利区，"
                            "已保留 60 分钟用餐时间。"
                        )
                    else:
                        warnings.append(
                            f"{day['date']} 的{meal_label}无法在现有安排中安全预留。"
                        )
                continue

            if event_kind == "lock" and next_lock:
                pending_locks.pop(0)
                attraction = attraction_by_id[next_lock["attraction_id"]]
                if attraction["id"] in used_ids:
                    continue
                duration_key = "minimum_minutes" if plan_type == "compact" else "suggested_minutes"
                duration = attraction["duration"][duration_key]
                cost, complete = ticket_cost(attraction, request["party"])
                slot, reason = slot_for_attraction(
                    state,
                    attraction,
                    duration,
                    exact_start=minutes(next_lock["start_time"]),
                )
                if slot:
                    append_attraction(state, attraction, duration, cost, slot, locked=True)
                    used_ids.add(attraction["id"])
                    total_cost += cost
                    if not complete:
                        warnings.append(f"{attraction['name']} 的部分票价缺失，门票合计可能偏低。")
                else:
                    message = (
                        "手动锁定时间与开放时间冲突。"
                        if reason == "closed"
                        else "手动锁定时间无法容纳交通和游玩时长。"
                    )
                    failed_locks[attraction["id"]] = (reason, message)
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
        | locked_ids
    )
    unplanned = []
    for attraction_id in sorted(explicit_ids - used_ids):
        attraction = attraction_by_id[attraction_id]
        if attraction_id in failed_locks:
            reason, message = failed_locks[attraction_id]
        else:
            reason, message = reason_for_unplanned(attraction, request, total_cost)
        unplanned.append(
            {"attraction_id": attraction_id, "reason_code": reason, "message": message}
        )

    budget = request["ticket_budget"]
    budget_exceeded = not budget["unlimited"] and total_cost > budget["total"]
    if budget_exceeded:
        warnings.append("为优先安排必须去景点，本方案超过了门票预算。")
    duck_count = sum(
        item["type"] == "duck_restaurant"
        for day in days_output
        for item in day["items"]
    )
    duck_target = target_duck_restaurant_count(len(request["trip_days"]))
    if plan_type == "duck" and duck_count < duck_target:
        warnings.append(
            f"鸭类餐饮目标 {duck_target} 家，实际安排 {duck_count} 家；"
            "其余候选不足、类别重复或无法通过时间与返程检查。"
        )
    summaries = {
        "relaxed": "正常游客节奏，并在可行的午餐和晚餐时段安排真实餐饮便利区。",
        "compact": "使用最短合理游玩时长，并在不取消用餐的前提下安排更多景点。",
        "duck": (
            f"按轻松节奏安排景点，并在正常用餐时段加入 {duck_count} 家"
            "类别不重复的南京特色鸭类餐饮候选。"
            if duck_count
            else "按轻松节奏安排景点；未找到可安全插入的真实鸭类候选，"
            "已保留普通真实餐饮区域或用餐时间。"
        ),
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
