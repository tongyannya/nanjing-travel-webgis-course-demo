"""Formal dining-area insertion and honest meal-break fallback rules."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .models import DayState
from .time_rules import clock
from .transport import estimate_leg, location_payload


ZERO_WALK_MEAL_ADVANCE_MINUTES = 30


def meal_start_time(state: DayState, target: int, leg: dict[str, Any]) -> int:
    """Let a zero-minute transfer close the final half-hour before a meal target."""

    arrival = state.current_time + leg["duration_minutes_rounded"]
    if (
        leg["mode"] == "walk"
        and leg["duration_minutes_rounded"] == 0
        and state.current_time >= target - ZERO_WALK_MEAL_ADVANCE_MINUTES
    ):
        return state.current_time
    return max(target, arrival)


def schedule_meal(
    state: DayState,
    meal_kind: str,
    target: int,
    latest_start: int,
    choices: list[dict[str, Any]],
    *,
    item_type: str,
    ref_key: str,
    location_key: str,
    deadline: int | None,
    deadline_location: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Insert the first feasible ordered meal choice without displacing later events."""
    for choice in choices:
        if item_type == "meal_area" and not choice.get("has_suitable_area"):
            continue
        source = choice["restaurant"] if item_type == "duck_restaurant" else choice
        item_id = state.item_id("meal_probe")
        state.serial -= 1
        destination = source[location_key]
        leg = estimate_leg(
            state.current_location,
            destination,
            state.transport_preference,
            state.items[-1]["item_id"],
            item_id,
            travel_details_by_key=state.travel_details_by_key,
            transit_details_by_key=state.transit_details_by_key,
            taxi_fallback_keys=state.taxi_fallback_keys,
            fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
        )
        start = meal_start_time(state, target, leg)
        end = start + 60
        if start > latest_start:
            continue
        if deadline is not None:
            transfer = 0
            if deadline_location is not None:
                transfer = estimate_leg(
                    destination,
                    deadline_location,
                    state.transport_preference,
                    item_id,
                    "deadline_item",
                    travel_details_by_key=state.travel_details_by_key,
                    transit_details_by_key=state.transit_details_by_key,
                    taxi_fallback_keys=state.taxi_fallback_keys,
                    fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
                )["duration_minutes_rounded"]
            if end + transfer > deadline:
                continue
        return_leg = estimate_leg(
            destination,
            state.end_location_ref["location"],
            state.transport_preference,
            item_id,
            "end_item",
            travel_details_by_key=state.travel_details_by_key,
            transit_details_by_key=state.transit_details_by_key,
            taxi_fallback_keys=state.taxi_fallback_keys,
            fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
        )
        if end + return_leg["duration_minutes_rounded"] > state.day_end:
            continue
        item_id = state.item_id("meal")
        leg["to_item_id"] = item_id
        state.legs.append(leg)
        is_duck = item_type == "duck_restaurant"
        notes = (
            "按鸭菜类别和路线位置筛选的餐馆。"
            if is_duck
            else f"{choice['message']} {choice['note']}"
        )
        item = {
            "item_id": item_id,
            "type": item_type,
            "ref_id": source[ref_key],
            "name": source["name"],
            "start_time": clock(start),
            "end_time": clock(end),
            "duration_minutes": 60,
            "location": location_payload(destination),
            "ticket_cost": 0,
            "meal_kind": meal_kind,
            "locked": False,
            "notes": notes,
        }
        if item_type == "meal_area":
            item["dining_area"] = deepcopy(choice)
        elif is_duck:
            item["duck_restaurant"] = deepcopy(source)
            item["featured_duck_type"] = choice["featured_duck_type"]
        state.items.append(item)
        state.current_time = end
        state.current_location = location_payload(destination)
        return choice
    return None


def schedule_meal_break(
    state: DayState,
    meal_kind: str,
    target: int,
    latest_start: int,
    *,
    deadline: int | None,
    deadline_location: dict[str, Any] | None,
    destination: dict[str, Any] | None = None,
    fixed_start: int | None = None,
) -> bool:
    """Reserve an honest meal break when no real suitable dining area is available."""

    item_id = state.item_id("meal_break_probe")
    state.serial -= 1
    destination = destination if destination is not None else state.current_location
    leg = estimate_leg(
        state.current_location,
        destination,
        state.transport_preference,
        state.items[-1]["item_id"],
        item_id,
        travel_details_by_key=state.travel_details_by_key,
        transit_details_by_key=state.transit_details_by_key,
        taxi_fallback_keys=state.taxi_fallback_keys,
        fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
    )
    start = meal_start_time(state, target, leg) if fixed_start is None else fixed_start
    if start < state.current_time + leg['duration_minutes_rounded']:
        return False
    end = start + 60
    if start > latest_start:
        return False
    if deadline is not None:
        transfer = 0
        if deadline_location is not None:
            transfer = estimate_leg(
                destination,
                deadline_location,
                state.transport_preference,
                item_id,
                "deadline_item",
                travel_details_by_key=state.travel_details_by_key,
                transit_details_by_key=state.transit_details_by_key,
                taxi_fallback_keys=state.taxi_fallback_keys,
                fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
            )["duration_minutes_rounded"]
        if end + transfer > deadline:
            return False
    return_leg = estimate_leg(
        destination,
        state.end_location_ref["location"],
        state.transport_preference,
        item_id,
        "end_item",
        travel_details_by_key=state.travel_details_by_key,
        transit_details_by_key=state.transit_details_by_key,
        taxi_fallback_keys=state.taxi_fallback_keys,
        fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
    )
    if end + return_leg["duration_minutes_rounded"] > state.day_end:
        return False

    item_id = state.item_id("meal_break")
    leg["to_item_id"] = item_id
    state.legs.append(leg)
    meal_label = "午餐" if meal_kind == "lunch" else "晚餐"
    state.items.append(
        {
            "item_id": item_id,
            "type": "free_time",
            "ref_id": None,
            "name": f"{meal_label}时间（餐饮区域暂不可用）",
            "start_time": clock(start),
            "end_time": clock(end),
            "duration_minutes": 60,
            "location": location_payload(destination),
            "ticket_cost": 0,
            "meal_kind": meal_kind,
            "locked": False,
            "notes": "已预留用餐时间，未找到可安全插入的真实餐饮便利区。",
        }
    )
    state.current_time = end
    state.current_location = location_payload(destination)
    return True
