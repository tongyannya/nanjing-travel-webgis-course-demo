"""Read-only access to the formal duck culture content dataset."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DUCK_CONTENT_PATH = PROJECT_ROOT / "data" / "formal" / "duck_culture.json"


class DuckContentError(RuntimeError):
    """Raised when the duck culture dataset cannot be read safely."""


@lru_cache(maxsize=1)
def load_duck_contents() -> tuple[dict[str, Any], ...]:
    try:
        payload = json.loads(DUCK_CONTENT_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DuckContentError("鸭文化正式内容暂时无法读取。") from exc
    if not isinstance(payload, list) or not all(isinstance(item, dict) for item in payload):
        raise DuckContentError("鸭文化正式内容的结构不正确。")
    return tuple(payload)


def list_duck_contents() -> tuple[dict[str, Any], ...]:
    """All items in list view: everything except the long detail text."""
    return tuple(
        {key: value for key, value in item.items() if key != "detail"}
        for item in load_duck_contents()
    )


def find_duck_content(content_id: str) -> dict[str, Any] | None:
    return next(
        (item for item in load_duck_contents() if item.get("id") == content_id),
        None,
    )
