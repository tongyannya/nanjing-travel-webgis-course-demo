"""Read-only duck culture content endpoints."""

from typing import Any

from fastapi import APIRouter

from ..api_models import DuckContentDetailResponse, DuckContentListResponse, ErrorResponse
from ..duck_content_store import find_duck_content, list_duck_contents
from ..errors import ApiError


router = APIRouter()


@router.get(
    "/api/duck-culture",
    tags=["duck-culture"],
    response_model=DuckContentListResponse,
    responses={500: {"model": ErrorResponse}},
)
def get_duck_culture_list() -> dict[str, Any]:
    items = list_duck_contents()
    return {
        "items": list(items),
        "total": len(items),
        "returned_count": len(items),
        # The formal dataset is curated; is_mock is false by definition.
        "is_mock": False,
    }


@router.get(
    "/api/duck-culture/{content_id}",
    tags=["duck-culture"],
    response_model=DuckContentDetailResponse,
    responses={404: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
def get_duck_culture_detail(content_id: str) -> dict[str, Any]:
    item = find_duck_content(content_id)
    if item is None:
        raise ApiError(
            status_code=404,
            code="duck_content_not_found",
            message=f"没有找到编号为 {content_id} 的鸭文化内容。",
        )
    return item
