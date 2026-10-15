"""Deterministic duck meal-slot ranking, selection, and schedule choices."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from copy import deepcopy
from dataclasses import dataclass, replace
from typing import Any

from pydantic import ValidationError

from ..api_models import DuckRestaurantPoi
from ..duck_restaurant_classification import SUPPORTED_DUCK_TYPES
from .models import DiningSlotKey, MealKind
from .time_rules import MEAL_WINDOWS, minutes
from .transport import distance_km, estimate_leg


DUCK_SEARCH_RADIUS_METERS = 1500
DUCK_CENTER_DISTANCE_LIMIT_METERS = 1000
DUCK_EXTRA_DETOUR_LIMIT_KM = 2.0
_DISTANCE_EPSILON = 1e-6

_TARGETS_BY_DAY_COUNT = {1: 1, 2: 1, 3: 2, 4: 3, 5: 3}
_SEARCH_LIMIT_BY_DAY_COUNT = {1: 4, 2: 4, 3: 6, 4: 6, 5: 6}
_DUCK_TYPE_ORDER = {value: index for index, value in enumerate(SUPPORTED_DUCK_TYPES)}

DuckSearchCacheKey = tuple[float, float, int]


@dataclass(frozen=True)
class DuckMealSearchSlot:
    """One bounded meal slot and the route context used to evaluate detour."""

    key: DiningSlotKey
    visit_date: str
    meal_kind: MealKind
    center: Mapping[str, Any]
    center_source: str
    previous_item: Mapping[str, Any]
    meal_item: Mapping[str, Any]
    following_item: Mapping[str, Any]
    route_order: int
    search_order: int = 0



@dataclass(frozen=True)
class DuckRestaurantCandidate:
    """One validated F4 restaurant at its best route-slot occurrence."""

    slot: DuckMealSearchSlot
    restaurant: Mapping[str, Any]
    featured_type_options: tuple[str, ...]
    extra_detour_km: float
    center_distance_m: float
    time_gap_minutes: int

    @property
    def poi_id(self) -> str:
        return str(self.restaurant["poi_id"])

    @property
    def rank_key(self) -> tuple[Any, ...]:
        return (
            round(self.extra_detour_km, 6),
            round(self.center_distance_m, 3),
            self.time_gap_minutes,
            self.slot.search_order,
            self.poi_id,
        )



@dataclass(frozen=True)
class SelectedDuckRestaurant:
    """A candidate assigned one globally unique featured type."""

    candidate: DuckRestaurantCandidate
    featured_duck_type: str



def target_duck_restaurant_count(day_count: int) -> int:
    try:
        return _TARGETS_BY_DAY_COUNT[day_count]
    except KeyError as exc:
        raise ValueError("duck dining supports trips from 1 to 5 days") from exc



def duck_search_center_limit(day_count: int) -> int:
    try:
        return _SEARCH_LIMIT_BY_DAY_COUNT[day_count]
    except KeyError as exc:
        raise ValueError("duck dining supports trips from 1 to 5 days") from exc



def _duck_plan(response: Mapping[str, Any]) -> Mapping[str, Any]:
    plans = [plan for plan in response.get("plans", ()) if plan.get("plan_type") == "duck"]
    if len(plans) != 1:
        raise ValueError("baseline response must contain exactly one duck plan")
    return plans[0]



def collect_duck_meal_search_slots(
    baseline_response: Mapping[str, Any],
    *,
    day_count: int,
) -> tuple[DuckMealSearchSlot, ...]:
    """Collect a bounded set of lunch-first centers, spread across route dates."""

    slots: list[DuckMealSearchSlot] = []
    route_order = 0
    for day in _duck_plan(baseline_response).get("days", ()):
        items = day.get("items", ())
        for index, meal in enumerate(items):
            meal_kind = meal.get("meal_kind")
            if (
                meal.get("type") not in {"meal_area", "free_time"}
                or meal_kind not in {"lunch", "dinner"}
                or index == 0
                or index == len(items) - 1
            ):
                continue
            previous = items[index - 1]
            following = items[index + 1]
            dining_area = meal.get("dining_area")
            if meal.get("type") == "meal_area" and isinstance(dining_area, Mapping):
                center = dining_area.get("center")
                center_source = "meal_area"
            else:
                center = previous.get("location")
                center_source = "previous_route_node"
            if not isinstance(center, Mapping):
                continue
            slots.append(
                DuckMealSearchSlot(
                    key=("duck", day["date"], meal_kind),
                    visit_date=day["date"],
                    meal_kind=meal_kind,
                    center=center,
                    center_source=center_source,
                    previous_item=previous,
                    meal_item=meal,
                    following_item=following,
                    route_order=route_order,
                )
            )
            route_order += 1

    slots.sort(
        key=lambda slot: (
            slot.meal_kind != "lunch",
            slot.visit_date,
            slot.route_order,
        )
    )
    bounded = slots[: duck_search_center_limit(day_count)]
    return tuple(replace(slot, search_order=index) for index, slot in enumerate(bounded))



def _candidate_for_restaurant(
    slot: DuckMealSearchSlot,
    raw_restaurant: Mapping[str, Any],
    *,
    transport_preference: str,
) -> DuckRestaurantCandidate | None:
    try:
        restaurant = DuckRestaurantPoi.model_validate(raw_restaurant).model_dump(mode="json")
    except (TypeError, ValidationError):
        return None

    location = restaurant["location"]
    center_distance_m = distance_km(dict(slot.center), location) * 1000
    if center_distance_m > DUCK_CENTER_DISTANCE_LIMIT_METERS + _DISTANCE_EPSILON:
        return None

    previous_location = dict(slot.previous_item["location"])
    following_location = dict(slot.following_item["location"])
    direct_km = distance_km(previous_location, following_location)
    via_restaurant_km = distance_km(previous_location, location) + distance_km(
        location, following_location
    )
    extra_detour_km = max(0.0, via_restaurant_km - direct_km)
    if extra_detour_km > DUCK_EXTRA_DETOUR_LIMIT_KM + _DISTANCE_EPSILON:
        return None

    leg = estimate_leg(
        previous_location,
        location,
        transport_preference,
        str(slot.previous_item["item_id"]),
        "duck_candidate",
    )
    target = MEAL_WINDOWS[slot.meal_kind][0]
    estimated_start = max(
        target,
        minutes(str(slot.previous_item["end_time"]))
        + int(leg["duration_minutes_rounded"]),
    )
    latest_start = MEAL_WINDOWS[slot.meal_kind][1] - 60
    if estimated_start > latest_start:
        return None
    next_leg = estimate_leg(
        location,
        following_location,
        transport_preference,
        "duck_candidate",
        str(slot.following_item["item_id"]),
    )
    if (
        estimated_start
        + 60
        + int(next_leg["duration_minutes_rounded"])
        > minutes(str(slot.following_item["start_time"]))
    ):
        return None
    options = tuple(
        duck_type
        for duck_type in SUPPORTED_DUCK_TYPES
        if duck_type in restaurant["duck_types"]
    )
    return DuckRestaurantCandidate(
        slot=slot,
        restaurant=restaurant,
        featured_type_options=options,
        extra_detour_km=extra_detour_km,
        center_distance_m=center_distance_m,
        time_gap_minutes=abs(estimated_start - target),
    )



def rank_duck_restaurant_candidates(
    slot: DuckMealSearchSlot,
    restaurants: Iterable[Mapping[str, Any]],
    *,
    transport_preference: str,
) -> tuple[DuckRestaurantCandidate, ...]:
    """Validate, filter, de-duplicate, and rank one center's F4 response."""

    best_by_poi: dict[str, DuckRestaurantCandidate] = {}
    for raw_restaurant in restaurants:
        candidate = _candidate_for_restaurant(
            slot,
            raw_restaurant,
            transport_preference=transport_preference,
        )
        if candidate is None:
            continue
        existing = best_by_poi.get(candidate.poi_id)
        if existing is None or candidate.rank_key < existing.rank_key:
            best_by_poi[candidate.poi_id] = candidate
    return tuple(sorted(best_by_poi.values(), key=lambda candidate: candidate.rank_key))



