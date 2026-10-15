"""Clock, opening-hours, closure, and meal-window rules."""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Any


WEEKDAY_NAMES = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)
MEAL_WINDOWS = {
    "lunch": (11 * 60 + 30, 13 * 60 + 30),
    "dinner": (17 * 60 + 30, 20 * 60),
}


def minutes(value: str) -> int:
    hour, minute = value.split(":")
    return int(hour) * 60 + int(minute)


def clock(value: int) -> str:
    value = max(0, min(value, 23 * 60 + 59))
    return f"{value // 60:02d}:{value % 60:02d}"


MONTH_RANGE_PATTERN = re.compile(r"(\d{1,2})月至(?:次年)?(\d{1,2})月")
DATE_RANGE_PATTERN = re.compile(
    r"每年(\d{1,2})月(\d{1,2})日至(\d{1,2})月(\d{1,2})日"
)


def _month_in_range(month: int, start_month: int, end_month: int) -> bool:
    if start_month <= end_month:
        return start_month <= month <= end_month
    return month >= start_month or month <= end_month


def _date_in_annual_range(
    visit_date: date,
    start_month: int,
    start_day: int,
    end_month: int,
    end_day: int,
) -> bool:
    current = (visit_date.month, visit_date.day)
    start = (start_month, start_day)
    end = (end_month, end_day)
    if start <= end:
        return start <= current <= end
    return current >= start or current <= end


def _period_matches_date(label: str, visit_date: date) -> bool:
    date_range = DATE_RANGE_PATTERN.search(label)
    if date_range:
        within_range = _date_in_annual_range(
            visit_date,
            *(int(value) for value in date_range.groups()),
        )
        # Some imported rows describe the closed portion while carrying the
        # ordinary opening hours to use outside that portion.
        return not within_range if "闭馆" in label else within_range

    month_range = MONTH_RANGE_PATTERN.search(label)
    if month_range:
        start_month, end_month = (int(value) for value in month_range.groups())
        return _month_in_range(visit_date.month, start_month, end_month)
    return True


def _is_special_closed(attraction: dict[str, Any], visit_date: date) -> bool:
    rule = attraction.get("opening", {}).get("closed_rules") or ""
    is_last_week = (visit_date + timedelta(days=7)).month != visit_date.month
    return "每月最后一周周三" in rule and visit_date.weekday() == 2 and is_last_week


def opening_intervals(attraction: dict[str, Any], visit_date: date) -> list[tuple[int, int, int]]:
    if _is_special_closed(attraction, visit_date):
        return []
    weekday = WEEKDAY_NAMES[visit_date.weekday()]
    last_entry_text = attraction.get("opening", {}).get("last_entry")
    intervals = []
    for period in attraction.get("opening", {}).get("regular", []):
        if weekday not in period.get("days", []) or not _period_matches_date(
            period.get("period_label", ""), visit_date
        ):
            continue
        opening = minutes(period["open"])
        closing = minutes(period["close"])
        last_entry = minutes(last_entry_text) if last_entry_text else closing
        intervals.append((opening, closing, last_entry))
    return intervals


def visit_start(
    attraction: dict[str, Any],
    visit_date: date,
    arrival: int,
    duration: int,
    exact_start: int | None = None,
) -> int | None:
    for opening, closing, last_entry in opening_intervals(attraction, visit_date):
        start = exact_start if exact_start is not None else max(arrival, opening)
        if start >= arrival and start >= opening and start <= last_entry and start + duration <= closing:
            return start
    return None


def meal_targets(day: dict[str, Any]) -> list[tuple[str, int, int]]:
    """Return meal kind, preferred start, and latest start for a full one-hour meal."""
    day_start = minutes(day["start_time"])
    day_end = minutes(day["end_time"])
    targets = []
    for meal_kind, (window_start, window_end) in MEAL_WINDOWS.items():
        target = max(day_start, window_start)
        latest_start = min(day_end - 60, window_end - 60)
        if target <= latest_start:
            targets.append((meal_kind, target, latest_start))
    return targets
