"""TripRequest v1 validation and route-plan generation endpoint."""

import asyncio
import logging
from typing import Any, Literal

from fastapi import APIRouter, Query, Request, Response

from ..api_models import ErrorResponse
from ..amap_transport import PlanningTimeoutError
from ..data_store import load_attractions
from ..errors import ApiError
from ..planning.route_orchestration import generate_route_hex_plans
from ..trip_validation import validate_trip_request


router = APIRouter()
logger = logging.getLogger("webgis.backend")


async def _wait_for_disconnect(request: Request) -> None:
    # FastAPI has already consumed the JSON body. Await the remaining ASGI
    # disconnect event directly; polling is_disconnected can swallow cancellation.
    while True:
        message = await request.receive()
        if message["type"] == "http.disconnect":
            return


@router.post(
    "/api/plans",
    tags=["plans"],
    response_model=dict[str, Any],
    responses={
        422: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
        504: {"model": ErrorResponse},
    },
)
async def create_plans(
    payload: dict[str, Any],
    request: Request,
    plan_type: Literal["relaxed", "compact", "duck"] = Query(default="relaxed"),
) -> dict[str, Any] | Response:
    validation_errors = validate_trip_request(
        payload,
        valid_attraction_ids={item["id"] for item in load_attractions()},
    )
    if validation_errors:
        raise ApiError(
            status_code=422,
            code="invalid_trip_request",
            message="行程条件不符合 TripRequest v1，请检查标出的字段。",
            details=validation_errors,
        )
    planning = asyncio.create_task(
        generate_route_hex_plans(payload, plan_types=(plan_type,))
    )
    disconnected = asyncio.create_task(_wait_for_disconnect(request))
    try:
        done, _ = await asyncio.wait(
            (planning, disconnected), return_when=asyncio.FIRST_COMPLETED
        )
        if disconnected in done:
            logger.info("Plan generation cancelled after browser disconnect")
            return Response(status_code=499)
        return planning.result()
    except PlanningTimeoutError as exc:
        raise ApiError(
            status_code=504,
            code="plan_generation_timeout",
            message=str(exc),
            retryable=True,
        ) from exc
    finally:
        for task in (planning, disconnected):
            if not task.done():
                task.cancel()
        await asyncio.gather(planning, disconnected, return_exceptions=True)