def _selection_score(
    selections: Sequence[SelectedDuckRestaurant],
) -> tuple[Any, ...]:
    candidates = [selection.candidate for selection in selections]
    stable = tuple(
        sorted(
            (
                selection.candidate.slot.search_order,
                selection.candidate.poi_id,
                selection.featured_duck_type,
            )
            for selection in selections
        )
    )
    return (
        -len(selections),
        -len({candidate.slot.visit_date for candidate in candidates}),
        -sum(candidate.slot.meal_kind == "lunch" for candidate in candidates),
        round(sum(candidate.extra_detour_km for candidate in candidates), 6),
        round(sum(candidate.center_distance_m for candidate in candidates), 3),
        sum(candidate.time_gap_minutes for candidate in candidates),
        stable,
    )



def select_duck_restaurants(
    candidates_by_slot: Mapping[DiningSlotKey, Sequence[DuckRestaurantCandidate]],
    *,
    target_count: int,
) -> tuple[SelectedDuckRestaurant, ...]:
    """Maximize count and date coverage with unique slots, POIs, and types."""

    if target_count < 0:
        raise ValueError("target_count cannot be negative")
    candidate_pool: dict[tuple[DiningSlotKey, str], DuckRestaurantCandidate] = {}
    for slot, values in candidates_by_slot.items():
        ordered = sorted(values, key=lambda candidate: candidate.rank_key)
        for featured_type in SUPPORTED_DUCK_TYPES:
            matching = [
                candidate
                for candidate in ordered
                if featured_type in candidate.featured_type_options
            ][: max(1, target_count)]
            for candidate in matching:
                candidate_pool[(slot, candidate.poi_id)] = candidate
    candidates = sorted(candidate_pool.values(), key=lambda candidate: candidate.rank_key)
    states: dict[
        tuple[frozenset[DiningSlotKey], frozenset[str], frozenset[str]],
        tuple[SelectedDuckRestaurant, ...],
    ] = {(frozenset(), frozenset(), frozenset()): ()}
    for candidate in candidates:
        updated = dict(states)
        for (used_slots, used_types, used_pois), selections in states.items():
            if (
                len(selections) >= target_count
                or candidate.slot.key in used_slots
                or candidate.poi_id in used_pois
            ):
                continue
            for featured_type in candidate.featured_type_options:
                if featured_type in used_types:
                    continue
                next_selections = (
                    *selections,
                    SelectedDuckRestaurant(candidate, featured_type),
                )
                state_key = (
                    used_slots | {candidate.slot.key},
                    used_types | {featured_type},
                    used_pois | {candidate.poi_id},
                )
                existing = updated.get(state_key)
                if existing is None or _selection_score(next_selections) < _selection_score(existing):
                    updated[state_key] = next_selections
        states = updated

    best = min(states.values(), key=_selection_score)
    return tuple(
        sorted(
            best,
            key=lambda selection: (
                selection.candidate.slot.route_order,
                _DUCK_TYPE_ORDER[selection.featured_duck_type],
                selection.candidate.poi_id,
            ),
        )
    )



