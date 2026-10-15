"""Public planning service and PlanResponse v1 validation."""

from __future__ import annotations

import json
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import AbstractSet, Any, Mapping, Sequence

from jsonschema import Draft202012Validator, FormatChecker

from ..data_store import LocalDataError
from .models import (
    PLAN_TYPES,
    DiningAreasBySlot,
    DuckRestaurantsBySlot,
    PlanGenerationError,
    PlanType,
)
from .plan_contract import validate_plan_response_semantics
from .schedule import build_plan
from .route_order import optimize_visit_order


PROJECT_ROOT = Path(__file__).resolve().parents[3]
PLAN_SCHEMA_PATH = PROJECT_ROOT / "data" / "schemas" / "plan_response.schema.json"


@lru_cache(maxsize=1)
def _plan_validator() -> Draft202012Validator:
    try:
        schema = json.loads(PLAN_SCHEMA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LocalDataError("行程输出规范暂时无法读取。") from exc
    return Draft202012Validator(schema, format_checker=FormatChecker())


def generate_plans(
    request: dict[str, Any],
    *,
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
    plan_types: Sequence[PlanType] | None = None,
    repair_records: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Generate the requested plan variants and validate the public response contract."""
    selected_plan_types = tuple(plan_types) if plan_types is not None else PLAN_TYPES
    dining_areas_by_slot = dining_areas_by_slot or {}
    duck_restaurants_by_slot = duck_restaurants_by_slot or {}
    if (
        not selected_plan_types
        or len(set(selected_plan_types)) != len(selected_plan_types)
        or any(plan_type not in PLAN_TYPES for plan_type in selected_plan_types)
    ):
        raise ValueError("plan_types 必须是非空、无重复的有效方案类型序列")
    has_suitable_dining_area = bool(
        dining_areas_by_slot
        and any(
            area.get("has_suitable_area")
            for areas in dining_areas_by_slot.values()
            for area in areas
        )
    )
    result = {
        "request_id": request["request_id"],
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "data_version": "attractions-formal-v1",
        "is_mock": False,
        "plans": [
            build_plan(
                plan_type,
                request,
                travel_details_by_key=travel_details_by_key,
                transit_details_by_key=transit_details_by_key,
                taxi_fallback_keys=taxi_fallback_keys,
                fallback_missing_transit_to_taxi=fallback_missing_transit_to_taxi,
                dining_areas_by_slot=dining_areas_by_slot,
                duck_restaurants_by_slot=duck_restaurants_by_slot,
            )
            for plan_type in selected_plan_types
        ],
        "global_warnings": [
            "当前使用 40 个已审计正式景点数据。",
            *(
                [
                    "餐饮便利区根据当前规划周边采集的餐馆数量确定。",
                    "普通餐饮节点只推荐区域，具体饭店由用户自行选择。",
                ]
                if has_suitable_dining_area
                else ["已启用正式用餐时段；未取得合适区域的餐次只保留用餐时间。"]
            ),
            "开放时间采用常规规则，出发前仍需通过景区官方渠道确认临时闭馆和余票。",
            "交通时间按坐标距离估算并向上取整到半小时。",
        ],
    }
    if not dining_areas_by_slot and not duck_restaurants_by_slot:
        result['plans'] = [optimize_visit_order(plan, lambda orders, kind=plan['plan_type']: build_plan(
            kind, request, visit_sequences=orders, travel_details_by_key=travel_details_by_key,
            transit_details_by_key=transit_details_by_key, taxi_fallback_keys=taxi_fallback_keys,
            fallback_missing_transit_to_taxi=fallback_missing_transit_to_taxi,
        ), request=request, repair_records=(repair_records.setdefault(plan['plan_type'], {})
            if repair_records is not None else None)) for plan in result['plans']]
    errors = sorted(
        _plan_validator().iter_errors(result),
        key=lambda item: list(item.absolute_path),
    )
    if errors:
        first = errors[0]
        path = ".".join(str(part) for part in first.absolute_path) or "response"
        raise PlanGenerationError(f"行程输出未通过 PlanResponse v1 校验：{path}。")
    validate_plan_response_semantics(result)
    return result
