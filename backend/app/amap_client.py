"""Small, project-scoped wrappers around AMap Web Service API 2.0."""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from .amap_transport import AMapConfigError, AMapUpstreamError, current_amap_transport

from .settings import amap_web_service_key
from .driving_routes import DrivingRouteDataError, normalize_driving_route
from .travel_time_rules import TRAVEL_BUFFER_MINUTES
from .transit_routes import (
    TransitRouteDataError,
    normalize_transit_route,
)


NANJING_CITYCODE = "025"
NANJING_ADCODE = "320100"
NANJING_LONGITUDE_RANGE = (118.0, 119.3)
NANJING_LATITUDE_RANGE = (31.2, 32.7)
POI_TYPE_CODES = {
    "all": None,
    "attraction": "110000",
    "hotel": "100000",
    "restaurant": "050000",
    "transport": "150200|150500",
}


def get_web_service_key() -> str:
    key = amap_web_service_key()
    if not key:
        raise AMapConfigError("缺少高德 Web 服务配置，请先填写本地 .env。")
    return key


async def amap_get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    request_params = {**params, "key": get_web_service_key()}
    return await current_amap_transport().get(
        path, request_params, validate=lambda payload: _validate_cache_payload(path, payload)
    )


def _validate_cache_payload(path: str, payload: dict[str, Any]) -> None:
    """Do not retain unusable successful provider envelopes as successful routes."""
    if path.startswith("/v5/place/") and not isinstance(payload.get("pois"), list):
        raise AMapUpstreamError("高德接口返回了无法识别的地点数据。")
    try:
        if path == "/v5/direction/transit/integrated":
            normalize_transit_route(payload)
        elif path == "/v5/direction/walking":
            from .path_routes import normalize_path_details
            route = payload.get("route") or {}
            paths = route.get("paths") if isinstance(route, dict) else None
            if not isinstance(paths, list) or not paths or not isinstance(paths[0], dict):
                raise AMapUpstreamError("高德没有返回可用的步行方案。")
            first = paths[0]
            duration = _seconds((first.get("cost") or {}).get("duration"))
            if duration <= 0:
                raise AMapUpstreamError("高德返回的步行路线缺少有效时长。")
            try:
                normalize_path_details(payload, "walk", math.ceil(duration / 60))
            except ValueError as exc:
                raise AMapUpstreamError(str(exc)) from exc
        elif path == "/v5/direction/driving":
            route = payload.get("route")
            paths = route.get("paths") if isinstance(route, dict) else None
            if not isinstance(paths, list) or not paths or not isinstance(paths[0], dict):
                raise AMapUpstreamError("高德没有返回可用的道路方案。")
            first = paths[0]
            duration = _seconds((first.get("cost") or {}).get("duration"))
            if duration <= 0:
                raise AMapUpstreamError("高德返回的路线缺少有效时长。")
            normalize_driving_route(first, mode="taxi", total_minutes=math.ceil(duration / 60))
    except (TransitRouteDataError, DrivingRouteDataError) as exc:
        raise AMapUpstreamError(str(exc)) from exc


def _business_dict(poi: dict[str, Any]) -> dict[str, Any]:
    business = poi.get("business")
    return business if isinstance(business, dict) else {}


def _text(value: Any, fallback: str = "") -> str:
    if isinstance(value, list):
        return "、".join(str(item) for item in value if item not in (None, "")) or fallback
    return str(value) if value not in (None, "") else fallback


def _optional_float(value: Any) -> float | None:
    try:
        return float(value) if value not in (None, "", []) else None
    except (TypeError, ValueError):
        return None


def _optional_bounded_float(
    value: Any, *, minimum: float = 0, maximum: float | None = None
) -> float | None:
    number = _optional_float(value)
    if number is None or not math.isfinite(number) or number < minimum:
        return None
    if maximum is not None and number > maximum:
        return None
    return number


def _optional_text(value: Any) -> str | None:
    text = _text(value).strip()
    return text or None


def _optional_non_negative_int(value: Any) -> int | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number) or number < 0:
        return None
    return int(round(number))


