"""
EmbeddingVizService
===================
Reduces the high-dimensional post embedding matrix to 2D using PCA for
interactive scatter-plot visualisation.

Design decisions
----------------
- PCA is used (not UMAP) — deterministic, zero extra dependencies, fast.
- Runs once at startup; result is immutable.
- Points are randomly sampled (default 3 000) when the corpus is large to
  keep API payload manageable while preserving cluster structure visually.
- Normalises PCA output to roughly [−1, 1] per axis for consistent rendering.
"""

from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Optional

import numpy as np
import structlog
from sklearn.decomposition import PCA
from sklearn.preprocessing import MinMaxScaler

from app.models.post import RedditPost
from app.services.clustering_service import ClusteringResult
from app.services.embedding_service import EmbeddingService

logger = structlog.get_logger(__name__)

_DEFAULT_SAMPLE = 3_000   # max points returned by default


# ── Result types ───────────────────────────────────────────────────────────────

@dataclass
class EmbeddingPoint:
    post_id: str
    x: float
    y: float
    cluster_id: int
    label: str


@dataclass
class EmbeddingVizResult:
    points: list[EmbeddingPoint]
    explained_variance: float      # fraction explained by first 2 PCs
    total_posts: int
    sampled_posts: int
    elapsed_s: float


# ── Main service ───────────────────────────────────────────────────────────────

class EmbeddingVizService:
    """
    Pre-computes the 2-D PCA projection of all post embeddings.

    Requires both :class:`~app.services.embedding_service.EmbeddingService`
    (for the raw matrix) and :class:`~app.services.clustering_service.ClusteringResult`
    (for cluster labels).
    """

    def __init__(self) -> None:
        self._result: Optional[EmbeddingVizResult] = None
        # Store full points for sample-size queries
        self._all_points: list[EmbeddingPoint] = []
        self._explained_variance: float = 0.0
        self._total_posts: int = 0

    @property
    def is_ready(self) -> bool:
        return self._result is not None

    @property
    def result(self) -> Optional[EmbeddingVizResult]:
        return self._result

    def get_sampled(self, sample: int = _DEFAULT_SAMPLE) -> EmbeddingVizResult:
        """Return a random sample of points (useful for query-time down-sampling)."""
        if not self._all_points:
            return EmbeddingVizResult(
                points=[], explained_variance=0.0,
                total_posts=0, sampled_posts=0, elapsed_s=0.0,
            )
        pts = self._all_points
        if len(pts) > sample:
            pts = random.sample(pts, sample)
        return EmbeddingVizResult(
            points=pts,
            explained_variance=self._explained_variance,
            total_posts=self._total_posts,
            sampled_posts=len(pts),
            elapsed_s=0.0,
        )

    def run(
        self,
        posts: list[RedditPost],
        embedding_service: EmbeddingService,
        clustering_result: ClusteringResult,
    ) -> None:
        """Build the 2-D projection. Call once at startup."""
        t0 = time.perf_counter()
        logger.info("embedding_viz_start", total_posts=len(posts))

        if not embedding_service.is_ready or not posts:
            logger.warning("embedding_viz_skipped", reason="embeddings or posts not ready")
            self._result = EmbeddingVizResult(
                points=[], explained_variance=0.0,
                total_posts=len(posts), sampled_posts=0, elapsed_s=0.0,
            )
            return

        # ── PCA projection ────────────────────────────────────────────────
        embeddings: np.ndarray = embedding_service.get_embeddings()   # (N, D)
        post_ids: list[str] = embedding_service.get_post_ids()
        n_components = min(2, embeddings.shape[0], embeddings.shape[1])

        pca = PCA(n_components=n_components, random_state=42)
        coords_2d: np.ndarray = pca.fit_transform(embeddings)         # (N, 2)

        explained = float(np.sum(pca.explained_variance_ratio_))

        # Normalise to [-1, 1] per axis for stable rendering
        scaler = MinMaxScaler(feature_range=(-1, 1))
        coords_2d = scaler.fit_transform(coords_2d)

        # ── Build lookup maps ─────────────────────────────────────────────
        post_cluster = clustering_result.post_cluster_map   # post_id → cluster_id
        cluster_id_to_label: dict[int, str] = {
            c.cluster_id: c.label for c in clustering_result.clusters
        }

        # ── Assemble points ───────────────────────────────────────────────
        all_points: list[EmbeddingPoint] = []
        for i, pid in enumerate(post_ids):
            cid = post_cluster.get(pid, -1)
            label = cluster_id_to_label.get(cid, "Unknown")
            all_points.append(
                EmbeddingPoint(
                    post_id=pid,
                    x=round(float(coords_2d[i, 0]), 5),
                    y=round(float(coords_2d[i, 1]), 5),
                    cluster_id=cid,
                    label=label,
                )
            )

        self._all_points = all_points
        self._explained_variance = round(explained, 4)
        self._total_posts = len(all_points)

        # Default result uses the full sample cap
        sampled = all_points if len(all_points) <= _DEFAULT_SAMPLE else random.sample(all_points, _DEFAULT_SAMPLE)

        elapsed = time.perf_counter() - t0
        self._result = EmbeddingVizResult(
            points=sampled,
            explained_variance=self._explained_variance,
            total_posts=self._total_posts,
            sampled_posts=len(sampled),
            elapsed_s=round(elapsed, 3),
        )

        logger.info(
            "embedding_viz_complete",
            total=self._total_posts,
            sampled=len(sampled),
            explained_variance=explained,
            elapsed_s=self._result.elapsed_s,
        )
