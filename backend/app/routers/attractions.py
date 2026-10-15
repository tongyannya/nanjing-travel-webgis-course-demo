"""Read-only attraction catalogue endpoints."""

from typing import Any

from fastapi import APIRouter, Query

from ..api_models import (
    AttractionCategory,
    AttractionListResponse,
    AttractionTag,
    ErrorResponse,
    ReservationRule,
)
from ..data_store import filter_attractions, find_attraction, load_attractions
from ..errors import ApiError


router = APIRouter()


@router.get(
    "/api/attractions",
    tags=["attractions"],
    response_model=AttractionListResponse,
    responses={422: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def get_attractions(
    query: str | None = Query(default=None, max_length=80),
    district: str | None = Query(default=None, max_length=20),
    category: AttractionCategory | None = None,
    tag: AttractionTag | None = None,
    reservation_required: ReservationRule | None = None,
    free_only: bool | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> dict[str, Any]:
    matches = filter_attractions(
        query=query,
        district=district,
        category=category,
        tag=tag,
        reservation_required=reservation_required,
        free_only=free_only,
    )
    items = matches[offset : offset + limit]
    return {
        "items": items,
        "total": len(matches),
        "returned_count": len(items),
        "offset": offset,
        "limit": limit,
        "is_mock": all(bool(item.get("is_mock")) for item in load_attractions()),
    }


@router.get(
    "/api/attractions/{attraction_id}",
    tags=["attractions"],
    response_model=dict[str, Any],
    responses={404: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def get_attraction(attraction_id: str) -> dict[str, Any]:
    attraction = find_attraction(attraction_id)
    if attraction is None:
        raise ApiError(
            status_code=404,
            code="attraction_not_found",
            message=f"没有找到编号为 {attraction_id} 的景点。",
        )
    return attraction
