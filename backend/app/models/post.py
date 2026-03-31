from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class RedditPost(BaseModel):
    """Canonical schema for a Reddit post extracted from data.jsonl."""

    id: str
    title: str
    text: str
    author: str
    subreddit: str
    score: int
    upvote_ratio: float
    num_comments: int
    created_utc: datetime
    url: str
    domain: str
    permalink: str
    is_self: bool
    over_18: bool
    stickied: bool
    num_crossposts: int
    hashtags: list[str] = Field(default_factory=list)
    urls_in_text: list[str] = Field(default_factory=list)

    @field_validator("created_utc", mode="before")
    @classmethod
    def parse_utc(cls, v: Any) -> datetime:
        if isinstance(v, (int, float)):
            return datetime.utcfromtimestamp(v)
        if isinstance(v, datetime):
            return v
        raise ValueError(f"Cannot parse timestamp: {v!r}")

    @field_validator("score", "num_comments", "num_crossposts", mode="before")
    @classmethod
    def coerce_int(cls, v: Any) -> int:
        try:
            return int(v)
        except (TypeError, ValueError):
            return 0

    @field_validator("upvote_ratio", mode="before")
    @classmethod
    def coerce_float(cls, v: Any) -> float:
        try:
            return float(v)
        except (TypeError, ValueError):
            return 0.0

    @field_validator("title", "text", "author", "subreddit", "url", "domain", "permalink", mode="before")
    @classmethod
    def coerce_str(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v)

    model_config = {"frozen": True}


class PaginatedPosts(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    items: list[RedditPost]


class HealthStatus(BaseModel):
    status: str
    version: str
    environment: str
    dataset_loaded: bool
    total_posts: Optional[int] = None
    uptime_seconds: float


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[dict[str, Any]] = None