def _nanjing_location(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, str) or "," not in value:
        return None
    try:
        longitude_text, latitude_text = value.split(",", 1)
        longitude = float(longitude_text)
        latitude = float(latitude_text)
    except ValueError:
        return None
    if not math.isfinite(longitude) or not math.isfinite(latitude):
        return None
    if not NANJING_LONGITUDE_RANGE[0] <= longitude <= NANJING_LONGITUDE_RANGE[1]:
        return None
    if not NANJING_LATITUDE_RANGE[0] <= latitude <= NANJING_LATITUDE_RANGE[1]:
        return None
    return {
        "longitude": longitude,
        "latitude": latitude,
        "coord_system": "GCJ-02",
    }


def normalize_restaurant_poi(
    poi: dict[str, Any], *, fetched_at: datetime | None = None
) -> dict[str, Any] | None:
    """Convert one raw AMap restaurant to the stable project contract."""

    poi_id = _optional_text(poi.get("id"))
    location = _nanjing_location(poi.get("location"))
    if poi_id is None or location is None:
        return None

    business = _business_dict(poi)
    fetched_time = fetched_at or datetime.now().astimezone()
    return {
        "poi_id": poi_id,
        "name": _optional_text(poi.get("name")) or "未命名饭店",
        "address": _optional_text(poi.get("address")),
        "location": location,
        "category": _optional_text(poi.get("type")),
        "distance_m": _optional_non_negative_int(poi.get("distance")),
        "rating": _optional_bounded_float(business.get("rating"), maximum=5),
        "average_cost": _optional_bounded_float(business.get("cost")),
        "telephone": _optional_text(business.get("tel")),
        "duck_types": [],
        "source": "amap",
        "fetched_at": fetched_time.isoformat(timespec="seconds"),
    }


def normalize_restaurant_pois(
    pois: list[dict[str, Any]], *, fetched_at: datetime | None = None
) -> list[dict[str, Any]]:
    """Normalize and de-duplicate restaurants while preserving provider order."""

    unique_restaurants: dict[str, dict[str, Any]] = {}
    for poi in pois:
        normalized = normalize_restaurant_poi(poi, fetched_at=fetched_at)
        if normalized is not None and normalized["poi_id"] not in unique_restaurants:
            unique_restaurants[normalized["poi_id"]] = normalized
    return list(unique_restaurants.values())


def _is_nanjing_restaurant_result(poi: dict[str, Any]) -> bool:
    """Reject provider rows that explicitly identify a non-Nanjing/non-food POI."""

    adcode = _optional_text(poi.get("adcode"))
    if adcode is not None and not adcode.startswith(NANJING_ADCODE[:4]):
        return False

    typecode = _optional_text(poi.get("typecode"))
    if typecode is not None and not any(
        value.strip().startswith("05")
        for value in typecode.replace(";", "|").split("|")
    ):
        return False
    if typecode is None:
        category = _optional_text(poi.get("type"))
        if category is not None and not any(
            hint in category
            for hint in ("餐饮", "餐厅", "中餐", "小吃", "快餐", "粉面")
        ):
            return False
    return True


async def fetch_restaurant_page(
    *,
    longitude: float,
    latitude: float,
    radius_meters: int,
    page_num: int,
    page_size: int,
) -> dict[str, Any]:
    """Fetch one bounded AMap page and expose only normalized restaurants."""

    payload = await amap_get(
        "/v5/place/around",
        {
            "location": f"{longitude:.6f},{latitude:.6f}",
            "radius": radius_meters,
            "types": POI_TYPE_CODES["restaurant"],
            "page_size": page_size,
            "page_num": page_num,
            "show_fields": "business",
        },
    )
    raw_pois = payload.get("pois")
    if not isinstance(raw_pois, list):
        raw_pois = []
    restaurants = normalize_restaurant_pois(raw_pois)
    return {
        "page_num": page_num,
        "page_size": page_size,
        "raw_returned_count": len(raw_pois),
        "returned_count": len(restaurants),
        "has_more": len(raw_pois) >= page_size,
        "restaurants": restaurants,
        "source": "amap",
    }


