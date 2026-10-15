"""High-level AMap services and the browser SDK security proxy."""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, Query, Request, Response

from ..amap_client import (
    AMapConfigError,
    AMapUpstreamError,
    dining_density,
    search_pois,
    travel_time,
)
from ..api_models import (
    DiningArea,
    DiningDensityResponse,
    ErrorResponse,
    HotelSearchResponse,
    MetroNetworkResponse,
    PoiCategory,
    PoiSearchResponse,
    RestaurantSearchResponse,
    TravelTimeRequest,
    TravelTimeResponse,
    WeatherResponse,
)
from ..dining_service import evaluate_dining_area, list_restaurant_candidates
from ..data_store import load_metro_network
from ..errors import ApiError
from ..hotel_service import list_hotel_candidates
from ..settings import amap_js_credentials
from ..weather_service import get_nanjing_weather
from ..amap_transport import current_amap_transport


router = APIRouter()


@router.get(
    "/api/metro-network",
    tags=["map-services"],
    response_model=MetroNetworkResponse,
    responses={500: {"model": ErrorResponse}},
)
def get_metro_network() -> dict[str, Any]:
    """Return the formal metro network without calling AMap at runtime."""

    return load_metro_network()


@router.api_route(
    "/_AMapService/{service_path:path}",
    methods=["GET", "POST"],
    include_in_schema=False,
)
async def amap_security_proxy(service_path: str, request: Request) -> Response:
    _, security_code = amap_js_credentials()
    if not security_code:
        raise AMapConfigError("缺少高德 JS API 安全配置，请先填写本地 .env。")

    base_url = (
        "https://webapi.amap.com"
        if service_path.startswith("v4/map/styles")
        else "https://restapi.amap.com"
    )
    params = list(request.query_params.multi_items())
    params.append(("jscode", security_code))
    try:
        upstream = await current_amap_transport().proxy_client.request(
            request.method,
            f"{base_url}/{service_path}",
            params=params,
            content=await request.body(),
            headers={
                "Content-Type": request.headers.get(
                    "content-type", "application/octet-stream"
                )
            },
        )
    except httpx.HTTPError as exc:
        raise AMapUpstreamError("高德地图安全代理暂时不可用。") from exc

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )


@router.get(
    "/api/poi/search",
    tags=["map-services"],
    response_model=PoiSearchResponse,
    responses={
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def poi_search(
    keyword: str = Query(min_length=1, max_length=80),
    category: PoiCategory = "all",
    longitude: float | None = Query(default=None, ge=118.0, le=119.3),
    latitude: float | None = Query(default=None, ge=31.2, le=32.7),
    radius: int = Query(default=3000, ge=100, le=50000),
    page_num: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=20, ge=1, le=25),
) -> dict[str, Any]:
    if (longitude is None) != (latitude is None):
        raise ApiError(
            status_code=422,
            code="coordinate_pair_required",
            message="经度和纬度必须同时填写。",
            details=[
                {
                    "field": "query.longitude,query.latitude",
                    "message": "请同时提供经度和纬度。",
                }
            ],
        )
    return await search_pois(
        keyword=keyword.strip(),
        category=category,
        longitude=longitude,
        latitude=latitude,
        radius=radius,
        page_num=page_num,
        page_size=page_size,
    )


@router.get(
    "/api/dining-density",
    tags=["map-services"],
    response_model=DiningDensityResponse,
    responses={
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def get_dining_density(
    longitude: float = Query(ge=118.0, le=119.3),
    latitude: float = Query(ge=31.2, le=32.7),
    radius: int = Query(default=1000, ge=300, le=3000),
) -> dict[str, Any]:
    return await dining_density(
        longitude=longitude,
        latitude=latitude,
        radius=radius,
    )


@router.get(
    "/api/dining-areas/evaluate",
    tags=["map-services"],
    response_model=DiningArea,
    responses={
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def get_dining_area(
    longitude: float = Query(ge=118.0, le=119.3),
    latitude: float = Query(ge=31.2, le=32.7),
    near_item_id: str | None = Query(
        default=None,
        min_length=1,
        max_length=80,
        pattern=r"^[A-Za-z0-9_-]+$",
    ),
) -> dict[str, Any]:
    return await evaluate_dining_area(
        longitude=longitude,
        latitude=latitude,
        near_item_id=near_item_id,
    )


@router.get(
    "/api/restaurants/search",
    tags=["map-services"],
    response_model=RestaurantSearchResponse,
    responses={
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def get_restaurants(
    longitude: float = Query(ge=118.0, le=119.3),
    latitude: float = Query(ge=31.2, le=32.7),
    radius_meters: int = Query(default=600, ge=100, le=3000),
    page_num: int = Query(default=1, ge=1, le=100),
    page_size: int = Query(default=20, ge=1, le=25),
) -> dict[str, Any]:
    return await list_restaurant_candidates(
        longitude=longitude,
        latitude=latitude,
        radius_meters=radius_meters,
        page_num=page_num,
        page_size=page_size,
    )


@router.get(
    "/api/hotels/search",
    tags=["map-services"],
    response_model=HotelSearchResponse,
    responses={
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def get_hotels(
    longitude: float = Query(ge=118.0, le=119.3),
    latitude: float = Query(ge=31.2, le=32.7),
    radius_meters: int = Query(default=1000, ge=100, le=3000),
    page_num: int = Query(default=1, ge=1, le=10),
    page_size: int = Query(default=20, ge=1, le=25),
) -> dict[str, Any]:
    return await list_hotel_candidates(
        longitude=longitude,
        latitude=latitude,
        radius_meters=radius_meters,
        page_num=page_num,
        page_size=page_size,
    )


@router.post(
    "/api/travel-time",
    tags=["map-services"],
    response_model=TravelTimeResponse,
    response_model_exclude_unset=True,
    responses={
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def post_travel_time(payload: TravelTimeRequest) -> dict[str, Any]:
    return await travel_time(
        origin=(payload.origin.longitude, payload.origin.latitude),
        destination=(payload.destination.longitude, payload.destination.latitude),
        mode=payload.mode,
    )


@router.get(
    "/api/weather",
    tags=["map-services"],
    response_model=WeatherResponse,
    responses={
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def get_weather() -> dict[str, Any]:
    """Nanjing forecast for the header widget; display-only, never planned on."""

    return await get_nanjing_weather()
