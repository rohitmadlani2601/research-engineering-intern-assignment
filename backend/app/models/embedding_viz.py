"""
Pydantic schemas for the /embedding-map API endpoint.
"""

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class EmbeddingPoint(BaseModel):
    post_id: str = Field(..., description="Reddit post ID.")
    x: float = Field(..., description="2-D PCA x-coordinate in [-1, 1].")
    y: float = Field(..., description="2-D PCA y-coordinate in [-1, 1].")
    cluster_id: int = Field(..., description="Cluster ID assigned by KMeans.")
    label: str = Field(..., description="Human-readable cluster label.")


class EmbeddingMapResponse(BaseModel):
    points: List[EmbeddingPoint] = Field(..., description="2-D projected post points.")
    explained_variance: float = Field(
        ..., description="Fraction of variance explained by the first 2 principal components."
    )
    total_posts: int = Field(..., description="Total posts indexed.")
    sampled_posts: int = Field(..., description="Number of points returned (may be a sample).")
