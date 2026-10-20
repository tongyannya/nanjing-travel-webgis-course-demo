"""Bounded actual-route enrichment before local hexagon meal matching."""

from __future__ import annotations

import asyncio
from typing import Any

from ..amap_client import travel_time, AMapConfigError, AMapUpstreamError
from ..amap_transport import check_plan_deadline, gather_amap_queries, planning_request_scope
from .service import generate_plans
from .route_schedule import reschedule_fixed_routes
from .transport import distance_km, estimate_leg, transit_requires_taxi
from .transit_enrichment import transit_query_key, validate_transit_details
from .route_meals import assign_hex_meals
from .service import _plan_validator
from .models import PlanGenerationError
from .route_repair import refill_repaired_days
from .traffic_gaps import regroup_traffic_gaps
from .dinner_recovery import recover_return_dinners

MAX_ROUTE_QUERIES = 48


async def enrich_route_paths(request: dict[str, Any], *, plan_types=None, lookup=None):
    active_lookup = lookup or travel_time
    actual, failed, attempted = {}, set(), set()
    repaired_days = set()
    semaphore = asyncio.Semaphore(4)
    repair_records = {}
    response = generate_plans(request, plan_types=plan_types, repair_records=repair_records)
    initial = response

    async def query(key):
        async with semaphore:
            check_plan_deadline()
            mode, lon1, lat1, lon2, lat2 = key
            try:
                value = await active_lookup(origin=(lon1, lat1), destination=(lon2, lat2), mode=mode)
                if (not isinstance(value, dict) or
                    type(value.get('raw_minutes')) is not int or value['raw_minutes'] <= 0 or
                    type(value.get('estimated_minutes')) is not int or value['estimated_minutes'] <= 0 or
                    not isinstance(value.get('display'), str) or value.get('mode') != mode):
                    raise ValueError('Invalid route duration')
                details = value.get('path_details')
                if details is not None:
                    errors = _plan_validator().evolve(schema={'$ref': '#/$defs/path_details',
                        '$defs': _plan_validator().schema['$defs']}).iter_errors(details)
                    if next(errors, None) is not None:
                        raise ValueError('Invalid path geometry')
                if mode == 'public_transit':
                    transit = value.get('transit_details')
                    validate_transit_details(transit)
                    ride_modes = {'bus', 'metro', 'railway'}
                    if (transit_requires_taxi(transit) or
                        transit['total_minutes'] != value['raw_minutes'] or
                        transit['conservative_minutes'] != value['estimated_minutes'] or
                        transit['conservative_minutes'] < transit['total_minutes'] or
                        not any(ride['mode'] in ride_modes for ride in transit['ride_segments']) or
                        not details or details['mode'] != mode or
                        details['total_minutes'] != value['raw_minutes'] or
                        not any(segment['mode'] in ride_modes for segment in details['route_segments'])):
                        return key, None
                return key, value
            except (AMapConfigError, AMapUpstreamError, ValueError, KeyError, TypeError):
                return key, None

    def traffic(*, finalize=False):
        fallback = {tuple(key[1:]) for key in failed if key[0] == 'public_transit'}
        transit = {tuple(key[1:]): value['transit_details'] for key, value in actual.items()
                   if key[0] == 'public_transit'}
        return dict(travel_details_by_key=actual, taxi_fallback_keys=fallback,
                    transit_details_by_key=transit, fallback_missing_transit_to_taxi=finalize)

    def rebuild(*, finalize=False):
        return reschedule_fixed_routes(request, response, repaired_days=repaired_days,
                                       repair_records=repair_records,
                                       **traffic(finalize=finalize))

    def pending_keys():
        pending = {}
        for plan in response['plans']:
            for day in plan['days']:
                items = {item['item_id']: item for item in day['items']}
                for leg in day['legs']:
                    origin, destination = items[leg['from_item_id']]['location'], items[leg['to_item_id']]['location']
                    if distance_km(origin, destination) < .05:
                        continue
                    key = (leg['mode'], *transit_query_key(origin, destination))
                    if key not in attempted:
                        pending[key] = None
        return list(pending)[:max(0, MAX_ROUTE_QUERIES - len(attempted))]

    async def query_batch(keys):
        outcomes = await gather_amap_queries(*(query(key) for key in keys))
        for key, value in outcomes:
            attempted.add(key)
            if value is None:
                failed.add(key)
            else:
                actual[key] = value

    async def query_routes(keys):
        """Use the same shared budget for ordinary routes and replacements."""
        if len(keys) > MAX_ROUTE_QUERIES - len(attempted):
            return None
        await query_batch(keys)
        taxi_keys = [('taxi', *key[1:]) for key in keys
                     if key[0] == 'public_transit' and key in failed
                     and ('taxi', *key[1:]) not in attempted]
        if len(taxi_keys) > MAX_ROUTE_QUERIES - len(attempted):
            return None
        if taxi_keys:
            await query_batch(taxi_keys)
        return True

    def route_keys(plan, date):
        day = next(day for day in plan['days'] if day['date'] == date)
        items = {item['item_id']: item for item in day['items']}
        keys = set()
        for leg in day['legs']:
            first, second = items[leg['from_item_id']]['location'], items[leg['to_item_id']]['location']
            if distance_km(first, second) >= .05:
                updated = estimate_leg(first, second, request['transport_preference'], '', '', **traffic())
                keys.add((updated['mode'], *transit_query_key(first, second)))
        return keys

    async def verify_routes(plan, date):
        keys = route_keys(plan, date)
        if await query_routes(sorted(keys - attempted)) is None:
            return None
        # A failed transit query may change the effective mode to taxi.
        return all(key in actual and actual[key].get('path_details')
                   for key in route_keys(plan, date))

    while len(attempted) < MAX_ROUTE_QUERIES:
        check_plan_deadline()
        keys = pending_keys()
        if not keys:
            break
        await query_routes(keys)
        response = rebuild()
        # Only a local conflict repair can create a new connection. Feasible
        # days keep their order; each conflicting day permits one local move.
    if len(attempted) >= MAX_ROUTE_QUERIES:
        response = rebuild(finalize=True)
    # Compare replacements against the original route with the now-known
    # traffic costs. This allows filling removed slots without using the
    # empty day's lower cost as a reason to reject every insertion.
    travel_limits = {}
    for plan in initial['plans']:
        total = 0
        for day in plan['days']:
            items = {item['item_id']: item for item in day['items']}
            total += sum(estimate_leg(items[leg['from_item_id']]['location'],
                                      items[leg['to_item_id']]['location'], request['transport_preference'],
                                      '', '', **traffic())['duration_minutes_rounded'] for leg in day['legs'])
        travel_limits[plan['plan_type']] = total
    response = await regroup_traffic_gaps(request, response, repair_records, traffic=traffic,
                                         verify_routes=verify_routes, travel_limits=travel_limits)
    response = await refill_repaired_days(request, response, repair_records, traffic=traffic,
                                          verify_routes=verify_routes, travel_limits=travel_limits)

    async def lookup_dinner_taxi(key):
        if key not in attempted:
            await query_routes([key])
        return actual.get(key)

    response = await recover_return_dinners(request, response, traffic=traffic, lookup_taxi=lookup_dinner_taxi)
    check_plan_deadline()
    if any(leg['mode'] == 'taxi' for plan in response['plans'] for day in plan['days'] for leg in day['legs']) and request['transport_preference'] == 'public_transit':
        response['global_warnings'].append('部分路段因公共交通不可用、超过90分钟、步行超过40分钟或晚餐返程冲突，采用出租车。')
    unresolved = any(not leg.get('path_details') and leg['duration_minutes_rounded'] > 0
                     for plan in response['plans'] for day in plan['days'] for leg in day['legs'])
    if unresolved:
        response['global_warnings'].append('部分交通路径未能取得，相关路段保留估算与用餐时间。')
    return response


@planning_request_scope()
async def generate_route_hex_plans(request: dict[str, Any], *, plan_types=None, lookup=None):
    response = assign_hex_meals(await enrich_route_paths(request, plan_types=plan_types, lookup=lookup))
    errors = list(_plan_validator().iter_errors(response))
    if errors:
        raise PlanGenerationError(f'路线用餐结果无效：{list(errors[0].absolute_path)}')
    return response
