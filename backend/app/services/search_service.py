"""
SearchService
=============
Performs semantic search over pre-computed post embeddings.

Algorithm
---------
1. Query string → L2-normalised embedding via EmbeddingService.
2. Matrix–vector dot product against the (N × D) embedding matrix.
   Because all vectors are L2-normalised, this equals cosine similarity.
3. `np.argpartition` for O(N) top-k selection, then sort the shortlist.
4. Map indices → post objects and wrap in SearchResultItem.

Edge-case handling
------------------
- Empty or whitespace-only query       → 400 (validated by Pydantic)
- Very short query (< MIN_CHARS chars) → still processed with a warning
- Non-English query                    → sentence-transformers handles it;
                                         results may have lower similarity
- No posts above similarity threshold  → return what we have (may be empty)
- Index not ready                      → 503 raised by the API layer
"""

from __future__ import annotations

import structlog

from app.models.post import RedditPost
from app.models.search import SearchResultItem, SemanticSearchResponse
from app.services.embedding_service import EmbeddingService

logger = structlog.get_logger(__name__)

# Queries shorter than this character count get a warning log; we still
# process them because even a single keyword can be semantically meaningful.
_MIN_QUERY_CHARS = 3

# Similarity threshold below which results are unlikely to be relevant.
# We do NOT filter on this — we just log it — to avoid returning zero
# results when the corpus is very uniform.
_LOW_SIMILARITY_THRESHOLD = 0.20


class SearchService:
    """
    Pure semantic search over in-memory embeddings.

    Parameters
    ----------
    embedding_service:
        A fully initialised :class:`EmbeddingService` (model loaded +
        index built).
    posts:
        The same ordered list of :class:`RedditPost` objects that was
        used to build the embedding index.
    """

    def __init__(
        self,
        embedding_service: EmbeddingService,
        posts: list[RedditPost],
    ) -> None:
        self._embedding_svc = embedding_service
        # Build a fast lookup dict: post_id → RedditPost
        self._posts_by_id: dict[str, RedditPost] = {p.id: p for p in posts}
        logger.info(
            "search_service_ready",
            total_posts=len(posts),
            index_ready=embedding_service.is_ready,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def search(
        self,
        query: str,
        top_k: int = 1000,
        threshold: float = 0.20,
    ) -> SemanticSearchResponse:
        """
        Run semantic search and return ranked results.

        Parameters
        ----------
        query:
            Natural language query string (already stripped by Pydantic).
        top_k:
            Maximum number of results to return.
        threshold:
            Minimum similarity score (0.0 to 1.0) to consider a result relevant.

        Returns
        -------
        SemanticSearchResponse
            Fully populated response including similarity scores and ranks.
        """
        log = logger.bind(query=query[:120], top_k=top_k)

        # ── Edge-case: short query ─────────────────────────────────────
        message: str | None = None
        if len(query) < _MIN_QUERY_CHARS:
            message = (
                f"Query is very short ({len(query)} chars). "
                "Results may be less accurate."
            )
            log.warning("short_query", query_len=len(query))

        # ── Edge-case: empty index ─────────────────────────────────────
        if not self._embedding_svc.is_ready or self._embedding_svc.num_posts == 0:
            log.warning("search_index_empty")
            return SemanticSearchResponse(
                query=query,
                top_k=top_k,
                total_results=0,
                results=[],
                embedding_model=self._embedding_svc.model_name,
                message="The search index is empty.",
            )

        # ── Embed the query ────────────────────────────────────────────
        query_vec = self._embedding_svc.embed_query(query)  # shape (D,)

        # ── Cosine similarity = dot product (vectors are L2-normalised) ─
        embeddings = self._embedding_svc.get_embeddings()  # shape (N, D)
        similarities = embeddings @ query_vec               # shape (N,)

        # ── Filter by Threshold ────────────────────────────────────────
        import numpy as np  # local import to keep module-level imports clean

        # Find indices where similarity >= threshold
        valid_mask = similarities >= threshold
        valid_indices = np.nonzero(valid_mask)[0]

        actual_k = min(top_k, len(valid_indices))

        if actual_k == 0:
            return SemanticSearchResponse(
                query=query,
                top_k=top_k,
                total_results=0,
                results=[],
                embedding_model=self._embedding_svc.model_name,
                message=(message.strip() if message else None) or "No relevant posts found.",
            )

        valid_similarities = similarities[valid_indices]

        # ── Top-k selection ────────────────────────────────────────────
        if actual_k < len(valid_indices):
            # argpartition on the valid subset
            top_subset_indices = np.argpartition(-valid_similarities, actual_k - 1)[:actual_k]
            # sort only the top actual_k items
            top_subset_indices = top_subset_indices[np.argsort(-valid_similarities[top_subset_indices])]
            top_indices = valid_indices[top_subset_indices]
        else:
            # sort everything if valid subset is <= top_k
            sort_order = np.argsort(-valid_similarities)
            top_indices = valid_indices[sort_order]

        # ── Build result items ─────────────────────────────────────────
        post_ids = self._embedding_svc.get_post_ids()
        results: list[SearchResultItem] = []

        for rank, idx in enumerate(top_indices, start=1):
            post_id = post_ids[idx]
            post = self._posts_by_id.get(post_id)
            if post is None:
                log.warning("post_id_not_found_in_store", post_id=post_id)
                continue

            sim_score = float(similarities[idx])

            results.append(
                SearchResultItem(
                    rank=rank,
                    similarity=round(sim_score, 6),
                    id=post.id,
                    title=post.title,
                    text=post.text,
                    full_text=post.full_text,
                    author=post.author,
                    subreddit=post.subreddit,
                    score=post.score,
                    num_comments=post.num_comments,
                    num_crossposts=post.num_crossposts,
                    upvote_ratio=post.upvote_ratio,
                    is_self=post.is_self,
                    over_18=post.over_18,
                    stickied=post.stickied,
                    hashtags=post.hashtags,
                    urls_in_text=post.urls_in_text,
                    created_utc=post.created_utc,
                    url=post.url,
                    domain=post.domain,
                    permalink=post.permalink,
                )
            )

        log.info(
            "search_complete",
            returned=len(results),
            top_similarity=results[0].similarity if results else None,
        )

        return SemanticSearchResponse(
            query=query,
            top_k=top_k,
            total_results=len(results),
            results=results,
            embedding_model=self._embedding_svc.model_name,
            message=message.strip() if message else None,
        )
