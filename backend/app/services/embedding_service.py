"""
EmbeddingService
================
Manages sentence-transformer model loading and embedding generation.

Design decisions
----------------
- Model is loaded once at startup and kept resident in memory.
- Embeddings for all posts are generated in batches at startup and stored
  as a pre-normalised NumPy matrix so that cosine similarity reduces to a
  single matrix–vector dot product at query time.
- numpy is used directly; no heavy ML framework needed beyond
  sentence-transformers which already brings torch.
"""

from __future__ import annotations

import time
from typing import Optional

import numpy as np
import structlog
from sentence_transformers import SentenceTransformer

from app.models.post import RedditPost

logger = structlog.get_logger(__name__)

_MODEL_NAME = "all-MiniLM-L6-v2"
# Batch size balanced for CPU/GPU throughput vs. peak memory
_BATCH_SIZE = 256


class EmbeddingService:
    """
    Loads *all-MiniLM-L6-v2* and pre-computes L2-normalised embeddings for
    every post at startup.

    Attributes
    ----------
    model_name : str
        The sentence-transformers model identifier.
    """

    def __init__(self) -> None:
        self._model: Optional[SentenceTransformer] = None
        # Shape: (num_posts, embedding_dim) — L2-normalised rows
        self._embeddings: Optional[np.ndarray] = None
        # Ordered list of post IDs corresponding to _embeddings rows
        self._post_ids: list[str] = []

    # ------------------------------------------------------------------
    # Public properties
    # ------------------------------------------------------------------

    @property
    def model_name(self) -> str:
        return _MODEL_NAME

    @property
    def is_ready(self) -> bool:
        """True once both the model and post embeddings have been loaded."""
        return self._model is not None and self._embeddings is not None

    @property
    def num_posts(self) -> int:
        return len(self._post_ids)

    # ------------------------------------------------------------------
    # Startup initialisation
    # ------------------------------------------------------------------

    def load_model(self) -> None:
        """Download (or load from cache) the sentence-transformer model."""
        logger.info("embedding_model_loading", model=_MODEL_NAME)
        t0 = time.perf_counter()
        self._model = SentenceTransformer(_MODEL_NAME)
        elapsed = time.perf_counter() - t0
        logger.info("embedding_model_loaded", model=_MODEL_NAME, elapsed_s=round(elapsed, 2))

    def build_index(self, posts: list[RedditPost]) -> None:
        """
        Generate and cache L2-normalised embeddings for *posts*.

        Must be called after :meth:`load_model`.

        Parameters
        ----------
        posts:
            All in-memory Reddit posts.  The ordering is preserved so that
            row *i* of the embedding matrix corresponds to ``posts[i]``.
        """
        if self._model is None:
            raise RuntimeError("Call load_model() before build_index().")

        if not posts:
            logger.warning("embedding_index_empty", reason="no posts provided")
            self._embeddings = np.empty((0, 384), dtype=np.float32)
            self._post_ids = []
            return

        logger.info("embedding_index_build_start", total_posts=len(posts))
        t0 = time.perf_counter()

        texts = [p.full_text for p in posts]
        self._post_ids = [p.id for p in posts]

        # encode() returns a numpy array of shape (N, dim)
        raw: np.ndarray = self._model.encode(  # type: ignore[assignment]
            texts,
            batch_size=_BATCH_SIZE,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,  # L2-normalise so dot == cosine
        )

        self._embeddings = raw.astype(np.float32)

        elapsed = time.perf_counter() - t0
        logger.info(
            "embedding_index_build_complete",
            total_posts=len(posts),
            embedding_dim=self._embeddings.shape[1],
            elapsed_s=round(elapsed, 2),
        )

    # ------------------------------------------------------------------
    # Query-time helpers
    # ------------------------------------------------------------------

    def embed_query(self, query: str) -> np.ndarray:
        """
        Return a 1-D L2-normalised embedding vector for *query*.

        Parameters
        ----------
        query:
            Raw search string.

        Returns
        -------
        np.ndarray
            Shape ``(embedding_dim,)``, dtype float32.
        """
        if self._model is None:
            raise RuntimeError("Model not loaded.")

        vec: np.ndarray = self._model.encode(  # type: ignore[assignment]
            query,
            batch_size=1,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return vec.astype(np.float32)

    def get_embeddings(self) -> np.ndarray:
        """Return the cached post-embedding matrix (read-only view)."""
        if self._embeddings is None:
            raise RuntimeError("Index not built.")
        return self._embeddings

    def get_post_ids(self) -> list[str]:
        """Return the ordered list of post IDs matching embedding rows."""
        return self._post_ids
