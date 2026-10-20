"""Planning state and public planning exceptions."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import AbstractSet, Any, Literal, Mapping

from .time_rules import minutes


PlanType = Literal["relaxed", "compact", "duck"]
PLAN_TYPES: tuple[PlanType, ...] = ("relaxed", "compact", "duck")


class PlanGenerationError(RuntimeError):
    """Raised when project data cannot produce a valid PlanResponse v1."""


@dataclass
class DayState:
    plan_type: PlanType
    day_index: int
    day: dict[str, Any]
    start_location_ref: dict[str, Any]
    end_location_ref: dict[str, Any]
    transport_preference: str
    travel_details_by_key: Mapping[tuple, Mapping[str, Any]] = field(default_factory=dict)
    transit_details_by_key: Mapping[
        tuple[float, float, float, float], Mapping[str, Any]
    ] = field(default_factory=dict)
    taxi_fallback_keys: AbstractSet[tuple[float, float, float, float]] = field(
        default_factory=frozenset
    )
    fallback_missing_transit_to_taxi: bool = False
    items: list[dict[str, Any]] = field(default_factory=list)
    legs: list[dict[str, Any]] = field(default_factory=list)
    current_time: int = 0
    current_location: dict[str, Any] = field(default_factory=dict)
    serial: int = 0
    attraction_count: int = 0

    @property
    def visit_date(self) -> date:
        return date.fromisoformat(self.day["date"])

    @property
    def day_end(self) -> int:
        return minutes(self.day["end_time"])

    def item_id(self, suffix: str) -> str:
        self.serial += 1
        return f"{self.plan_type}_{self.day_index + 1:02d}_{self.serial:02d}_{suffix}"
