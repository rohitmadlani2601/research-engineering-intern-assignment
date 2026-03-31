from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import structlog

from app.models.post import RedditPost
from app.utils.helpers import extract_hashtags, extract_urls, safe_get

logger = structlog.get_logger(__name__)

_REQUIRED_FIELDS = {"id", "author", "subreddit", "created_utc"}


def _parse_raw_row(raw: dict[str, Any]) -> dict[str, Any]:
    """Flatten the Reddit API envelope and enrich fields."""
    data: dict[str, Any] = raw.get("data", raw)

    combined_text = " ".join(
        filter(None, [data.get("title"), data.get("selftext")])
    )

    return {
        "id": safe_get(data, "id", ""),
        "title": safe_get(data, "title", ""),
        "text": safe_get(data, "selftext", ""),
        "author": safe_get(data, "author", "[deleted]"),
        "subreddit": safe_get(data, "subreddit", ""),
        "score": safe_get(data, "score", 0),
        "upvote_ratio": safe_get(data, "upvote_ratio", 0.0),
        "num_comments": safe_get(data, "num_comments", 0),
        "created_utc": safe_get(data, "created_utc", 0),
        "url": safe_get(data, "url", ""),
        "domain": safe_get(data, "domain", ""),
        "permalink": safe_get(data, "permalink", ""),
        "is_self": bool(data.get("is_self", False)),
        "over_18": bool(data.get("over_18", False)),
        "stickied": bool(data.get("stickied", False)),
        "num_crossposts": safe_get(data, "num_crossposts", 0),
        "hashtags": extract_hashtags(combined_text),
        "urls_in_text": extract_urls(combined_text),
    }


def load_posts(path: Path, max_rows: int = 100_000) -> list[RedditPost]:
    """
    Stream-parse data.jsonl into validated RedditPost objects.

    - Skips malformed JSON lines with a warning.
    - Skips rows missing required fields.
    - Respects max_rows cap to bound memory usage.
    """
    posts: list[RedditPost] = []
    skipped_malformed = 0
    skipped_invalid = 0

    log = logger.bind(path=str(path), max_rows=max_rows)
    log.info("dataset_load_start")

    if not path.exists():
        log.error("dataset_not_found")
        raise FileNotFoundError(f"Dataset not found at {path}")

    with path.open("r", encoding="utf-8") as fh:
        for lineno, raw_line in enumerate(fh, start=1):
            if len(posts) >= max_rows:
                log.debug("dataset_cap_reached", cap=max_rows)
                break

            line = raw_line.strip()
            if not line:
                continue

            try:
                raw: dict[str, Any] = json.loads(line)
            except json.JSONDecodeError:
                skipped_malformed += 1
                log.warning("malformed_json_line", lineno=lineno)
                continue

            try:
                row = _parse_raw_row(raw)
                data_block = raw.get("data", raw)
                missing = _REQUIRED_FIELDS - set(k for k, v in data_block.items() if v is not None)
                if missing:
                    skipped_invalid += 1
                    continue

                post = RedditPost(**row)
                posts.append(post)
            except Exception as exc:
                skipped_invalid += 1
                log.debug("row_validation_error", lineno=lineno, error=str(exc))

    log.info(
        "dataset_load_complete",
        total_loaded=len(posts),
        skipped_malformed=skipped_malformed,
        skipped_invalid=skipped_invalid,
    )
    return posts
