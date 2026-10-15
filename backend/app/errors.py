"""Common API errors, safe logging, and exception-handler registration."""

from __future__ import annotations

import logging
import re
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .amap_client import AMapConfigError, AMapUpstreamError
from .data_store import LocalDataError
from .duck_content_store import DuckContentError
from .planning.models import PlanGenerationError
from .weather_service import WeatherConfigError, WeatherUpstreamError


logger = logging.getLogger("webgis.backend")


class RedactAMapKeyFilter(logging.Filter):
    """Hide a REST API key if it appears in an Uvicorn access-log URL."""

    def filter(self, record: logging.LogRecord) -> bool:
        if (
            record.name == "uvicorn.access"
            and isinstance(record.args, tuple)
            and len(record.args) >= 3
        ):
            values = list(record.args)
            values[2] = re.sub(r"([?&]key=)[^&]+", r"\1***", str(values[2]))
            record.args = tuple(values)
        return True


logging.getLogger("uvicorn.access").addFilter(RedactAMapKeyFilter())


class ApiError(RuntimeError):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        retryable: bool = False,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable
        self.details = details or []


def error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    retryable: bool = False,
    details: list[dict[str, Any]] | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "code": code,
                "message": message,
                "retryable": retryable,
                "details": details or [],
            }
        },
    )


def validation_message(error: dict[str, Any]) -> str:
    error_type = error.get("type", "")
    context = error.get("ctx") or {}
    if error_type == "missing":
        return "缺少必填字段。"
    if error_type in {"literal_error", "enum"}:
        return "值不在允许范围内。"
    if error_type in {
        "greater_than_equal",
        "less_than_equal",
        "greater_than",
        "less_than",
    }:
        return "数值超出允许范围。"
    if error_type in {"string_too_short", "too_short"}:
        return "内容或数量不足。"
    if error_type in {"string_too_long", "too_long"}:
        return "内容或数量超过限制。"
    if error_type == "extra_forbidden":
        return "包含未定义的字段。"
    if error_type == "value_error":
        return str(context.get("error") or "字段内容不正确。")
    return "字段格式或类型不正确。"


def handle_api_error(_request: Request, exc: ApiError) -> JSONResponse:
    return error_response(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        retryable=exc.retryable,
        details=exc.details,
    )


def handle_validation_error(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    details = []
    for error in exc.errors():
        field = ".".join(str(part) for part in error.get("loc", [])) or None
        details.append({"field": field, "message": validation_message(error)})
    return error_response(
        status_code=422,
        code="invalid_request",
        message="请求参数不符合要求，请检查标出的字段。",
        details=details,
    )


def handle_amap_config_error(
    _request: Request, exc: AMapConfigError
) -> JSONResponse:
    return error_response(
        status_code=503,
        code="amap_config_missing",
        message=str(exc),
    )


def handle_amap_upstream_error(
    _request: Request, exc: AMapUpstreamError
) -> JSONResponse:
    logger.warning("AMap request failed; infocode=%s", exc.infocode or "none")
    return error_response(
        status_code=502,
        code="amap_upstream_error",
        message=str(exc),
        retryable=True,
    )


def handle_weather_config_error(_request: Request, exc: WeatherConfigError) -> JSONResponse:
    return error_response(status_code=503, code="weather_config_missing", message=str(exc))


def handle_weather_upstream_error(_request: Request, exc: WeatherUpstreamError) -> JSONResponse:
    logger.warning("QWeather request failed")
    return error_response(
        status_code=502, code="weather_upstream_error", message=str(exc), retryable=True,
    )


def handle_local_data_error(_request: Request, exc: LocalDataError) -> JSONResponse:
    logger.error("Local project data is unavailable; type=%s", type(exc).__name__)
    return error_response(
        status_code=500,
        code="local_data_unavailable",
        message=str(exc),
        retryable=True,
    )


def handle_duck_content_error(_request: Request, exc: DuckContentError) -> JSONResponse:
    logger.error("Duck culture data is unavailable; type=%s", type(exc).__name__)
    return error_response(
        status_code=500,
        code="duck_content_unavailable",
        message=str(exc),
        retryable=True,
    )


def handle_plan_generation_error(
    _request: Request, exc: PlanGenerationError
) -> JSONResponse:
    logger.error("Plan generation failed; type=%s", type(exc).__name__)
    return error_response(
        status_code=500,
        code="plan_generation_failed",
        message=str(exc),
        retryable=False,
    )


def handle_http_error(
    _request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    return error_response(
        status_code=exc.status_code,
        code="http_error",
        message=str(exc.detail),
    )


def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled backend error; type=%s", type(exc).__name__)
    return error_response(
        status_code=500,
        code="internal_error",
        message="后端遇到未预期错误，请稍后重试。",
        retryable=True,
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach the stable public error boundary to a FastAPI application."""
    app.add_exception_handler(ApiError, handle_api_error)
    app.add_exception_handler(RequestValidationError, handle_validation_error)
    app.add_exception_handler(AMapConfigError, handle_amap_config_error)
    app.add_exception_handler(AMapUpstreamError, handle_amap_upstream_error)
    app.add_exception_handler(WeatherConfigError, handle_weather_config_error)
    app.add_exception_handler(WeatherUpstreamError, handle_weather_upstream_error)
    app.add_exception_handler(LocalDataError, handle_local_data_error)
    app.add_exception_handler(DuckContentError, handle_duck_content_error)
    app.add_exception_handler(PlanGenerationError, handle_plan_generation_error)
    app.add_exception_handler(StarletteHTTPException, handle_http_error)
    app.add_exception_handler(Exception, handle_unexpected_error)
