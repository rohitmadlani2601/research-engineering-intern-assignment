"""
Pydantic schemas for the /timeseries API endpoint.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class TimeSeriesPoint(BaseModel):
    date: str = Field(..., description="ISO 8601 date string (YYYY-MM-DD).")
    count: int = Field(..., description="Number of posts on this date.")


class TimeSeriesResponse(BaseModel):
    points: List[TimeSeriesPoint] = Field(..., description="Chronologically sorted daily counts.")
    summary: str = Field(..., description="Rule-based 1–2 sentence narrative insight.")
    peak_date: Optional[str] = Field(None, description="Date with highest post count.")
    peak_count: int = Field(0, description="Post count on the peak date.")
    total_posts: int = Field(..., description="Total posts in the response.")
    date_range_days: int = Field(..., description="Number of distinct days spanned.")
    query: Optional[str] = Field(None, description="Query used to filter posts (if any).")
