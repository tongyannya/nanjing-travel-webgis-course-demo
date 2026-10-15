"""Ticket, preference, scoring, and unplanned-reason rules."""

from __future__ import annotations

from datetime import date
from typing import Any

from .time_rules import opening_intervals
from .transport import distance_km


def ticket_cost(attraction: dict[str, Any], party: dict[str, int]) -> tuple[float, bool]:
    """Return a conservative group estimate without modelling senior discounts."""
    total = 0.0
    complete = True
    ticket = attraction.get("ticket", {})
    for group in ("adult", "student", "child"):
        count = party[group]
        price = ticket.get(group)
        if count and price is None:
            complete = False
        elif count:
            total += count * float(price)

    # The internship product does not model age brackets or senior concessions.
    # Seniors therefore use the adult reference price instead of nullable senior data.
    senior_count = party["senior"]
    adult_price = ticket.get("adult")
    if senior_count and adult_price is None:
        complete = False
    elif senior_count:
        total += senior_count * float(adult_price)
    return round(total, 2), complete


def is_excluded_by_preferences(
    attraction: dict[str, Any],
    excluded_ids: set[str],
    excluded_tags: set[str],
    must_ids: set[str],
) -> bool:
    """Keep must-visit attractions even when their tags conflict with exclusions."""
    attraction_id = attraction["id"]
    if attraction_id in excluded_ids:
        return True
    return attraction_id not in must_ids and bool(set(attraction.get("tags", [])) & excluded_tags)


def score_attraction(
    attraction: dict[str, Any],
    preferences: dict[str, Any],
    current_location: dict[str, Any],
    current_time: int,
) -> float:
    score = 0.0
    attraction_id = attraction["id"]
    if attraction_id in preferences["must_visit_ids"]:
        score += 10000
    if attraction_id in preferences["interested_ids"]:
        score += 600
    matching_tag_count = min(
        1,
        len(set(attraction.get("tags", [])) & set(preferences["preferred_tags"])),
    )
    score += matching_tag_count * 120
    score += {"core": 100, "standard": 50, "supplement": 20, None: 0}.get(
        attraction.get("recommendation_level"), 0
    )
    score += {"5A": 90, "4A": 60, "3A": 20, None: 0}.get(attraction.get("quality_grade"), 0)
    if current_time >= 17 * 60 and "night_view" in attraction.get("tags", []):
        score += 80
    score -= distance_km(current_location, attraction["location"]) * 4
    return score


def reason_for_unplanned(
    attraction: dict[str, Any],
    request: dict[str, Any],
    total_cost: float,
) -> tuple[str, str]:
    attraction_id = attraction["id"]
    preferences = request["preferences"]
    if is_excluded_by_preferences(
        attraction,
        set(preferences["excluded_ids"]),
        set(preferences["excluded_tags"]),
        set(preferences["must_visit_ids"]),
    ):
        return "excluded", "该景点被编号或标签排除。"
    if not attraction.get("location"):
        return "missing_data", "该景点缺少可用于排程的坐标。"
    if all(
        not opening_intervals(attraction, date.fromisoformat(day["date"]))
        for day in request["trip_days"]
    ):
        return "closed", "该景点在本次可用日期内均按常规规则闭馆。"
    cost, complete = ticket_cost(attraction, request["party"])
    if not complete:
        return "missing_data", "当前人员构成所需票价资料不完整。"
    budget = request["ticket_budget"]
    if not budget["unlimited"] and total_cost + cost > budget["total"]:
        return "budget", "在当前已安排内容基础上会超过门票预算。"
    return "capacity", "在开放时间、交通余量和每日可用时间内未能容纳该景点。"
