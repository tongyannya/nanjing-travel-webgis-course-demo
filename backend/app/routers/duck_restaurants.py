"""Dedicated F4 duck-restaurant search API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from ..api_models import DuckRestaurantSearchResponse, ErrorResponse
from ..duck_restaurant_service import (
    DUCK_DEFAULT_RADIUS_METERS,
    search_duck_restaurants,
)
from ..errors import ApiError


router = APIRouter()


@router.get(
    "/api/duck-restaurants/search",
    tags=["duck-restaurants"],
    response_model=DuckRestaurantSearchResponse,
    responses={
        422: {"model": ErrorResponse},
        502: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    },
)
async def get_duck_restaurants(
    longitude: float | None = Query(default=None, ge=118.0, le=119.3),
    latitude: float | None = Query(default=None, ge=31.2, le=32.7),
    radius_meters: int = Query(
        default=DUCK_DEFAULT_RADIUS_METERS,
        ge=100,
        le=3000,
    ),
) -> dict[str, Any]:
    """Use city-wide text search or a bounded nearby search around a center."""

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
    return await search_duck_restaurants(
        longitude=longitude,
        latitude=latitude,
        radius_meters=radius_meters,
    )
