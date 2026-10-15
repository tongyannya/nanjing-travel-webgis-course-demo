"""Bounded restaurant sampling and reusable dining-area evaluation."""

from __future__ import annotations

import re
from typing import Any, Literal

from .amap_client import fetch_restaurant_page
from .amap_transport import check_plan_deadline


INITIAL_RADIUS_METERS = 600
FALLBACK_RADIUS_METERS = 800
MIN_SUITABLE_RESTAURANTS = 5
DINING_PAGE_SIZE = 25
DINING_MAX_PAGES = 2
DINING_PREVIEW_LIMIT = 5
DINING_MAX_TOTAL_CALLS = DINING_MAX_PAGES * 2

PageStopReason = Literal["empty_page", "short_page", "duplicate_page", "page_limit"]


def classify_dining_density(restaurant_count: int) -> tuple[str, str]:
    """Map a bounded unique sample to the four product density levels."""

    if restaurant_count >= 30:
        return "cluster", "餐饮集中区域"
    if restaurant_count >= 15:
        return "rich", "餐饮选择较丰富"
    if restaurant_count >= 5:
        return "normal", "餐饮选择一般"
    return "unsuitable", "不适合作为用餐区域"


async def collect_restaurant_sample(
    *,
    longitude: float,
    latitude: float,
    radius_meters: int,
    page_size: int = DINING_PAGE_SIZE,
    max_pages: int = DINING_MAX_PAGES,
) -> dict[str, Any]:
    """Collect a finite, de-duplicated restaurant sample for one radius."""

    unique_restaurants: dict[str, dict[str, Any]] = {}
    pages_queried = 0
    stop_reason: PageStopReason = "page_limit"

    for page_num in range(1, max_pages + 1):
        check_plan_deadline()
        page = await fetch_restaurant_page(
            longitude=longitude,
            latitude=latitude,
            radius_meters=radius_meters,
            page_num=page_num,
            page_size=page_size,
        )
        pages_queried += 1
        raw_returned_count = page["raw_returned_count"]
        new_restaurants = 0
        for restaurant in page["restaurants"]:
            poi_id = restaurant["poi_id"]
            if poi_id not in unique_restaurants:
                unique_restaurants[poi_id] = restaurant
                new_restaurants += 1

        if raw_returned_count == 0:
            stop_reason = "empty_page"
            break
        if raw_returned_count < page_size:
            stop_reason = "short_page"
            break
        if new_restaurants == 0:
            stop_reason = "duplicate_page"
            break
        if page_num == max_pages:
            stop_reason = "page_limit"

    return {
        "restaurants": list(unique_restaurants.values()),
        "pages_queried": pages_queried,
        "is_capped": stop_reason == "page_limit",
        "stop_reason": stop_reason,
    }


def _area_id(longitude: float, latitude: float, near_item_id: str | None) -> str:
    if near_item_id:
        safe_item_id = re.sub(r"[^a-z0-9_]+", "_", near_item_id.lower()).strip("_")
        if safe_item_id:
            return f"dining_area_{safe_item_id}"
    longitude_id = str(round(longitude * 1_000_000))
    latitude_id = str(round(latitude * 1_000_000))
    return f"dining_area_{longitude_id}_{latitude_id}"


def _sample_note(stop_reason: PageStopReason) -> str:
    base = "已采集周边餐饮资料。"
    if stop_reason == "page_limit":
        return f"{base}"
    if stop_reason == "duplicate_page":
        return f"{base} 已合并重复返回的餐馆。"
    return base


async def list_restaurant_candidates(
    *,
    longitude: float,
    latitude: float,
    radius_meters: int,
    page_num: int,
    page_size: int,
) -> dict[str, Any]:
    """Return one normalized restaurant page for an opened dining area."""

    page = await fetch_restaurant_page(
        longitude=longitude,
        latitude=latitude,
        radius_meters=radius_meters,
        page_num=page_num,
        page_size=page_size,
    )
    return {
        "center": {
            "longitude": longitude,
            "latitude": latitude,
            "coord_system": "GCJ-02",
        },
        "radius_meters": radius_meters,
        "page_num": page_num,
        "page_size": page_size,
        "returned_count": page["returned_count"],
        "has_more": page["has_more"],
        "restaurants": page["restaurants"],
        "source": "amap",
        "note": "当前查询中心周边的餐饮资料。",
    }


async def evaluate_dining_area(
    *,
    longitude: float,
    latitude: float,
    near_item_id: str | None = None,
) -> dict[str, Any]:
    """Evaluate 600 meters first and fall back to 800 meters only if needed."""

    initial_sample = await collect_restaurant_sample(
        longitude=longitude,
        latitude=latitude,
        radius_meters=INITIAL_RADIUS_METERS,
    )
    selected_sample = initial_sample
    selected_radius = INITIAL_RADIUS_METERS
    evaluated_radii = [INITIAL_RADIUS_METERS]
    pages_queried = initial_sample["pages_queried"]

    if len(initial_sample["restaurants"]) < MIN_SUITABLE_RESTAURANTS:
        selected_sample = await collect_restaurant_sample(
            longitude=longitude,
            latitude=latitude,
            radius_meters=FALLBACK_RADIUS_METERS,
        )
        selected_radius = FALLBACK_RADIUS_METERS
        evaluated_radii.append(FALLBACK_RADIUS_METERS)
        pages_queried += selected_sample["pages_queried"]

    restaurants = selected_sample["restaurants"]
    restaurant_count = len(restaurants)
    density_level, density_label = classify_dining_density(restaurant_count)
    has_suitable_area = restaurant_count >= MIN_SUITABLE_RESTAURANTS
    message = (
        f"{selected_radius} 米范围内{density_label}。"
        if has_suitable_area
        else "该时段附近餐饮选择较少。"
    )

    return {
        "id": _area_id(longitude, latitude, near_item_id),
        "name": "候选点附近餐饮便利区",
        "center": {
            "longitude": longitude,
            "latitude": latitude,
            "coord_system": "GCJ-02",
        },
        "radius_meters": selected_radius,
        "evaluated_radii_meters": evaluated_radii,
        "restaurant_count": restaurant_count,
        "density_level": density_level,
        "density_label": density_label,
        "has_suitable_area": has_suitable_area,
        "near_item_id": near_item_id,
        "restaurant_preview": restaurants[:DINING_PREVIEW_LIMIT],
        "pages_queried": pages_queried,
        "is_capped": selected_sample["is_capped"],
        "message": message,
        "source": "amap",
        "note": _sample_note(selected_sample["stop_reason"]),
    }
