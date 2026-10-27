"""Live, request-local planning observations over newline-delimited JSON."""

import asyncio
import inspect
import json
from typing import Any, Literal

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse

from ..amap_transport import PlanningTimeoutError
from ..data_store import load_attractions
from ..errors import ApiError
from ..planning.route_orchestration import generate_route_hex_plans
from ..planning.trace import capture_trace, emit, progress
from ..trip_validation import validate_trip_request


router = APIRouter()


@router.post('/api/plans/trace', tags=['plans'])
async def create_plan_trace(payload: dict[str, Any], request: Request,
                            plan_type: Literal['relaxed', 'compact', 'duck'] = Query(default='relaxed'),
                            detail: Literal['full', 'progress'] = 'full'):
    errors = validate_trip_request(payload, valid_attraction_ids={item['id'] for item in load_attractions()})
    if errors:
        raise ApiError(status_code=422, code='invalid_trip_request',
                       message='行程条件不完整或不符合要求，请检查后重试。', details=errors)

    async def stream():
        queue = asyncio.Queue()
        async def run():
            try:
                with capture_trace(queue.put_nowait, detailed=detail == 'full'):
                    progress('request', '已收到旅行条件，正在安排景点…')
                    emit('request', '接收旅行条件，开始生成行程', request=payload, plan_type=plan_type,
                         message='候选得分、顺序比较、交通核对和餐饮选择将按发生顺序记录。', function='validate_trip_request')
                    result = await generate_route_hex_plans(payload, plan_types=(plan_type,))
                    queue.put_nowait({'type': 'result', 'response': result})
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                if isinstance(exc, PlanningTimeoutError):
                    exc = ApiError(status_code=504, code='plan_generation_timeout', message=str(exc), retryable=True)
                handler = next(request.app.exception_handlers[kind] for kind in type(exc).__mro__
                               if kind in request.app.exception_handlers)
                response = handler(request, exc)
                if inspect.isawaitable(response):
                    response = await response
                queue.put_nowait({'type': 'error', **json.loads(response.body)})
            finally:
                queue.put_nowait(None)

        task = asyncio.create_task(run())
        try:
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield json.dumps(item, ensure_ascii=False, separators=(',', ':')) + '\n'
        finally:
            if not task.done():
                task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    return StreamingResponse(stream(), media_type='application/x-ndjson',
                             headers={'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no'})
