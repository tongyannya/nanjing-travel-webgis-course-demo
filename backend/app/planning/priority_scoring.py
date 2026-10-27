"""Spread explicit preferences across days while protecting must-visit availability."""

from copy import deepcopy

from ..amap_transport import check_plan_deadline
from .rules import is_excluded_by_preferences


def priority_ids_for_request(request, attractions):
    preferences = request['preferences']
    must = set(preferences['must_visit_ids'])
    explicit = must | set(preferences['interested_ids'])
    excluded = set(preferences['excluded_ids'])
    excluded_tags = set(preferences['excluded_tags'])
    return {attraction['id'] for attraction in attractions
            if attraction['id'] in explicit and not is_excluded_by_preferences(
                attraction, excluded, excluded_tags, must)}


def daily_priority_target(remaining_count, remaining_days):
    return (remaining_count + remaining_days - 1) // remaining_days


def priority_bonus(attraction_id, preferences, target, scheduled_count, urgent_ids):
    """Only the preference contribution decays; other score parts stay intact."""
    if attraction_id not in set(preferences['must_visit_ids']) | set(preferences['interested_ids']):
        return 0
    if attraction_id in urgent_ids:
        return 10000
    if scheduled_count >= target:
        return 0
    if scheduled_count:
        return 200
    if attraction_id in preferences['must_visit_ids']:
        return 10000
    if attraction_id in preferences['interested_ids']:
        return 600
    return 0


def last_feasible_must_dates(plan_type, request, must_ids):
    """Probe each must alone, using the real schedule, endpoints and meal rules.

    Fixed-sequence probes bypass distribution and afternoon reservations. This is
    a best-case availability check, not a guarantee that all musts fit together.
    """
    from .schedule import build_plan

    dates = {}
    for attraction_id in sorted(must_ids):
        for index in reversed(range(len(request['trip_days']))):
            check_plan_deadline()
            day = request['trip_days'][index]
            local = deepcopy(request)
            local.update(trip_days=[deepcopy(day)],
                         first_day_start=request['first_day_start'] if index == 0 else None,
                         last_day_end=request['last_day_end'] if index == len(request['trip_days']) - 1 else None)
            plan = build_plan(plan_type, local, visit_sequences={day['date']: [attraction_id]},
                              preserve_visit_order=True)
            items = plan['days'][0]['items']
            # The scheduler checks all meals before accepting the visit, including
            # the request's explicit permission for one long-visit omission.
            if any(item['type'] == 'attraction' and item['ref_id'] == attraction_id for item in items):
                dates[attraction_id] = day['date']
                break
    return dates