async def fetch_duck_restaurant_page(
    *,
    keyword: str,
    longitude: float | None,
    latitude: float | None,
    radius_meters: int,
    page_num: int,
    page_size: int,
) -> dict[str, Any]:
    """Fetch one controlled text/nearby page for the dedicated F4 service."""

    params: dict[str, Any] = {
        "keywords": keyword,
        "types": POI_TYPE_CODES["restaurant"],
        "page_size": page_size,
        "page_num": page_num,
        "show_fields": "business",
    }
    if longitude is None and latitude is None:
        path = "/v5/place/text"
        query_mode = "text"
        params.update({"region": NANJING_ADCODE, "city_limit": "true"})
    elif longitude is not None and latitude is not None:
        path = "/v5/place/around"
        query_mode = "around"
        params.update(
            {
                "location": f"{longitude:.6f},{latitude:.6f}",
                "radius": radius_meters,
                "sortrule": "distance",
            }
        )
    else:
        raise ValueError("longitude and latitude must be supplied together")

    payload = await amap_get(path, params)
    raw_pois = payload.get("pois")
    if not isinstance(raw_pois, list):
        raw_pois = []
    filtered_pois = [
        poi
        for poi in raw_pois
        if isinstance(poi, dict) and _is_nanjing_restaurant_result(poi)
    ]
    restaurants = normalize_restaurant_pois(filtered_pois)
    return {
        "keyword": keyword,
        "query_mode": query_mode,
        "page_num": page_num,
        "page_size": page_size,
        "raw_returned_count": len(raw_pois),
        "returned_count": len(restaurants),
        "has_more": len(raw_pois) >= page_size,
        "restaurants": restaurants,
        "source": "amap",
    }


HOTEL_PRICE_BANDS = ((200, "under_200"), (300, "200_300"), (400, "300_400"), (500, "400_500"))


def _hotel_price_band(value: Any) -> str:
    """Map an AMap reference price to the documented band, or "unknown"."""

    cost = _optional_bounded_float(value)
    if cost is None:
        return "unknown"
    for threshold, band in HOTEL_PRICE_BANDS:
        if cost < threshold:
            return band
    return "over_500"


def normalize_hotel_poi(
    poi: dict[str, Any], *, fetched_at: datetime | None = None
) -> dict[str, Any] | None:
    """Convert one raw AMap hotel to the stable project contract."""

    poi_id = _optional_text(poi.get("id"))
    location = _nanjing_location(poi.get("location"))
    if poi_id is None or location is None:
        return None

    business = _business_dict(poi)
    fetched_time = fetched_at or datetime.now().astimezone()
    return {
        "poi_id": poi_id,
        "name": _optional_text(poi.get("name")) or "未命名酒店",
        "address": _optional_text(poi.get("address")),
        "location": location,
        "nearest_metro": None,
        "rating": _optional_bounded_float(business.get("rating"), maximum=5),
        "price_band": _hotel_price_band(business.get("cost")),
        "source": "amap",
        "fetched_at": fetched_time.isoformat(timespec="seconds"),
    }


def normalize_hotel_pois(
    pois: list[dict[str, Any]], *, fetched_at: datetime | None = None
) -> list[dict[str, Any]]:
    """Normalize and de-duplicate hotels while preserving provider order."""

    unique_hotels: dict[str, dict[str, Any]] = {}
    for poi in pois:
        normalized = normalize_hotel_poi(poi, fetched_at=fetched_at)
        if normalized is not None and normalized["poi_id"] not in unique_hotels:
            unique_hotels[normalized["poi_id"]] = normalized
    return list(unique_hotels.values())


async def fetch_hotel_page(
    *,
    longitude: float,
    latitude: float,
    radius_meters: int,
    page_num: int,
    page_size: int,
) -> dict[str, Any]:
    """Fetch one bounded AMap page and expose only normalized hotels."""

    payload = await amap_get(
        "/v5/place/around",
        {
            "location": f"{longitude:.6f},{latitude:.6f}",
            "radius": radius_meters,
            "types": POI_TYPE_CODES["hotel"],
            "page_size": page_size,
            "page_num": page_num,
            "show_fields": "business",
        },
    )
    raw_pois = payload.get("pois")
    if not isinstance(raw_pois, list):
        raw_pois = []
    hotels = normalize_hotel_pois(raw_pois)
    return {
        "page_num": page_num,
        "page_size": page_size,
        "raw_returned_count": len(raw_pois),
        "returned_count": len(hotels),
        "has_more": len(raw_pois) >= page_size,
        "hotels": hotels,
        "source": "amap",
    }


