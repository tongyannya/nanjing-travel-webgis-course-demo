"""Operations that mutate one day's chronological planning state."""

from __future__ import annotations

from typing import Any

from .models import DayState
from .time_rules import clock, minutes, opening_intervals, visit_start
from .transport import estimate_leg, location_payload


def make_start(state: DayState) -> None:
    """Initialize a day with its zero-duration departure node."""
    item_id = state.item_id("start")
    state.current_time = minutes(state.day["start_time"])
    state.current_location = location_payload(state.start_location_ref["location"])
    state.items.append(
        {
            "item_id": item_id,
            "type": "start",
            "ref_id": None,
            "name": state.start_location_ref["name"],
            "start_time": clock(state.current_time),
            "end_time": clock(state.current_time),
            "duration_minutes": 0,
            "location": state.current_location,
            "ticket_cost": 0,
            "meal_kind": None,
            "locked": False,
            "notes": None,
        }
    )


def slot_for_attraction(
    state: DayState,
    attraction: dict[str, Any],
    duration: int,
    *,
    exact_start: int | None = None,
    deadline: int | None = None,
    deadline_location: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, str]:
    """Find a legal visit slot while preserving future events and day return."""
    temporary_id = "candidate_item"
    leg = estimate_leg(
        state.current_location,
        attraction["location"],
        state.transport_preference,
        state.items[-1]["item_id"],
        temporary_id,
        travel_details_by_key=state.travel_details_by_key,
        transit_details_by_key=state.transit_details_by_key,
        taxi_fallback_keys=state.taxi_fallback_keys,
        fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
    )
    arrival = state.current_time + leg["duration_minutes_rounded"]
    start = visit_start(attraction, state.visit_date, arrival, duration, exact_start)
    if start is None:
        reason = (
            "closed"
            if not opening_intervals(attraction, state.visit_date)
            else "time_conflict"
        )
        return None, reason
    end = start + duration
    if deadline is not None:
        transfer = 0
        if deadline_location is not None:
            transfer = estimate_leg(
                attraction["location"],
                deadline_location,
                state.transport_preference,
                temporary_id,
                "deadline_item",
                travel_details_by_key=state.travel_details_by_key,
                transit_details_by_key=state.transit_details_by_key,
                taxi_fallback_keys=state.taxi_fallback_keys,
                fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
            )["duration_minutes_rounded"]
        if end + transfer > deadline:
            return None, "time_conflict"
    return_leg = estimate_leg(
        attraction["location"],
        state.end_location_ref["location"],
        state.transport_preference,
        temporary_id,
        "end_item",
        travel_details_by_key=state.travel_details_by_key,
        transit_details_by_key=state.transit_details_by_key,
        taxi_fallback_keys=state.taxi_fallback_keys,
        fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
    )
    if end + return_leg["duration_minutes_rounded"] > state.day_end:
        return None, "capacity"
    return {"leg": leg, "start": start, "end": end}, ""


def append_attraction(
    state: DayState,
    attraction: dict[str, Any],
    duration: int,
    cost: float,
    slot: dict[str, Any],
    *,
    locked: bool,
) -> None:
    """Append a previously validated attraction slot and its incoming leg."""
    item_id = state.item_id("attraction")
    leg = dict(slot["leg"])
    leg["to_item_id"] = item_id
    state.legs.append(leg)
    note_parts = []
    if locked:
        note_parts.append("用户手动锁定时间")
    if state.plan_type == "compact":
        note_parts.append("采用最短合理游玩时长")
    reservation = attraction.get("reservation", {})
    if reservation.get("required") in {"yes", "conditional"}:
        note_parts.append(
            f"请提前确认预约：{reservation.get('channel_name') or '以景区官方渠道为准'}"
        )
    state.items.append(
        {
            "item_id": item_id,
            "type": "attraction",
            "ref_id": attraction["id"],
            "name": attraction["name"],
            "start_time": clock(slot["start"]),
            "end_time": clock(slot["end"]),
            "duration_minutes": duration,
            "location": location_payload(attraction["location"]),
            "ticket_cost": cost,
            "meal_kind": None,
            "locked": locked,
            "notes": "；".join(note_parts) or None,
        }
    )
    state.current_time = slot["end"]
    state.current_location = location_payload(attraction["location"])
    state.attraction_count += 1


def finish_day(state: DayState) -> None:
    """Close a day with its endpoint and a final transport leg."""
    item_id = state.item_id("end")
    leg = estimate_leg(
        state.current_location,
        state.end_location_ref["location"],
        state.transport_preference,
        state.items[-1]["item_id"],
        item_id,
        travel_details_by_key=state.travel_details_by_key,
        transit_details_by_key=state.transit_details_by_key,
        taxi_fallback_keys=state.taxi_fallback_keys,
        fallback_missing_transit_to_taxi=state.fallback_missing_transit_to_taxi,
    )
    arrival = state.current_time + leg["duration_minutes_rounded"]
    if arrival > state.day_end:
        arrival = state.day_end
        leg["route_summary"].append("当日可用时间不足，终点时间按计划结束时间截断")
    state.legs.append(leg)
    state.items.append(
        {
            "item_id": item_id,
            "type": "end",
            "ref_id": None,
            "name": state.end_location_ref["name"],
            "start_time": clock(arrival),
            "end_time": clock(arrival),
            "duration_minutes": 0,
            "location": location_payload(state.end_location_ref["location"]),
            "ticket_cost": 0,
            "meal_kind": None,
            "locked": False,
            "notes": None,
        }
    )
