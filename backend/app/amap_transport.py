"""Process-owned AMap connections, bounded successful queries and cancellation."""

from __future__ import annotations

import asyncio
from collections import OrderedDict
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from contextvars import ContextVar
from copy import deepcopy
from dataclasses import dataclass
from time import monotonic
from typing import Any

import httpx

from .settings import (
    AMAP_CACHE_CAPACITY,
    AMAP_POI_CACHE_SECONDS,
    AMAP_REQUEST_TIMEOUT_SECONDS,
    AMAP_ROUTE_CACHE_SECONDS,
    AMAP_WEB_CONCURRENCY,
    AMAP_WEB_MAX_CONNECTIONS,
    AMAP_WEB_KEEPALIVE_CONNECTIONS,
    AMAP_PROXY_MAX_CONNECTIONS,
    AMAP_PROXY_KEEPALIVE_CONNECTIONS,
    PLAN_TIMEOUT_SECONDS,
)


class AMapConfigError(RuntimeError):
    """Raised when a local AMap setting is missing."""


class AMapUpstreamError(RuntimeError):
    """Raised when AMap rejects a request or returns an unusable payload."""

    def __init__(self, message: str, *, infocode: str | None = None) -> None:
        super().__init__(message)
        self.infocode = infocode


class PlanningTimeoutError(RuntimeError):
    """The entire plan exceeded its budget; no partial plan should be returned."""


QueryKey = tuple[str, tuple[tuple[str, str], ...]]
PayloadValidator = Callable[[dict[str, Any]], None]
_transport: ContextVar[AMapTransport] = ContextVar("amap_transport")
_plan_queries: ContextVar[dict[QueryKey, dict[str, Any]] | None] = ContextVar(
    "amap_plan_queries", default=None
)
_plan_deadline: ContextVar[float | None] = ContextVar("amap_plan_deadline", default=None)


def check_plan_deadline() -> None:
    deadline = _plan_deadline.get()
    if deadline is not None and asyncio.get_running_loop().time() >= deadline:
        raise PlanningTimeoutError("行程生成等待超时，请稍后重新生成。")


async def gather_amap_queries(*queries: Awaitable[Any]) -> list[Any]:
    """Cancel and join sibling lookups when a batch fails or is cancelled."""
    tasks = [asyncio.ensure_future(query) for query in queries]
    try:
        return await asyncio.gather(*tasks)
    finally:
        for task in tasks:
            if not task.done():
                task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


@asynccontextmanager
async def planning_request_scope() -> AsyncIterator[None]:
    """One budget and raw-query memo across dining, duck search and transit."""
    deadline = asyncio.get_running_loop().time() + PLAN_TIMEOUT_SECONDS
    query_token = _plan_queries.set({})
    deadline_token = _plan_deadline.set(deadline)
    timeout = asyncio.timeout_at(deadline)
    try:
        async with timeout:
            yield
            check_plan_deadline()
    except TimeoutError as exc:
        if not timeout.expired():
            raise
        raise PlanningTimeoutError("行程生成等待超时，请稍后重新生成。") from exc
    finally:
        _plan_deadline.reset(deadline_token)
        _plan_queries.reset(query_token)


@dataclass
class _Flight:
    task: asyncio.Task[dict[str, Any]]
    waiters: int = 0