def normalize_poi(poi: dict[str, Any]) -> dict[str, Any] | None:
    location_text = poi.get("location")
    if not isinstance(location_text, str) or "," not in location_text:
        return None
    try:
        longitude_text, latitude_text = location_text.split(",", 1)
        longitude = float(longitude_text)
        latitude = float(latitude_text)
    except ValueError:
        return None

    business = _business_dict(poi)
    return {
        "poi_id": _text(poi.get("id")),
        "name": _text(poi.get("name"), "未命名地点"),
        "type": _text(poi.get("type")),
        "typecode": _text(poi.get("typecode")),
        "address": _text(poi.get("address"), "地址暂无"),
        "district": _text(poi.get("adname")),
        "location": {
            "longitude": longitude,
            "latitude": latitude,
            "coord_system": "GCJ-02",
        },
        "rating": _optional_float(business.get("rating")),
        "average_cost_yuan": _optional_float(business.get("cost")),
        "telephone": _text(business.get("tel")) or None,
        "source": "amap",
    }


async def search_pois(
    *,
    keyword: str,
    category: str,
    longitude: float | None = None,
    latitude: float | None = None,
    radius: int = 3000,
    page_size: int = 20,
    page_num: int = 1,
) -> dict[str, Any]:
    type_codes = POI_TYPE_CODES[category]
    params: dict[str, Any] = {
        "keywords": keyword,
        "page_size": page_size,
        "page_num": page_num,
        "show_fields": "business",
    }
    if type_codes:
        params["types"] = type_codes

    if longitude is not None and latitude is not None:
        path = "/v5/place/around"
        params.update(
            {
                "location": f"{longitude:.6f},{latitude:.6f}",
                "radius": radius,
            }
        )
    else:
        path = "/v5/place/text"
        params.update({"region": "南京", "city_limit": "true"})

    payload = await amap_get(path, params)
    pois = [normalized for item in payload.get("pois", []) if (normalized := normalize_poi(item))]
    return {
        "keyword": keyword,
        "category": category,
        "query_mode": "around" if path.endswith("around") else "text",
        "page_num": page_num,
        "page_size": page_size,
        "returned_count": len(pois),
        "has_more": len(pois) >= page_size,
        "pois": pois,
        "source": "amap",
    }


async def dining_density(
    *, longitude: float, latitude: float, radius: int, max_pages: int = 3
) -> dict[str, Any]:
    unique_pois: dict[str, dict[str, Any]] = {}
    pages_queried = 0
    page_size = 25
    last_page_was_full = False

    for page_num in range(1, max_pages + 1):
        payload = await amap_get(
            "/v5/place/around",
            {
                "location": f"{longitude:.6f},{latitude:.6f}",
                "radius": radius,
                "types": POI_TYPE_CODES["restaurant"],
                "page_size": page_size,
                "page_num": page_num,
                "show_fields": "business",
            },
        )
        pages_queried += 1
        page_items = payload.get("pois", [])
        for item in page_items:
            normalized = normalize_poi(item)
            if normalized and normalized["poi_id"]:
                unique_pois[normalized["poi_id"]] = normalized
        last_page_was_full = len(page_items) >= page_size
        if not last_page_was_full:
            break

    sampled_count = len(unique_pois)
    if sampled_count >= 50:
        level, label = "high", "餐饮选择丰富"
    elif sampled_count >= 20:
        level, label = "medium", "餐饮选择较方便"
    else:
        level, label = "low", "餐饮选择较少"

    return {
        "center": {
            "longitude": longitude,
            "latitude": latitude,
            "coord_system": "GCJ-02",
        },
        "radius_m": radius,
        "sampled_count": sampled_count,
        "density_level": level,
        "density_label": label,
        "pages_queried": pages_queried,
        "is_capped": pages_queried == max_pages and last_page_was_full,
        "sample_pois": list(unique_pois.values())[:10],
        "source": "amap",
        "note": "采集餐馆数量用于比较周边餐饮便利度。",
    }


