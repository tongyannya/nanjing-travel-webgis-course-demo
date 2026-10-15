"""Read-only access to the validated local attraction dataset."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path, PurePosixPath
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ATTRACTIONS_PATH = PROJECT_ROOT / "data" / "formal" / "attractions.json"
ATTRACTION_IMAGES_PATH = PROJECT_ROOT / "data" / "formal" / "attraction_images.json"
METRO_NETWORK_PATH = PROJECT_ROOT / "data" / "formal" / "metro_network.json"
IMAGE_ASSET_PREFIX = "/assets/attractions/"


class LocalDataError(RuntimeError):
    """Raised when a project-owned data file cannot be read safely."""


@lru_cache(maxsize=1)
def load_attractions() -> tuple[dict[str, Any], ...]:
    try:
        payload = json.loads(ATTRACTIONS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LocalDataError("正式景点数据暂时无法读取。") from exc
    if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
        raise LocalDataError("正式景点数据的结构不正确。")
    return tuple(payload)


@lru_cache(maxsize=1)
def load_attraction_images() -> tuple[dict[str, Any], ...]:
    try:
        payload = json.loads(ATTRACTION_IMAGES_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LocalDataError("景点图片映射暂时无法读取。") from exc
    if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
        raise LocalDataError("景点图片映射的结构不正确。")
    return tuple(payload)


@lru_cache(maxsize=1)
def load_metro_network() -> dict[str, Any]:
    try:
        payload = json.loads(METRO_NETWORK_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise LocalDataError("地铁线路数据暂时无法读取。") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("lines"), list) or not isinstance(
        payload.get("stations"), list
    ):
        raise LocalDataError("地铁线路数据的结构不正确。")
    return payload


@lru_cache(maxsize=1)
def image_mapping_by_id() -> dict[str, dict[str, str]]:
    """Validated attraction_id -> image contract, or a mapping error."""
    attractions = {item.get("id"): item for item in load_attractions()}
    mapping: dict[str, dict[str, str]] = {}
    for entry in load_attraction_images():
        attraction_id = entry.get("attraction_id")
        name = entry.get("name")
        image_path = entry.get("image_path")
        source_organization = entry.get("source_organization")
        source_url = entry.get("source_url")
        if not isinstance(attraction_id, str) or not attraction_id:
            raise LocalDataError("景点图片映射中存在缺少有效编号的条目。")
        if attraction_id in mapping:
            raise LocalDataError(f"景点图片映射中编号 {attraction_id} 重复。")
        attraction = attractions.get(attraction_id)
        if attraction is None:
            raise LocalDataError(f"景点图片映射中的编号 {attraction_id} 不在正式景点数据中。")
        if not isinstance(name, str) or name != attraction.get("name"):
            raise LocalDataError(f"景点图片映射中 {attraction_id} 的名称与正式景点数据不一致。")
        if not isinstance(image_path, str):
            raise LocalDataError(f"景点图片映射中 {attraction_id} 的图片路径不是站内资源路径。")
        parsed_image_path = PurePosixPath(image_path)
        if (
            parsed_image_path.parent != PurePosixPath(IMAGE_ASSET_PREFIX)
            or parsed_image_path.stem != attraction_id
            or parsed_image_path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}
        ):
            raise LocalDataError(
                f"景点图片映射中 {attraction_id} 的图片路径必须使用对应景点编号。"
            )
        if not isinstance(source_organization, str) or not source_organization:
            raise LocalDataError(f"景点图片映射中 {attraction_id} 缺少来源机构。")
        if not isinstance(source_url, str) or not source_url.startswith("https://"):
            raise LocalDataError(f"景点图片映射中 {attraction_id} 的来源链接必须是 https 地址。")
        mapping[attraction_id] = {
            "path": image_path,
            "source_organization": source_organization,
            "source_url": source_url,
        }
    return mapping


def attach_image(attraction: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of the attraction with its merged `image` field."""
    image = image_mapping_by_id().get(attraction.get("id"))
    return {**attraction, "image": image}


def find_attraction(attraction_id: str) -> dict[str, Any] | None:
    attraction = next(
        (item for item in load_attractions() if item.get("id") == attraction_id), None
    )
    if attraction is None:
        return None
    return attach_image(attraction)


def filter_attractions(
    *,
    query: str | None,
    district: str | None,
    category: str | None,
    tag: str | None,
    reservation_required: str | None,
    free_only: bool | None,
) -> list[dict[str, Any]]:
    normalized_query = (query or "").strip().casefold()
    results = []
    for item in load_attractions():
        if district and item.get("district") != district:
            continue
        if category and item.get("category") != category:
            continue
        if tag and tag not in item.get("tags", []):
            continue
        if reservation_required and (item.get("reservation") or {}).get("required") != reservation_required:
            continue
        if free_only is not None:
            adult_price = (item.get("ticket") or {}).get("adult")
            if free_only != (adult_price == 0):
                continue
        if normalized_query:
            searchable = [item.get("name", ""), item.get("address", ""), *item.get("aliases", [])]
            if not any(normalized_query in str(value).casefold() for value in searchable):
                continue
        results.append(attach_image(item))
    return results
