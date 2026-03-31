from __future__ import annotations

from typing import Optional

import structlog

from app.models.post import PaginatedPosts, RedditPost
from app.utils.helpers import compute_pages

logger = structlog.get_logger(__name__)


class PostService:
    """
    In-memory post store providing filtered, paginated access.

    Designed for read-heavy workloads on a bounded dataset.
    Replace with a database-backed implementation for production scale-out.
    """

    def __init__(self, posts: list[RedditPost]) -> None:
        self._posts = posts
        logger.info("post_service_ready", total=len(posts))

    @property
    def total(self) -> int:
        return len(self._posts)

    def get_posts(
        self,
        page: int = 1,
        page_size: int = 20,
        subreddit: Optional[str] = None,
        author: Optional[str] = None,
        q: Optional[str] = None,
    ) -> PaginatedPosts:
        """
        Return a paginated slice of posts with optional filters.

        Args:
            page: 1-indexed page number.
            page_size: Number of items per page.
            subreddit: Case-insensitive subreddit filter.
            author: Case-insensitive author filter.
            q: Case-insensitive keyword filter applied to full_text.
        """
        filtered = self._posts

        if subreddit:
            sr = subreddit.lower().lstrip("r/")
            filtered = [p for p in filtered if p.subreddit.lower() == sr]

        if author:
            auth = author.lower()
            filtered = [p for p in filtered if p.author.lower() == auth]

        if q:
            query = q.lower()
            filtered = [
                p for p in filtered if query in p.full_text.lower()
            ]

        total = len(filtered)
        pages = compute_pages(total, page_size)

        start = (page - 1) * page_size
        end = start + page_size
        items = filtered[start:end]

        logger.debug(
            "posts_fetched",
            page=page,
            page_size=page_size,
            total=total,
            returned=len(items),
        )

        return PaginatedPosts(
            total=total,
            page=page,
            page_size=page_size,
            pages=pages,
            items=items,
        )

    def get_post_by_id(self, post_id: str) -> Optional[RedditPost]:
        for post in self._posts:
            if post.id == post_id:
                return post
        return None

    def get_subreddits(self) -> list[str]:
        return sorted({p.subreddit for p in self._posts if p.subreddit})
