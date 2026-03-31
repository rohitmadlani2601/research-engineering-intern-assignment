"""
ClusteringService
=================
Groups posts into topic clusters using KMeans over pre-computed embeddings,
then labels each cluster with top keywords extracted via TF-IDF.

Design decisions
----------------
- Runs **once at startup** and stores results in-memory (zero recomputation).
- Number of clusters is auto-tuned between MIN_K and MAX_K using the
  elbow heuristic (inertia drop ratio), so callers don't need to guess.
- TF-IDF is preferred over raw frequency because it down-weights stop-words
  and corpus-wide common terms without requiring a separate stop-word list.
- Small clusters (< MIN_CLUSTER_SIZE) are kept but flagged so the API can
  surface them differently in the UI if desired.
- Deduplication: if two posts share identical full_text only one embedding
  contributes to clustering (duplicate_of is recorded on the rest).
"""

from __future__ import annotations

import re
import string
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import structlog
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from app.models.post import RedditPost
from app.services.embedding_service import EmbeddingService

logger = structlog.get_logger(__name__)

# ── Tuneable constants ─────────────────────────────────────────────────────────
_MIN_K = 5
_MAX_K = 10
_TOP_KEYWORDS = 8          # keywords extracted per cluster
_MIN_CLUSTER_SIZE = 3      # clusters with fewer posts are "small"
_KMEANS_RANDOM_STATE = 42
_KMEANS_N_INIT = 10
# Stop-words (light, language-agnostic list — TF-IDF handles most of the rest)
_STOP_WORDS = frozenset(
    [
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "shall", "can", "not", "no", "nor",
        "so", "yet", "both", "either", "neither", "whether", "this", "that",
        "these", "those", "it", "its", "he", "she", "they", "we", "i",
        "my", "your", "his", "her", "our", "their", "you", "me", "him",
        "us", "them", "who", "what", "which", "when", "where", "why", "how",
        "all", "any", "each", "every", "more", "most", "other", "some",
        "such", "than", "then", "just", "because", "as", "until", "while",
        "also", "if", "about", "up", "out", "from", "into", "through",
        "during", "before", "after", "above", "below", "between", "http",
        "https", "www", "com", "reddit", "r", "u", "deleted", "removed",
    ]
)


# ── Internal result types ──────────────────────────────────────────────────────

@dataclass
class ClusterInfo:
    """Describes one topic cluster."""
    cluster_id: int
    label: str
    size: int
    top_keywords: list[str]
    is_small: bool
    post_ids: list[str] = field(default_factory=list, repr=False)


@dataclass
class ClusteringResult:
    """Full output returned by :class:`ClusteringService.run`."""
    clusters: list[ClusterInfo]
    # post_id → cluster_id
    post_cluster_map: dict[str, int]
    num_clusters: int
    total_posts_clustered: int
    elapsed_s: float


# ── Text helpers ───────────────────────────────────────────────────────────────

_PUNCT_RE = re.compile(r"[" + re.escape(string.punctuation) + r"\d]+")


def _clean_text(text: str) -> str:
    """Lower-case, strip punctuation/digits, remove stop-words."""
    lowered = text.lower()
    tokens = _PUNCT_RE.sub(" ", lowered).split()
    filtered = [t for t in tokens if t not in _STOP_WORDS and len(t) > 2]
    return " ".join(filtered)


def _build_label(keywords: list[str]) -> str:
    """
    Convert a ranked keyword list into a human-readable cluster label.

    Strategy
    --------
    - Take the top-2 keywords (if available).
    - Title-case each one.
    - Join with ' / '.
    - Fall back to 'General' if no keywords were extracted.
    """
    if not keywords:
        return "General"
    top = keywords[:2]
    return " / ".join(w.title() for w in top)


# ── Auto-tune helpers ──────────────────────────────────────────────────────────

