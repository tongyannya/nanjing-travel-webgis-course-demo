"""Display-only Nanjing QWeather v1 forecasts with one-hour process reuse."""

from __future__ import annotations

import asyncio
import math
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .settings import qweather_credentials

WEATHER_TTL_SECONDS = 3600
WEATHER_FORECAST_DAYS_LIMIT = 10
NANJING_ADCODE = "320100"
NANJING_TIMEZONE = timezone(timedelta(hours=8))
WIND_DIRECTIONS = {
    "n": "北风", "nne": "北东北风", "ne": "东北风", "ene": "东东北风",
    "e": "东风", "ese": "东东南风", "se": "东南风", "sse": "南东南风",
    "s": "南风", "ssw": "南西南风", "sw": "西南风", "wsw": "西西南风",
    "w": "西风", "wnw": "西西北风", "nw": "西北风", "nnw": "北西北风",
    "none": "静风", "vrb": "风向不定",
}

_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_fetch_lock = asyncio.Lock()


class WeatherConfigError(RuntimeError):
    """Missing or invalid private weather settings."""


class WeatherUpstreamError(RuntimeError):
    """Safe provider error without URLs, credentials or raw payloads."""


def _optional_text(value: Any) -> str | None:
    if isinstance(value, str):
        text = value.strip()
        if text:
            return text
    return None


def _optional_int(value: Any) -> int | None:
    try:
        number = float(value)
        return round(number) if math.isfinite(number) else None
    except (TypeError, ValueError, OverflowError):
        return None


def _normalize_day(day: Any) -> dict[str, Any] | None:
    if not isinstance(day, dict):
        return None
    try:
        start = datetime.fromisoformat(day["forecastStartTime"].replace("Z", "+00:00"))
        if start.tzinfo is None:
            return None
        forecast_date = start.astimezone(NANJING_TIMEZONE).date().isoformat()
    except (KeyError, TypeError, ValueError, AttributeError):
        return None
    def mapping(value: Any) -> dict:
        return value if isinstance(value, dict) else {}

    result = {
        "date": forecast_date,
        "day_temp": _optional_int(mapping(day.get("temperatureMax")).get("value")),
        "night_temp": _optional_int(mapping(day.get("temperatureMin")).get("value")),
    }
    for prefix, period_name in (("day", "daytime"), ("night", "nighttime")):
        period = mapping(day.get(period_name))
        condition = mapping(period.get("condition"))
        wind = mapping(period.get("wind"))
        direction = mapping(wind.get("direction"))
        result[f"{prefix}_weather"] = _optional_text(condition.get("text"))
        result[f"{prefix}_wind"] = WIND_DIRECTIONS.get(_optional_text(direction.get("compass")))
        scale = _optional_int(wind.get("scale"))
        result[f"{prefix}_wind_power"] = str(scale) if scale is not None else None
    return result


def normalize_weather_forecast(payload: Any, *, retrieved_time: str | None = None) -> dict[str, Any]:
    """Convert QWeather v1; absent publication time and measurements stay null."""
    if not isinstance(payload, dict) or not isinstance(payload.get("days"), list):
        raise WeatherUpstreamError("和风天气没有返回可用的逐日预报，请稍后重试。")
    days = {}
    for day in payload["days"]:
        normalized = _normalize_day(day)
        if normalized is not None:
            days[normalized["date"]] = normalized
    if not days:
        raise WeatherUpstreamError("和风天气预报没有可用的日期数据，请稍后重试。")

    return {
        "city": "南京市",
        "adcode": NANJING_ADCODE,
        "report_time": None,
        "retrieved_time": retrieved_time or datetime.now(NANJING_TIMEZONE).isoformat(timespec="seconds"),
        "forecast_days": [days[date] for date in sorted(days)][:WEATHER_FORECAST_DAYS_LIMIT],
        "source": "qweather",
        "note": "天气来源于和风天气，仅供参考；仅能展示10天天气。获取时间不是发布时间，天气不参与路线规划。",
    }


async def _fetch_forecast() -> dict[str, Any]:
    host, key = qweather_credentials()
    host = host.removeprefix("https://").rstrip("/")
    if not host or not key:
        raise WeatherConfigError("和风天气尚未配置，请填写 QWEATHER_API_HOST 和 QWEATHER_API_KEY。")
    if not re.fullmatch(r"[a-zA-Z0-9.-]+\.qweatherapi\.com", host) or any(char.isspace() for char in key):
        raise WeatherConfigError("和风天气配置格式不正确，请检查 API Host 和 API Key。")
    try:
        # Bound the entire request below the browser's ten-second wait.
        async with asyncio.timeout(8):
            async with httpx.AsyncClient(timeout=7) as client:
                response = await client.get(
                    f"https://{host}/weather/v1/daily/32.06/118.80",
                    params={"days": WEATHER_FORECAST_DAYS_LIMIT, "localTime": "true", "lang": "zh"},
                    headers={"X-QW-Api-Key": key},
                )
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise WeatherUpstreamError("和风天气查询超时，请稍后重试。") from exc
    except httpx.HTTPError as exc:
        raise WeatherUpstreamError("暂时无法连接和风天气，请稍后重试。") from exc
    if response.status_code in (401, 403):
        raise WeatherUpstreamError("和风天气认证或权限不足，请检查后台配置及服务权限。")
    if response.status_code == 429:
        raise WeatherUpstreamError("和风天气请求额度或频率已达上限，请稍后重试。")
    if response.status_code != 200:
        raise WeatherUpstreamError("和风天气服务暂不可用，请稍后重试。")
    try:
        return response.json()
    except ValueError as exc:
        raise WeatherUpstreamError("和风天气返回的数据无法识别，请稍后重试。") from exc


def reset_weather_cache() -> None:
    """Drop cached forecasts; used by tests and cache-introspection only."""

    global _fetch_lock
    _cache.clear()
    _fetch_lock = asyncio.Lock()


def weather_cache_info() -> dict[str, bool]:
    """Report whether a fresh Nanjing forecast is currently cached."""

    entry = _cache.get(NANJING_ADCODE)
    return {"cached": entry is not None and time.monotonic() - entry[0] < WEATHER_TTL_SECONDS}


async def get_nanjing_weather(*, force_refresh: bool = False) -> dict[str, Any]:
    """Share a successful report across both UI contexts and concurrent visitors."""
    if not force_refresh and weather_cache_info()["cached"]:
        return _cache[NANJING_ADCODE][1]
    async with _fetch_lock:
        if not force_refresh and weather_cache_info()["cached"]:
            return _cache[NANJING_ADCODE][1]
        normalized = normalize_weather_forecast(await _fetch_forecast())
        _cache[NANJING_ADCODE] = (time.monotonic(), normalized)
        return normalized
