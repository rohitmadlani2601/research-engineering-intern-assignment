"""
Semantic Search API Router
==========================
Exposes POST /semantic-search.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.models.search import SemanticSearchRequest, SemanticSearchResponse
from app.services.search_service import SearchService

router = APIRouter(tags=["semantic-search"])


def _get_search_service(request: Request) -> SearchService:
    """Dependency: retrieve the SearchService from app state."""
    service: SearchService | None = getattr(
        request.app.state, "search_service", None
    )
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Semantic search index is not ready. "
                "The embedding model may still be loading."
            ),
        )
    return service


@router.post(
    "/semantic-search",
    response_model=SemanticSearchResponse,
    summary="Semantic search over Reddit posts using sentence embeddings",
    description=(
        "Converts the query to a sentence embedding and returns the top-k most "
        "semantically similar posts ranked by cosine similarity. "
        "Uses **all-MiniLM-L6-v2** from sentence-transformers. "
        "No keyword matching is performed."
    ),
    status_code=status.HTTP_200_OK,
)
async def semantic_search(
    body: SemanticSearchRequest,
    request: Request,
) -> SemanticSearchResponse:
    """
    **POST /semantic-search**

    Run semantic search over all loaded Reddit posts.

    - **query**: natural language search string (required, must be non-empty)
    - **top_k**: number of results to return (default 20, max 100)

    Returns posts ranked by cosine similarity, each annotated with a
    `similarity` score (0.0–1.0) and a 1-indexed `rank`.
    """
    # Pydantic has already validated `query` is non-empty (strip is applied).
    if not body.query:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Query must not be empty.",
        )

    search_service = _get_search_service(request)
    return search_service.search(
        query=body.query, 
        top_k=body.top_k,
        threshold=body.threshold,
    )
