"""
Pydantic schemas for the /clusters API endpoints.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field

from app.models.post import RedditPost


class ClusterSummary(BaseModel):
    """Top-level summary of a single topic cluster."""

    cluster_id: int = Field(..., description="Zero-based cluster identifier.")
    label: str = Field(..., description="Human-readable topic label, e.g. 'War / Conflict'.")
    size: int = Field(..., description="Number of posts in this cluster.")
    top_keywords: List[str] = Field(
        ...,
        description="Ranked list of top TF-IDF keywords for this cluster.",
    )
    is_small: bool = Field(
        ...,
        description="True when the cluster has fewer posts than the minimum threshold.",
    )


class ClustersResponse(BaseModel):
    """Response body for GET /clusters."""

    num_clusters: int = Field(..., description="Total number of clusters.")
    total_posts_clustered: int = Field(..., description="Total posts assigned to clusters.")
    clusters: List[ClusterSummary] = Field(
        ..., description="Cluster summaries sorted by size (largest first)."
    )
    message: Optional[str] = Field(
        None,
        description="Optional informational message (e.g. if data is not yet ready).",
    )


class ClusterPostsResponse(BaseModel):
    """Response body for GET /clusters/{cluster_id}/posts."""

    cluster_id: int
    label: str
    size: int
    top_keywords: List[str]
    posts: List[RedditPost] = Field(
        ..., description="All posts belonging to this cluster."
    )
