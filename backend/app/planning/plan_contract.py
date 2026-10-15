"""Cross-field checks that JSON Schema cannot express for PlanResponse."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .models import PlanGenerationError
from .route_meals import validate_route_meals


def validate_plan_response_semantics(response: Mapping[str, Any]) -> None:
    """Validate duck-node identity, classification, and itinerary uniqueness."""

    validate_route_meals(response)
    plans = response.get("plans", ())
    plan_types = [plan.get("plan_type") for plan in plans]
    if len(plan_types) != len(set(plan_types)):
        raise PlanGenerationError("同一响应不能包含重复的方案类型。")

    for plan in plans:
        plan_type = plan.get("plan_type")
        used_poi_ids: set[str] = set()
        used_featured_types: set[str] = set()
        for day in plan.get("days", ()):
            for item in day.get("items", ()):
                snapshot = item.get("duck_restaurant")
                featured_type = item.get("featured_duck_type")
                if item.get("type") != "duck_restaurant":
                    if snapshot is not None or featured_type is not None:
                        raise PlanGenerationError(
                            "非鸭类餐饮节点不能携带鸭类饭店快照或主类别。"
                        )
                    continue

                if plan_type != "duck":
                    raise PlanGenerationError("只有鸭子方案可以包含鸭类餐饮节点。")
                if not isinstance(snapshot, Mapping):
                    raise PlanGenerationError("鸭类餐饮节点缺少真实饭店快照。")
                duck_types = snapshot.get("duck_types")
                if (
                    not isinstance(featured_type, str)
                    or not isinstance(duck_types, list)
                    or featured_type not in duck_types
                ):
                    raise PlanGenerationError(
                        "鸭类餐饮主类别必须属于饭店快照的受控类别。"
                    )

                poi_id = snapshot.get("poi_id")
                if item.get("ref_id") != poi_id:
                    raise PlanGenerationError(
                        "鸭类餐饮节点 ref_id 必须等于真实 POI ID。"
                    )
                if item.get("name") != snapshot.get("name"):
                    raise PlanGenerationError(
                        "鸭类餐饮节点名称必须与饭店快照一致。"
                    )
                if item.get("location") != snapshot.get("location"):
                    raise PlanGenerationError(
                        "鸭类餐饮节点坐标必须与饭店快照一致。"
                    )
                if poi_id in used_poi_ids:
                    raise PlanGenerationError("同一鸭类饭店不能在一份行程中重复安排。")
                if featured_type in used_featured_types:
                    raise PlanGenerationError("同一鸭类主类别不能在一份行程中重复安排。")
                used_poi_ids.add(poi_id)
                used_featured_types.add(featured_type)