def duck_search_cache_key(slot: DuckMealSearchSlot) -> DuckSearchCacheKey:
    return (
        round(float(slot.center["longitude"]), 6),
        round(float(slot.center["latitude"]), 6),
        DUCK_SEARCH_RADIUS_METERS,
    )



def duck_schedule_choices(
    candidates_by_slot: Mapping[DiningSlotKey, Sequence[DuckRestaurantCandidate]],
    selections: Sequence[SelectedDuckRestaurant],
) -> dict[DiningSlotKey, list[dict[str, Any]]]:
    """Keep selected slots/types and add same-type fallbacks without stealing primaries."""

    primary_pois = {selection.candidate.poi_id for selection in selections}
    choices: dict[DiningSlotKey, list[dict[str, Any]]] = {}
    for selection in selections:
        slot = selection.candidate.slot.key
        ordered = [selection.candidate]
        ordered.extend(
            candidate
            for candidate in candidates_by_slot.get(slot, ())
            if candidate.poi_id not in primary_pois
            and selection.featured_duck_type in candidate.featured_type_options
        )
        choices[slot] = [
            {
                "restaurant": deepcopy(dict(candidate.restaurant)),
                "featured_duck_type": selection.featured_duck_type,
            }
            for candidate in ordered
        ]
    return choices
