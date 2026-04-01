"""
NetworkService
==============
Builds a co-cluster author interaction graph using networkx, computes PageRank
scores for influence ranking, and detects communities via greedy modularity
maximisation.

Design decisions
----------------
- Nodes = unique authors with ≥ 2 posts (singleton authors add noise, not signal).
- Edges = two authors who both posted in the same cluster; edge weight = number
  of shared clusters (multi-cluster overlap increases weight).
- Self-loops excluded.
- PageRank damping factor = 0.85 (standard).
- Community detection uses networkx's `greedy_modularity_communities` which is
  fast, dependency-free, and deterministic given a fixed random seed.
- Graph is undirected for community detection; PageRank is run on undirected too.
- Runs once at startup after ClusteringService has completed.
"""

from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

import structlog

try:
    import networkx as nx
    from networkx.algorithms.community import greedy_modularity_communities
    _NX_AVAILABLE = True
except ImportError:
    _NX_AVAILABLE = False

from app.models.post import RedditPost
from app.services.clustering_service import ClusteringResult

logger = structlog.get_logger(__name__)

_MIN_AUTHOR_POSTS = 2          # authors with fewer posts are excluded
_MAX_NODES_RETURNED = 200      # cap for API response size
_MAX_EDGES_RETURNED = 500


# ── Result types ───────────────────────────────────────────────────────────────

@dataclass
class NetworkNode:
    id: str                         # author username
    pagerank: float
    community: int
    post_count: int


@dataclass
class NetworkEdge:
    source: str
    target: str
    weight: float


@dataclass
class NetworkResult:
    nodes: list[NetworkNode]
    edges: list[NetworkEdge]
    num_nodes: int
    num_edges: int
    num_communities: int
    elapsed_s: float


# ── Main service ───────────────────────────────────────────────────────────────

class NetworkService:
    """
    Builds and caches an author co-cluster interaction graph.

    Requires :class:`~app.services.clustering_service.ClusteringResult` to
    be available (cluster assignments already computed).
    """

    def __init__(self) -> None:
        self._result: Optional[NetworkResult] = None

    @property
    def is_ready(self) -> bool:
        return self._result is not None

    @property
    def result(self) -> Optional[NetworkResult]:
        return self._result

    def run(
        self,
        posts: list[RedditPost],
        clustering_result: ClusteringResult,
    ) -> None:
        """Build the network graph. Call once at startup."""
        t0 = time.perf_counter()
        logger.info("network_start", total_posts=len(posts))

        if not _NX_AVAILABLE:
            logger.error("network_skipped", reason="networkx not installed")
            self._result = NetworkResult(
                nodes=[], edges=[], num_nodes=0,
                num_edges=0, num_communities=0, elapsed_s=0.0,
            )
            return

        # ── Count posts per author ─────────────────────────────────────────
        author_post_count: dict[str, int] = defaultdict(int)
        for post in posts:
            if post.author and post.author not in ("[deleted]", "[removed]", ""):
                author_post_count[post.author] += 1

        eligible_authors: set[str] = {
            a for a, c in author_post_count.items() if c >= _MIN_AUTHOR_POSTS
        }
        logger.info(
            "network_authors",
            total_authors=len(author_post_count),
            eligible=len(eligible_authors),
        )

        # ── Map author → set of clusters ──────────────────────────────────
        post_cluster = clustering_result.post_cluster_map   # post_id → cluster_id
        author_clusters: dict[str, set[int]] = defaultdict(set)

        for post in posts:
            if post.author in eligible_authors and post.id in post_cluster:
                author_clusters[post.author].add(post_cluster[post.id])

        # ── Build edge weight: shared clusters ────────────────────────────
        # For each cluster, collect the list of authors
        cluster_authors: dict[int, list[str]] = defaultdict(list)
        for author, clusters in author_clusters.items():
            for cid in clusters:
                cluster_authors[cid].append(author)

        edge_weights: dict[tuple[str, str], float] = defaultdict(float)
        for cid, authors in cluster_authors.items():
            unique = list(set(authors))
            for i in range(len(unique)):
                for j in range(i + 1, len(unique)):
                    a, b = sorted([unique[i], unique[j]])
                    edge_weights[(a, b)] += 1.0

        # ── Build networkx graph ───────────────────────────────────────────
        G = nx.Graph()
        G.add_nodes_from(eligible_authors)
        for (a, b), w in edge_weights.items():
            G.add_edge(a, b, weight=w)

        logger.info(
            "network_graph_built",
            nodes=G.number_of_nodes(),
            edges=G.number_of_edges(),
        )

        # ── PageRank ───────────────────────────────────────────────────────
        if G.number_of_nodes() == 0:
            self._result = NetworkResult(
                nodes=[], edges=[], num_nodes=0,
                num_edges=0, num_communities=0, elapsed_s=0.0,
            )
            return

        pagerank: dict[str, float] = nx.pagerank(G, alpha=0.85, weight="weight")

        # ── Community detection ────────────────────────────────────────────
        communities_raw = list(greedy_modularity_communities(G, weight="weight"))
        author_community: dict[str, int] = {}
        for comm_id, members in enumerate(communities_raw):
            for member in members:
                author_community[member] = comm_id

        # ── Sort and cap nodes ─────────────────────────────────────────────
        sorted_authors = sorted(pagerank.keys(), key=lambda a: -pagerank[a])
        top_authors_set = set(sorted_authors[:_MAX_NODES_RETURNED])

        nodes = [
            NetworkNode(
                id=author,
                pagerank=round(pagerank[author], 8),
                community=author_community.get(author, 0),
                post_count=author_post_count[author],
            )
            for author in sorted_authors[:_MAX_NODES_RETURNED]
        ]

        # Edges only between top nodes, sorted by weight descending
        top_edges = [
            NetworkEdge(source=a, target=b, weight=w)
            for (a, b), w in sorted(edge_weights.items(), key=lambda x: -x[1])
            if a in top_authors_set and b in top_authors_set
        ][:_MAX_EDGES_RETURNED]

        elapsed = time.perf_counter() - t0
        self._result = NetworkResult(
            nodes=nodes,
            edges=top_edges,
            num_nodes=G.number_of_nodes(),
            num_edges=G.number_of_edges(),
            num_communities=len(communities_raw),
            elapsed_s=round(elapsed, 3),
        )

        logger.info(
            "network_complete",
            num_nodes=self._result.num_nodes,
            num_edges=self._result.num_edges,
            num_communities=self._result.num_communities,
            elapsed_s=self._result.elapsed_s,
        )