class AMapTransport:
    """One instance per running application/event loop; no user plan cache."""

    def __init__(
        self,
        *,
        web_client: httpx.AsyncClient | None = None,
        proxy_client: httpx.AsyncClient | None = None,
        clock: Callable[[], float] = monotonic,
        cache_capacity: int = AMAP_CACHE_CAPACITY,
    ) -> None:
        self.web_client = web_client or httpx.AsyncClient(
            timeout=AMAP_REQUEST_TIMEOUT_SECONDS,
            limits=httpx.Limits(
                max_connections=AMAP_WEB_MAX_CONNECTIONS,
                max_keepalive_connections=AMAP_WEB_KEEPALIVE_CONNECTIONS,
            ),
        )
        self.proxy_client = proxy_client or httpx.AsyncClient(
            timeout=AMAP_REQUEST_TIMEOUT_SECONDS,
            limits=httpx.Limits(
                max_connections=AMAP_PROXY_MAX_CONNECTIONS,
                max_keepalive_connections=AMAP_PROXY_KEEPALIVE_CONNECTIONS,
            ),
        )
        self._clock = clock
        self._capacity = cache_capacity
        self._cache: OrderedDict[QueryKey, tuple[float, dict[str, Any]]] = OrderedDict()
        self._flights: dict[QueryKey, _Flight] = {}
        self._semaphore = asyncio.Semaphore(AMAP_WEB_CONCURRENCY)
        self._closed = False

    async def aclose(self) -> None:
        self._closed = True
        tasks = [flight.task for flight in self._flights.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        self._flights.clear()
        self._cache.clear()
        await asyncio.gather(self.web_client.aclose(), self.proxy_client.aclose())

    async def get(
        self, path: str, params: dict[str, Any], *, validate: PayloadValidator | None = None
    ) -> dict[str, Any]:
        check_plan_deadline()
        if self._closed:
            raise RuntimeError("AMap transport is already closed")
        # All actual upstream parameters belong in the key, including credentials.
        # Keys are never emitted to logs or returned through an API.
        key: QueryKey = (path, tuple(sorted((k, str(v)) for k, v in params.items())))
        memo = _plan_queries.get()
        if memo is not None and key in memo:
            return deepcopy(memo[key])
        now = self._clock()
        for expired in [k for k, (expiry, _) in self._cache.items() if expiry <= now]:
            del self._cache[expired]
        cached = self._cache.get(key)
        if cached is not None:
            self._cache.move_to_end(key)
            payload = cached[1]
        else:
            flight = self._flights.get(key)
            if flight is None:
                flight = _Flight(
                    asyncio.create_task(self._fetch(key, path, dict(params), validate))
                )
                self._flights[key] = flight
            flight.waiters += 1
            try:
                payload = await asyncio.shield(flight.task)
            finally:
                flight.waiters -= 1
                if flight.waiters == 0:
                    if self._flights.get(key) is flight:
                        del self._flights[key]
                    if not flight.task.done():
                        flight.task.cancel()
                    await asyncio.gather(flight.task, return_exceptions=True)
        check_plan_deadline()
        if memo is not None:
            memo[key] = payload
        return deepcopy(payload)

    @staticmethod
    def _ttl(path: str) -> float:
        if path.startswith("/v5/place/"):
            return AMAP_POI_CACHE_SECONDS
        if path.startswith("/v5/direction/"):
            return AMAP_ROUTE_CACHE_SECONDS
        # Weather already owns a one-hour business cache; SDK proxy is separate.
        return 0

    async def _fetch(
        self, key: QueryKey, path: str, params: dict[str, Any], validate: PayloadValidator | None
    ) -> dict[str, Any]:
        # A shared request has its own timeout, never its first caller's deadline.
        _plan_deadline.set(None)
        _plan_queries.set(None)
        try:
            async with asyncio.timeout(AMAP_REQUEST_TIMEOUT_SECONDS):
                async with self._semaphore:
                    response = await self.web_client.get(
                        f"https://restapi.amap.com{path}", params=params
                    )
                    response.raise_for_status()
        except (TimeoutError, httpx.TimeoutException) as exc:
            raise AMapUpstreamError("高德接口响应超时，请稍后重试。") from exc
        except httpx.HTTPError as exc:
            raise AMapUpstreamError("暂时无法连接高德接口，请稍后重试。") from exc
        try:
            payload = response.json()
        except ValueError as exc:
            raise AMapUpstreamError("高德接口返回了无法识别的数据。") from exc
        if not isinstance(payload, dict):
            raise AMapUpstreamError("高德接口返回了无法识别的数据。")
        if payload.get("status") != "1":
            raise AMapUpstreamError(
                f"高德接口未完成请求：{payload.get('info') or 'UNKNOWN_ERROR'}",
                infocode=payload.get("infocode"),
            )
        if validate is not None:
            validate(payload)
        ttl = self._ttl(path)
        if ttl and self._capacity:
            self._cache[key] = (self._clock() + ttl, payload)
            self._cache.move_to_end(key)
            while len(self._cache) > self._capacity:
                self._cache.popitem(last=False)
        return payload


def current_amap_transport() -> AMapTransport:
    """Require the application lifespan or an explicit standalone session."""
    return _transport.get()


@asynccontextmanager
async def amap_session(transport: AMapTransport | None = None) -> AsyncIterator[AMapTransport]:
    """Explicit lifecycle for application startup and standalone verification."""
    active = transport if transport is not None else AMapTransport()
    token = _transport.set(active)
    try:
        yield active
    finally:
        _transport.reset(token)
        await active.aclose()


class AMapTransportMiddleware:
    """Bind the lifespan-owned service to HTTP tasks without wrapping receive."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        token = _transport.set(scope["app"].state.amap_transport)
        try:
            await self.app(scope, receive, send)
        finally:
            _transport.reset(token)
