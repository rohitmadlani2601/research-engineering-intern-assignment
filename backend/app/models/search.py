from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class SemanticSearchRequest(BaseModel):
    """Request body for the POST /semantic-search endpoint."""

    query: str = Field(..., description="Natural language search query.")
    top_k: int = Field(
        default=1000,
        ge=1,
        le=10_000,
        description="Maximum number of top results to return.",
    )
    threshold: float = Field(
        default=0.20,
        ge=0.0,
        le=1.0,
        description="Minimum cosine similarity score (0.0–1.0) to consider a post relevant.",
    )

    @field_validator("query")
    @classmethod
    def strip_query(cls, v: str) -> str:
        return v.strip()


class SearchResultItem(BaseModel):
    """A single ranked result from semantic search."""

    rank: int = Field(..., description="1-indexed rank position.")
    similarity: float = Field(
        ..., description="Cosine similarity score (0.0–1.0)."
    )
    id: str
    title: str
    text: str
    full_text: str
    author: str
    subreddit: str
    score: int
    num_comments: int
    num_crossposts: int
    upvote_ratio: float
    is_self: bool
    over_18: bool
    stickied: bool
    hashtags: list[str]
    urls_in_text: list[str]
    created_utc: Any  # datetime serialised as ISO string via FastAPI
    url: str
    domain: str
    permalink: str


class SemanticSearchResponse(BaseModel):
    """Response from the POST /semantic-search endpoint."""

    query: str
    top_k: int
    total_results: int
    results: list[SearchResultItem]
    embedding_model: str
    message: Optional[str] = None
