"""
Chat Models
===========
Pydantic schemas for the POST /chat endpoint.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class ChatRequest(BaseModel):
    """Request body for the POST /chat endpoint."""

    query: str = Field(..., description="User's natural-language question.")

    @field_validator("query")
    @classmethod
    def strip_query(cls, v: str) -> str:
        return v.strip()


class ChatSource(BaseModel):
    """A single source document surfaced alongside the answer."""

    title: str
    text: str
    similarity: float
    subreddit: str
    url: str
    permalink: str


class ChatResponse(BaseModel):
    """Response from the POST /chat endpoint."""

    answer: str
    sources: list[ChatSource]
    query: str
    total_retrieved: int
    message: Optional[str] = None
