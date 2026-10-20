"""Internal notice identities; JSON responses keep their existing string arrays."""
from __future__ import annotations


class PlanningNotice(str):
    def __new__(cls, message: str, code: str = ''):
        value = super().__new__(cls, message)
        value.code = code
        return value


def notice(code: str, message: str) -> PlanningNotice:
    return PlanningNotice(message, code)


def has_notice_code(value: str, *codes: str) -> bool:
    return getattr(value, 'code', None) in codes


def constraint_warning_count(plan, *, ignore_traffic_removals=False) -> int:
    ignored = ('meal_reserved', 'traffic_removed') if ignore_traffic_removals else ('meal_reserved',)
    return sum(not has_notice_code(value, *ignored) for value in plan['warnings'])


def traffic_removal_notices(plan):
    return [value for value in plan['warnings'] if has_notice_code(value, 'traffic_removed')]
