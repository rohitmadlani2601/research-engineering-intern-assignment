"""
Embedding Map API
=================

GET /api/v1/embedding-map
    Returns the 2-D PCA projection of all post embeddings, optionally
    sub-sampled for performance.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.models.embedding_viz import EmbeddingMapResponse, EmbeddingPoint
from app.services.embedding_viz_service import EmbeddingVizService

router = APIRouter(prefix="/embedding-map", tags=["embedding-map"])


def _get_service(request: Request) -> EmbeddingVizService:
    svc: EmbeddingVizService | None = getattr(request.app.state, "embedding_viz_service", None)
    if svc is None or not svc.is_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "EMBEDDING_VIZ_NOT_READY",
                "message": "Embedding visualisation has not been computed yet. Please retry shortly.",
            },
        )
    return svc


@router.get(
    "",
    response_model=EmbeddingMapResponse,
    summary="2-D PCA embedding map",
    description=(
        "Returns 2-D PCA-projected coordinates for each post, along with cluster ID "
        "and label. Use `sample` to cap the number of returned points. "
        "Default sample size is 3 000."
    ),
)
def get_embedding_map(
    request: Request,
    sample: int = Query(3000, ge=100, le=10_000, description="Max number of points to return."),
) -> EmbeddingMapResponse:
    svc = _get_service(request)
    result = svc.get_sampled(sample=sample)

    return EmbeddingMapResponse(
        points=[
            EmbeddingPoint(
                post_id=p.post_id,
                x=p.x,
                y=p.y,
                cluster_id=p.cluster_id,
                label=p.label,
            )
            for p in result.points
        ],
        explained_variance=result.explained_variance,
        total_posts=result.total_posts,
        sampled_posts=result.sampled_posts,
    )
