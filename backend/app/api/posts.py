from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.models.post import PaginatedPosts, RedditPost
from app.services.post_service import PostService

router = APIRouter(prefix="/posts", tags=["posts"])


def _get_service(request: Request) -> PostService:
    service: PostService | None = request.app.state.post_service
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Dataset not yet loaded.",
        )
    return service


@router.get(
    "",
    response_model=PaginatedPosts,
    summary="List posts with optional filters and pagination",
)
def list_posts(
    page: Annotated[int, Query(ge=1, description="Page number (1-indexed)")] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=100, description="Items per page (max 100)")
    ] = 20,
    subreddit: Annotated[
        str | None, Query(description="Filter by subreddit name")
    ] = None,
    author: Annotated[str | None, Query(description="Filter by author")] = None,
    q: Annotated[
        str | None, Query(description="Search query (title + body)")
    ] = None,
    service: PostService = Depends(_get_service),
) -> PaginatedPosts:
    return service.get_posts(
        page=page,
        page_size=page_size,
        subreddit=subreddit,
        author=author,
        q=q,
    )


@router.get(
    "/{post_id}",
    response_model=RedditPost,
    summary="Get a single post by its Reddit ID",
)
def get_post(
    post_id: str,
    service: PostService = Depends(_get_service),
) -> RedditPost:
    post = service.get_post_by_id(post_id)
    if post is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Post '{post_id}' not found.",
        )
    return post


@router.get(
    "/meta/subreddits",
    response_model=list[str],
    summary="List all unique subreddits in the dataset",
)
def list_subreddits(service: PostService = Depends(_get_service)) -> list[str]:
    return service.get_subreddits()
