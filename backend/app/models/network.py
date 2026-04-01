"""
Pydantic schemas for the /network API endpoint.
"""

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field


class NetworkNode(BaseModel):
    id: str = Field(..., description="Author username.")
    pagerank: float = Field(..., description="PageRank score (higher = more influential).")
    community: int = Field(..., description="Community/cluster ID from greedy modularity detection.")
    post_count: int = Field(..., description="Total posts by this author in the dataset.")


class NetworkEdge(BaseModel):
    source: str = Field(..., description="Source author node ID.")
    target: str = Field(..., description="Target author node ID.")
    weight: float = Field(..., description="Edge weight (number of shared topic clusters).")


class NetworkResponse(BaseModel):
    nodes: List[NetworkNode] = Field(..., description="Author nodes sorted by PageRank descending.")
    edges: List[NetworkEdge] = Field(..., description="Interaction edges sorted by weight descending.")
    num_nodes: int = Field(..., description="Total graph nodes (all eligible authors).")
    num_edges: int = Field(..., description="Total graph edges.")
    num_communities: int = Field(..., description="Number of detected communities.")