def _select_k(embeddings: np.ndarray) -> int:
    """
    Pick the best k in [MIN_K, MAX_K] using the elbow heuristic.

    We compute KMeans inertia for each candidate k and pick the k at which
    the marginal gain of adding one more cluster drops below 15 % of the
    previous step's gain.  If no clear elbow is found we fall back to MAX_K.
    """
    n = len(embeddings)
    if n <= _MIN_K:
        return max(1, n)

    candidate_ks = range(_MIN_K, min(_MAX_K, n) + 1)
    inertias: list[float] = []

    for k in candidate_ks:
        km = KMeans(
            n_clusters=k,
            random_state=_KMEANS_RANDOM_STATE,
            n_init=_KMEANS_N_INIT,
        )
        km.fit(embeddings)
        inertias.append(km.inertia_)

    # Elbow: largest second-derivative
    deltas = [inertias[i] - inertias[i + 1] for i in range(len(inertias) - 1)]
    if len(deltas) < 2:
        return list(candidate_ks)[-1]

    second_derivative = [deltas[i] - deltas[i + 1] for i in range(len(deltas) - 1)]
    best_idx = int(np.argmax(second_derivative))  # index into candidate_ks starting at index 1
    chosen_k = list(candidate_ks)[best_idx + 1]

    logger.debug(
        "cluster_k_selected",
        candidate_ks=list(candidate_ks),
        inertias=[round(v, 1) for v in inertias],
        chosen_k=chosen_k,
    )
    return chosen_k


# ── Main service ───────────────────────────────────────────────────────────────

