"""
Clusters API
============
Exposes topic cluster information derived from KMeans over post embeddings.

Endpoints
---------
GET /api/v1/clusters
    List all clusters with their labels, sizes, and top keywords.

GET /api/v1/clusters/{cluster_id}/posts
    Return all posts belonging to a given cluster.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.models.cluster import ClusterPostsResponse, ClusterSummary, ClustersResponse
from app.models.post import RedditPost
from app.services.clustering_service import ClusteringService

router = APIRouter(prefix="/clusters", tags=["clusters"])


# ── Dependency helper ──────────────────────────────────────────────────────────

def _get_service(request: Request) -> ClusteringService:
    svc: ClusteringService | None = getattr(request.app.state, "clustering_service", None)
    if svc is None or not svc.is_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "CLUSTERING_NOT_READY",
                "message": (
                    "Topic clustering has not completed yet. "
                    "Please retry in a few seconds."
                ),
            },
        )
    return svc


def _get_post_service(request: Request):  # type: ignore[return]
    svc = getattr(request.app.state, "post_service", None)
    if svc is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "DATASET_NOT_READY", "message": "Dataset not yet loaded."},
        )
    return svc


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=ClustersResponse,
    summary="List all topic clusters",
    description=(
        "Returns every topic cluster with its human-readable label, post count, "
        "and top TF-IDF keywords.  Clusters are sorted largest-first."
    ),
)
def list_clusters(request: Request) -> ClustersResponse:
    svc = _get_service(request)
    result = svc.result  # never None here — _get_service guarantees is_ready

    summaries = [
        ClusterSummary(
            cluster_id=c.cluster_id,
            label=c.label,
            size=c.size,
            top_keywords=c.top_keywords,
            is_small=c.is_small,
        )
        for c in result.clusters  # type: ignore[union-attr]
    ]

    return ClustersResponse(
        num_clusters=result.num_clusters,  # type: ignore[union-attr]
        total_posts_clustered=result.total_posts_clustered,  # type: ignore[union-attr]
        clusters=summaries,
    )


@router.get(
    "/{cluster_id}/posts",
    response_model=ClusterPostsResponse,
    summary="Get all posts in a specific cluster",
    description=(
        "Returns the full list of Reddit posts that were assigned to the given "
        "cluster ID.  Useful for the Topics-tab drill-down view."
    ),
)
def get_cluster_posts(
    cluster_id: int,
    request: Request,
) -> ClusterPostsResponse:
    clustering_svc = _get_service(request)
    post_svc = _get_post_service(request)
    result = clustering_svc.result  # type: ignore[union-attr]

    # Find the ClusterInfo for this id
    cluster_info = next(
        (c for c in result.clusters if c.cluster_id == cluster_id),  # type: ignore[union-attr]
        None,
    )
    if cluster_info is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "CLUSTER_NOT_FOUND",
                "message": f"Cluster '{cluster_id}' does not exist.",
            },
        )

    # Retrieve the actual post objects from PostService
    posts: list[RedditPost] = []
    for pid in cluster_info.post_ids:
        post = post_svc.get_post_by_id(pid)
        if post is not None:
            posts.append(post)

    # Sort posts by score descending so best content surfaces first
    posts.sort(key=lambda p: p.score, reverse=True)

    return ClusterPostsResponse(
        cluster_id=cluster_info.cluster_id,
        label=cluster_info.label,
        size=cluster_info.size,
        top_keywords=cluster_info.top_keywords,
        posts=posts,
    )
