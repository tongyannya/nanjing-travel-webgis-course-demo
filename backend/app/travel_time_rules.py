"""Shared travel reservations for itinerary estimates and actual route results."""

TRAVEL_BUFFER_MINUTES = 10


def reserved_travel_minutes(raw_minutes: int, *, mode: str | None = None) -> int:
    """Round positive minutes to the nearest ten (half up), then add a buffer."""
    if raw_minutes <= 0 or (mode == "walk" and raw_minutes < 5):
        return 0
    return ((raw_minutes + 5) // 10) * 10 + TRAVEL_BUFFER_MINUTES
