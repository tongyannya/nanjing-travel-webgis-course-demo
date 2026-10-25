"""Request-local observation of planning decisions, without storing user traces."""

from contextlib import contextmanager
from contextvars import ContextVar
from copy import deepcopy
from time import monotonic
from typing import Any, Callable


_recorder: ContextVar[Any] = ContextVar('planning_trace', default=None)


class TraceRecorder:
    def __init__(self, publish: Callable):
        self.publish = publish
        self.started = monotonic()
        self.sequence = 0

    def emit(self, phase, title, **data):
        self.sequence += 1
        self.publish({'type': 'event', 'event': {
            'sequence': self.sequence, 'elapsed_ms': round((monotonic() - self.started) * 1000),
            'phase': phase, 'title': title, **deepcopy(data),
        }})


@contextmanager
def capture_trace(publish):
    token = _recorder.set(TraceRecorder(publish))
    try:
        yield
    finally:
        _recorder.reset(token)


def tracing():
    return _recorder.get() is not None


def emit(phase, title, **data):
    recorder = _recorder.get()
    if recorder is not None:
        recorder.emit(phase, title, **data)


def plan_snapshot(plan):
    return {'plan_type': plan['plan_type'], 'total_ticket_cost': plan['total_ticket_cost'],
            'days': [{'date': day['date'], 'items': [
                {key: item.get(key) for key in ('type', 'ref_id', 'name', 'start_time', 'end_time', 'meal_kind')}
                for item in day['items']], 'legs': [
                    {key: leg.get(key) for key in ('mode', 'duration_minutes_raw', 'duration_minutes_rounded', 'is_estimated')}
                    for leg in day['legs']],
                'meals': [{key: meal.get(key) for key in ('meal_kind', 'area_kind', 'start_time', 'end_time')} |
                          {'area_name': (meal.get('area') or {}).get('name')}
                          for leg in day['legs'] for meal in leg.get('meals', [])]}
                     for day in plan['days']]}


def response_snapshot(response):
    return [plan_snapshot(plan) for plan in response['plans']] if tracing() else None


def snapshot(phase, title, response, *, previous_plans=None):
    if tracing():
        plans = response_snapshot(response)
        comparison = {}
        if previous_plans is not None:
            changed = plans != previous_plans
            comparison = {'previous_plans': previous_plans, 'changed': changed,
                          'message': '本阶段的安排或交通记录发生变化，可展开比较前的安排核对。' if changed else '本阶段保留了景点、时间、交通与用餐安排。'}
        emit(phase, title, plans=plans, **comparison)
