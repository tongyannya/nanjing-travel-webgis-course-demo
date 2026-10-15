"""On-demand hotel candidates around one query center."""

from __future__ import annotations

from typing import Any

from .amap_client import fetch_hotel_page


HOTEL_NOTE = (
    "酒店位置与价位档资料。"
)


async def list_hotel_candidates(
    *,
    longitude: float,
    latitude: float,
    radius_meters: int,
    page_num: int,
    page_size: int,
) -> dict[str, Any]:
    """Return one normalized hotel page for an on-demand layer query."""

    page = await fetch_hotel_page(
        longitude=longitude,
        latitude=latitude,
        radius_meters=radius_meters,
        page_num=page_num,
        page_size=page_size,
    )
    return {
        "center": {
            "longitude": longitude,
            "latitude": latitude,
            "coord_system": "GCJ-02",
        },
        "radius_meters": radius_meters,
        "page_num": page_num,
        "page_size": page_size,
        "returned_count": page["returned_count"],
        "has_more": page["has_more"],
        "hotels": page["hotels"],
        "source": "amap",
        "note": HOTEL_NOTE,
    }
