"""Validate TripRequest v1 without duplicating the frozen JSON Schema."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator, FormatChecker


PROJECT_ROOT = Path(__file__).resolve().parents[2]
TRIP_SCHEMA_PATH = PROJECT_ROOT / "data" / "schemas" / "trip_request.schema.json"


@lru_cache(maxsize=1)
def trip_validator() -> Draft202012Validator:
    schema = json.loads(TRIP_SCHEMA_PATH.read_text(encoding="utf-8"))
    return Draft202012Validator(schema, format_checker=FormatChecker())


def validate_trip_request(
    payload: dict[str, Any],
    *,
    valid_attraction_ids: set[str] | None = None,
) -> list[dict[str, str | None]]:
    errors = []
    for error in sorted(trip_validator().iter_errors(payload), key=lambda item: list(item.absolute_path)):
        path = ".".join(str(part) for part in error.absolute_path)
        if error.validator == "required":
            missing = error.message.split("'", 2)[1] if "'" in error.message else "未知字段"
            message = f"缺少必填字段：{missing}。"
        elif error.validator == "type":
            message = "字段类型不正确。"
        elif error.validator == "anyOf" and path == "party":
            message = "游玩人数至少包含一名成人或学生。"
        elif error.validator == "enum":
            message = "字段值不在允许范围内。"
        elif error.validator == "minimum":
            message = f"数值不能小于 {error.validator_value}。"
        elif error.validator == "maximum":
            message = f"数值不能大于 {error.validator_value}。"
        elif error.validator == "minItems":
            message = f"至少需要 {error.validator_value} 项。"
        elif error.validator == "maxItems":
            choice_label = {
                "preferences.must_visit_ids": "必须去景点",
                "preferences.excluded_ids": "排除景点",
            }.get(path)
            message = ("手动锁定时间功能已移除，请清空锁定条件后重新生成。" if path == "manual_locks" else
                       f"{choice_label}最多设置 {error.validator_value} 个，请先减少选择。"
                       if choice_label else f"最多允许 {error.validator_value} 项。")
        elif error.validator == "format":
            message = "日期、时间或网址格式不正确。"
        elif error.validator == "additionalProperties":
            message = "包含未定义的字段。"
        else:
            message = "字段内容不符合 TripRequest v1。"
        errors.append({"field": path or None, "message": message})
    if errors:
        return errors

    days = payload["trip_days"]
    dates = [day["date"] for day in days]
    if len(dates) != len(set(dates)):
        errors.append({"field": "trip_days", "message": "游玩日期不能重复。"})
    if dates != sorted(dates):
        errors.append({"field": "trip_days", "message": "游玩日期必须按先后顺序排列。"})
    for index, day in enumerate(days):
        start_hour, start_minute = (int(part) for part in day["start_time"].split(":"))
        end_hour, end_minute = (int(part) for part in day["end_time"].split(":"))
        start = start_hour * 60 + start_minute
        end = end_hour * 60 + end_minute
        if start > 15 * 60:
            errors.append({"field": f"trip_days.{index}.start_time", "message": "每日开始时间不能晚于15:00。"})
        if start < 7 * 60:
            errors.append({"field": f"trip_days.{index}.start_time", "message": "每日开始时间不能早于07:00。"})
        if end < 11 * 60:
            errors.append({"field": f"trip_days.{index}.end_time", "message": "每日结束时间不能早于11:00。"})
        if end - start < 180:
            errors.append(
                {"field": f"trip_days.{index}", "message": "每日结束时间至少比开始时间晚3小时。"}
            )

    preferences = payload["preferences"]
    must_visit = set(preferences["must_visit_ids"])
    interested = set(preferences["interested_ids"])
    excluded = set(preferences["excluded_ids"])
    preferred_tags = set(preferences["preferred_tags"])
    excluded_tags = set(preferences["excluded_tags"])
    for label, conflict in (
        ("必去景点", must_visit & excluded),
        ("感兴趣景点", interested & excluded),
    ):
        if conflict:
            errors.append(
                {
                    "field": "preferences",
                    "message": f"同一景点不能既属于{label}又被排除：{', '.join(sorted(conflict))}。",
                }
            )
    tag_conflict = preferred_tags & excluded_tags
    if tag_conflict:
        errors.append(
            {
                "field": "preferences",
                "message": f"同一标签不能既偏好又排除：{', '.join(sorted(tag_conflict))}。",
            }
        )

    if valid_attraction_ids is not None:
        referenced_ids = must_visit | interested | excluded
        unknown_ids = sorted(referenced_ids - valid_attraction_ids)
        if unknown_ids:
            errors.append(
                {
                    "field": "preferences",
                    "message": f"包含不存在的景点编号：{', '.join(unknown_ids)}。",
                }
            )
    return errors