class ClusteringService:
    """
    Clusters posts into topic groups via KMeans and labels them with TF-IDF.

    Usage
    -----
    Instantiate once, call :meth:`run` at startup, then use
    :attr:`result` from other services / API routes.

    Thread safety
    -------------
    :attr:`result` is set exactly once during :meth:`run`; it is read-only
    thereafter, so no locking is needed.
    """

    def __init__(self) -> None:
        self._result: Optional[ClusteringResult] = None

    # ------------------------------------------------------------------ #
    # Public properties
    # ------------------------------------------------------------------ #

    @property
    def is_ready(self) -> bool:
        return self._result is not None

    @property
    def result(self) -> Optional[ClusteringResult]:
        return self._result

    # ------------------------------------------------------------------ #
    # Startup
    # ------------------------------------------------------------------ #

    def run(
        self,
        posts: list[RedditPost],
        embedding_service: EmbeddingService,
    ) -> None:
        """
        Build clusters from *posts* using embeddings from *embedding_service*.

        This is designed to be called inside ``asyncio.to_thread`` so it
        doesn't block the event loop.

        Parameters
        ----------
        posts:
            Full list of in-memory posts (same ordering used to build the
            embedding index).
        embedding_service:
            Fully initialised service whose index has already been built.
        """
        t0 = time.perf_counter()
        logger.info("clustering_start", total_posts=len(posts))

        # ── Edge case: empty dataset ───────────────────────────────────────
        if not posts or not embedding_service.is_ready:
            logger.warning(
                "clustering_skipped",
                reason="no posts or embeddings not ready",
            )
            self._result = ClusteringResult(
                clusters=[],
                post_cluster_map={},
                num_clusters=0,
                total_posts_clustered=0,
                elapsed_s=0.0,
            )
            return

        # ── Deduplicate by exact full_text ─────────────────────────────────
        seen_texts: dict[str, str] = {}          # text_hash → canonical post_id
        unique_posts: list[RedditPost] = []
        duplicate_of: dict[str, str] = {}        # dup_post_id → canonical_post_id

        for post in posts:
            key = post.full_text.strip()
            if key in seen_texts:
                duplicate_of[post.id] = seen_texts[key]
            else:
                seen_texts[key] = post.id
                unique_posts.append(post)

        logger.info(
            "clustering_dedup",
            original=len(posts),
            unique=len(unique_posts),
            duplicates=len(duplicate_of),
        )

        # Build index lookup: post_id → row index in the embedding matrix
        all_post_ids = embedding_service.get_post_ids()
        id_to_row: dict[str, int] = {pid: i for i, pid in enumerate(all_post_ids)}

        # Gather embeddings for unique posts only
        embeddings_matrix = embedding_service.get_embeddings()  # (N, D)
        unique_rows = [id_to_row[p.id] for p in unique_posts if p.id in id_to_row]
        unique_embeddings = embeddings_matrix[unique_rows]  # (U, D)

        # Re-normalise after slicing (already normalised, but be safe)
        unique_embeddings = normalize(unique_embeddings, norm="l2")

        # ── Select k & run KMeans ──────────────────────────────────────────
        k = _select_k(unique_embeddings)
        logger.info("clustering_kmeans_start", k=k, unique_posts=len(unique_posts))

        km = KMeans(
            n_clusters=k,
            random_state=_KMEANS_RANDOM_STATE,
            n_init=_KMEANS_N_INIT,
        )
        labels: np.ndarray = km.fit_predict(unique_embeddings)

        # ── Group posts by cluster ─────────────────────────────────────────
        cluster_post_ids: dict[int, list[str]] = defaultdict(list)
        post_cluster_map: dict[str, int] = {}

        for i, post in enumerate(unique_posts):
            cid = int(labels[i])
            cluster_post_ids[cid].append(post.id)
            post_cluster_map[post.id] = cid

        # Propagate cluster assignment to duplicates
        for dup_id, canonical_id in duplicate_of.items():
            if canonical_id in post_cluster_map:
                cid = post_cluster_map[canonical_id]
                post_cluster_map[dup_id] = cid
                cluster_post_ids[cid].append(dup_id)

        # ── TF-IDF keyword extraction per cluster ──────────────────────────
        cluster_texts: dict[int, str] = {}
        for cid, pids in cluster_post_ids.items():
            pid_set = set(pids)
            combined = " ".join(
                _clean_text(p.full_text)
                for p in posts
                if p.id in pid_set
            )
            cluster_texts[cid] = combined

        # Fit a single TF-IDF over all cluster "documents"
        cid_order = sorted(cluster_texts.keys())
        corpus = [cluster_texts[cid] for cid in cid_order]

        cluster_keywords: dict[int, list[str]] = {}

        if any(doc.strip() for doc in corpus):
            vectorizer = TfidfVectorizer(
                max_features=5000,
                min_df=1,
                ngram_range=(1, 2),
                sublinear_tf=True,
            )
            tfidf_matrix = vectorizer.fit_transform(corpus)
            feature_names = vectorizer.get_feature_names_out()

            for idx, cid in enumerate(cid_order):
                row = tfidf_matrix[idx].toarray().flatten()
                top_indices = np.argsort(-row)[:_TOP_KEYWORDS]
                keywords = [
                    feature_names[j]
                    for j in top_indices
                    if row[j] > 0 and feature_names[j] not in _STOP_WORDS
                ]
                cluster_keywords[cid] = keywords
        else:
            for cid in cid_order:
                cluster_keywords[cid] = []

        # ── Build ClusterInfo objects ──────────────────────────────────────
        cluster_infos: list[ClusterInfo] = []
        for cid in cid_order:
            pids = cluster_post_ids[cid]
            kws = cluster_keywords.get(cid, [])
            cluster_infos.append(
                ClusterInfo(
                    cluster_id=cid,
                    label=_build_label(kws),
                    size=len(pids),
                    top_keywords=kws,
                    is_small=len(pids) < _MIN_CLUSTER_SIZE,
                    post_ids=pids,
                )
            )

        # Sort clusters largest-first so the API response is more useful
        cluster_infos.sort(key=lambda c: c.size, reverse=True)

        elapsed = time.perf_counter() - t0
        self._result = ClusteringResult(
            clusters=cluster_infos,
            post_cluster_map=post_cluster_map,
            num_clusters=len(cluster_infos),
            total_posts_clustered=len(post_cluster_map),
            elapsed_s=round(elapsed, 3),
        )

        logger.info(
            "clustering_complete",
            num_clusters=self._result.num_clusters,
            total_posts=self._result.total_posts_clustered,
            elapsed_s=self._result.elapsed_s,
        )
