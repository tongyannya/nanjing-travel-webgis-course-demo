"""Bounded provider search and reusable classification for duck restaurants."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import ValidationError

from .amap_client import (
    AMapConfigError,
    AMapUpstreamError,
    fetch_duck_restaurant_page,
    get_web_service_key,
)
from .amap_transport import check_plan_deadline, gather_amap_queries
from .api_models import RestaurantPoi
from .duck_restaurant_classification import (
    DUCK_SEARCH_KEYWORDS,
    SUPPORTED_DUCK_TYPES,
    DuckRuleMatch,
    classify_duck_restaurant,
)


DUCK_SEARCH_PAGE_SIZE = 25
DUCK_MAX_PAGES_PER_KEYWORD = 2
DUCK_MAX_TOTAL_CALLS = len(DUCK_SEARCH_KEYWORDS) * DUCK_MAX_PAGES_PER_KEYWORD
DUCK_SEARCH_CONCURRENCY = 3
DUCK_SEARCH_RESULT_LIMIT = 50
DUCK_DEFAULT_RADIUS_METERS = 1500

PageLookup = Callable[..., Awaitable[dict[str, Any]]]
PageFailure = Literal["config", "upstream", "invalid"]


@dataclass(frozen=True)
class ClassifiedDuckRestaurant:
    """One stable RestaurantPoi plus non-public classification evidence."""

    restaurant: dict[str, Any]
    matches: tuple[DuckRuleMatch, ...]

    @property
    def matched_rule_ids(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys(match.rule_id for match in self.matches))


@dataclass(frozen=True)
class _PageOutcome:
    restaurants: tuple[Mapping[str, Any], ...] = ()
    has_more: bool = False
    failure: PageFailure | None = None


@dataclass(frozen=True)
class _KeywordOutcome:
    restaurants: tuple[Mapping[str, Any], ...]
    attempted: int
    succeeded: int
    failed: int
    is_capped: bool
    config_failed: bool = False


def classify_restaurant_candidate(
    candidate: Mapping[str, Any],
) -> ClassifiedDuckRestaurant | None:
    """Validate one normalized POI and discard candidates without supported evidence."""

    try:
        restaurant = RestaurantPoi.model_validate(candidate)
    except (TypeError, ValidationError):
        return None

    classification = classify_duck_restaurant(
        name=restaurant.name,
        category=restaurant.category,
    )
    if not classification.duck_types:
        return None

    payload = restaurant.model_dump(mode="json")
    # Never trust labels supplied by a caller. The dedicated F4 path owns them.
    payload["duck_types"] = list(classification.duck_types)
    return ClassifiedDuckRestaurant(
        restaurant=payload,
        matches=classification.matches,
    )


def _ordered_duck_types(values: Iterable[str]) -> list[str]:
    unique_values = set(values)
    return [duck_type for duck_type in SUPPORTED_DUCK_TYPES if duck_type in unique_values]


def classify_and_merge_duck_restaurants(
    candidates: Iterable[Mapping[str, Any]],
) -> list[ClassifiedDuckRestaurant]:
    """Classify, de-duplicate by POI ID, and merge supported types deterministically."""

    unique_candidates: dict[str, ClassifiedDuckRestaurant] = {}
    for candidate in candidates:
        classified = classify_restaurant_candidate(candidate)
        if classified is None:
            continue

        poi_id = classified.restaurant["poi_id"]
        existing = unique_candidates.get(poi_id)
        if existing is None:
            unique_candidates[poi_id] = classified
            continue

        merged_restaurant = dict(existing.restaurant)
        merged_restaurant["duck_types"] = _ordered_duck_types(
            [
                *existing.restaurant["duck_types"],
                *classified.restaurant["duck_types"],
            ]
        )
        merged_matches = tuple(
            dict.fromkeys([*existing.matches, *classified.matches])
        )
        unique_candidates[poi_id] = ClassifiedDuckRestaurant(
            restaurant=merged_restaurant,
            matches=merged_matches,
        )

    return list(unique_candidates.values())


def _validate_page_payload(payload: Any) -> _PageOutcome:
    if not isinstance(payload, Mapping):
        return _PageOutcome(failure="invalid")

    raw_count = payload.get("raw_returned_count")
    restaurants = payload.get("restaurants")
    if (
        isinstance(raw_count, bool)
        or not isinstance(raw_count, int)
        or raw_count < 0
        or not isinstance(restaurants, list)
    ):
        return _PageOutcome(failure="invalid")

    normalized = tuple(
        candidate for candidate in restaurants if isinstance(candidate, Mapping)
    )
    has_more = payload.get("has_more")
    if not isinstance(has_more, bool):
        has_more = raw_count >= DUCK_SEARCH_PAGE_SIZE
    return _PageOutcome(restaurants=normalized, has_more=has_more)


async def _request_page(
    *,
    fetch_page: PageLookup,
    semaphore: asyncio.Semaphore,
    keyword: str,
    longitude: float | None,
    latitude: float | None,
    radius_meters: int,
    page_num: int,
) -> _PageOutcome:
    try:
        async with semaphore:
            check_plan_deadline()
            payload = await fetch_page(
                keyword=keyword,
                longitude=longitude,
                latitude=latitude,
                radius_meters=radius_meters,
                page_num=page_num,
                page_size=DUCK_SEARCH_PAGE_SIZE,
            )
    except AMapConfigError:
        return _PageOutcome(failure="config")
    except AMapUpstreamError:
        return _PageOutcome(failure="upstream")
    return _validate_page_payload(payload)


async def _search_keyword(
    *,
    fetch_page: PageLookup,
    semaphore: asyncio.Semaphore,
    keyword: str,
    longitude: float | None,
    latitude: float | None,
    radius_meters: int,
) -> _KeywordOutcome:
    candidates: list[Mapping[str, Any]] = []
    attempted = 0
    succeeded = 0
    failed = 0
    is_capped = False
    config_failed = False

    for page_num in range(1, DUCK_MAX_PAGES_PER_KEYWORD + 1):
        check_plan_deadline()
        page = await _request_page(
            fetch_page=fetch_page,
            semaphore=semaphore,
            keyword=keyword,
            longitude=longitude,
            latitude=latitude,
            radius_meters=radius_meters,
            page_num=page_num,
        )
        attempted += 1

        if page.failure is not None:
            failed += 1
            config_failed = page.failure == "config"
            break

        succeeded += 1
        candidates.extend(page.restaurants)
        if not page.has_more:
            break
        if page_num == DUCK_MAX_PAGES_PER_KEYWORD:
            is_capped = True

    return _KeywordOutcome(
        restaurants=tuple(candidates),
        attempted=attempted,
        succeeded=succeeded,
        failed=failed,
        is_capped=is_capped,
        config_failed=config_failed,
    )


def _sort_around_results(
    restaurants: list[ClassifiedDuckRestaurant],
) -> list[ClassifiedDuckRestaurant]:
    return sorted(
        restaurants,
        key=lambda item: (
            item.restaurant["distance_m"] is None,
            item.restaurant["distance_m"] or 0,
        ),
    )


async def search_duck_restaurants(
    *,
    longitude: float | None = None,
    latitude: float | None = None,
    radius_meters: int = DUCK_DEFAULT_RADIUS_METERS,
    fetch_page: PageLookup | None = None,
) -> dict[str, Any]:
    """Search controlled terms with fixed limits and return classified POIs only."""

    if (longitude is None) != (latitude is None):
        raise ValueError("longitude and latitude must be supplied together")

    if fetch_page is None:
        get_web_service_key()
    active_fetch = fetch_page or fetch_duck_restaurant_page
    semaphore = asyncio.Semaphore(DUCK_SEARCH_CONCURRENCY)
    outcomes = await gather_amap_queries(*(
        _search_keyword(
            fetch_page=active_fetch,
            semaphore=semaphore,
            keyword=keyword,
            longitude=longitude,
            latitude=latitude,
            radius_meters=radius_meters,
        ) for keyword in DUCK_SEARCH_KEYWORDS
    ))

    if any(outcome.config_failed for outcome in outcomes):
        raise AMapConfigError("缺少高德 Web 服务 Key，请先填写本地 .env。")

    queries_attempted = sum(outcome.attempted for outcome in outcomes)
    queries_succeeded = sum(outcome.succeeded for outcome in outcomes)
    failed_query_count = sum(outcome.failed for outcome in outcomes)
    if queries_attempted > DUCK_MAX_TOTAL_CALLS:
        raise RuntimeError("duck restaurant query budget exceeded")
    if queries_succeeded == 0:
        raise AMapUpstreamError("高德鸭类餐饮搜索未取得可用响应，请稍后重试。")

    candidates = [
        candidate
        for outcome in outcomes
        for candidate in outcome.restaurants
    ]
    classified = classify_and_merge_duck_restaurants(candidates)
    query_mode: Literal["text", "around"] = (
        "text" if longitude is None else "around"
    )
    if query_mode == "around":
        classified = _sort_around_results(classified)

    is_capped = any(outcome.is_capped for outcome in outcomes)
    if len(classified) > DUCK_SEARCH_RESULT_LIMIT:
        classified = classified[:DUCK_SEARCH_RESULT_LIMIT]
        is_capped = True

    note = "结果来自高德当前有限页检索，并经受控规则筛选；缺失字段保持 null。"
    if failed_query_count:
        note += " 部分检索词请求失败，已返回其余成功结果。"
    if is_capped:
        note += " 结果已达到分页或返回数量上限。"

    center = None
    if longitude is not None and latitude is not None:
        center = {
            "longitude": longitude,
            "latitude": latitude,
            "coord_system": "GCJ-02",
        }
    restaurants = [item.restaurant for item in classified]
    return {
        "query_mode": query_mode,
        "center": center,
        "radius_meters": radius_meters if query_mode == "around" else None,
        "returned_count": len(restaurants),
        "restaurants": restaurants,
        "queries_attempted": queries_attempted,
        "queries_succeeded": queries_succeeded,
        "failed_query_count": failed_query_count,
        "is_partial": failed_query_count > 0,
        "is_capped": is_capped,
        "source": "amap",
        "note": note,
    }
