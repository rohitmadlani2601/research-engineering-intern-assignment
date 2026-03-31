from __future__ import annotations

import re
from typing import Any

URL_RE = re.compile(r"https?://\S+")
HASHTAG_RE = re.compile(r"#\w+")


def extract_urls(text: str) -> list[str]:
    """Extract all URLs from free text."""
    return URL_RE.findall(text or "")


def extract_hashtags(text: str) -> list[str]:
    """Extract all hashtags from free text."""
    return HASHTAG_RE.findall(text or "")


def safe_get(data: dict[str, Any], key: str, default: Any = None) -> Any:
    """Null-safe dict accessor that also coerces empty strings to default."""
    val = data.get(key, default)
    if val == "" and default is not None:
        return default
    return val


def compute_pages(total: int, page_size: int) -> int:
    if page_size <= 0:
        return 0
    return (total + page_size - 1) // page_size