def _seconds(value: Any) -> int:
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return 0


async def travel_time(
    *, origin: tuple[float, float], destination: tuple[float, float], mode: str
) -> dict[str, Any]:
    origin_text = f"{origin[0]:.6f},{origin[1]:.6f}"
    destination_text = f"{destination[0]:.6f},{destination[1]:.6f}"
    transit_details = None
    driving_details = None

    if mode == "walk":
        payload = await amap_get(
            "/v5/direction/walking",
            {"origin": origin_text, "destination": destination_text, "show_fields": "cost,polyline"},
        )
        route = payload.get("route") or {}
        paths = route.get("paths") or []
        if not paths:
            raise AMapUpstreamError("高德没有返回可用的步行方案。")
        path = paths[0]
        seconds = _seconds((path.get("cost") or {}).get("duration") or path.get("duration"))
        if seconds <= 0:
            raise AMapUpstreamError("步行方案缺少有效时长。")
        raw_minutes = math.ceil(seconds / 60)
        estimated_minutes = raw_minutes
        distance_m = _seconds(path.get("distance"))
        buffer_minutes = 0
        note = "实际步行路线和预计耗时。"
    elif mode == "public_transit":
        payload = await amap_get(
            "/v5/direction/transit/integrated",
            {
                "origin": origin_text,
                "destination": destination_text,
                "city1": NANJING_CITYCODE,
                "city2": NANJING_CITYCODE,
                "ad1": NANJING_ADCODE,
                "ad2": NANJING_ADCODE,
                "AlternativeRoute": 1,
                "show_fields": "cost,polyline",
            },
        )
        try:
            transit_details = normalize_transit_route(payload)
        except TransitRouteDataError as exc:
            raise AMapUpstreamError(str(exc)) from exc
        route = payload.get("route") or {}
        distance_m = _seconds(route.get("distance"))
        buffer_minutes = TRAVEL_BUFFER_MINUTES
        note = "高德公交方案时间四舍五入到 10 分钟，再增加 10 分钟等候和换乘余量。"
        raw_minutes = transit_details["total_minutes"]
        estimated_minutes = transit_details["conservative_minutes"]
    else:
        payload = await amap_get(
            "/v5/direction/driving",
            {
                "origin": origin_text,
                "destination": destination_text,
                "show_fields": "cost,polyline",
            },
        )
        route = payload.get("route") or {}
        paths = route.get("paths") or []
        if not paths:
            raise AMapUpstreamError("高德没有返回可用的道路方案。")
        path = paths[0]
        seconds = _seconds((path.get("cost") or {}).get("duration"))
        distance_m = _seconds(path.get("distance"))
        if seconds <= 0:
            raise AMapUpstreamError("高德返回的路线缺少有效时长。")
        raw_minutes = math.ceil(seconds / 60)
        buffer_minutes = 0
        estimated_minutes = raw_minutes
        note = "使用高德道路行驶时间，未增加候车或停车余量。"
        try:
            driving_details = normalize_driving_route(
                path,
                mode=mode,
                total_minutes=raw_minutes,
            )
        except DrivingRouteDataError as exc:
            raise AMapUpstreamError(str(exc)) from exc

    result = {
        "mode": mode,
        "raw_minutes": raw_minutes,
        "buffer_minutes": buffer_minutes,
        "estimated_minutes": estimated_minutes,
        "display": f"约 {estimated_minutes // 60} 小时"
        if estimated_minutes >= 60 and estimated_minutes % 60 == 0
        else f"约 {estimated_minutes} 分钟",
        "distance_m": distance_m,
        "source": "amap",
        "note": note,
    }
    if transit_details is not None:
        result["transit_details"] = transit_details
    if driving_details is not None:
        result["driving_details"] = driving_details
    from .path_routes import normalize_path_details
    try:
        result["path_details"] = normalize_path_details(payload, mode, raw_minutes)
    except ValueError:
        result["path_details"] = None
        if mode == "walk":
            raise AMapUpstreamError("步行方案缺少有效轨迹。")
    return result
