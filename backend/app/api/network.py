"""
Network API
===========

GET /api/v1/network
    Returns the full author interaction graph (nodes + edges) with PageRank
    scores and community IDs.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.models.network import NetworkEdge, NetworkNode, NetworkResponse
from app.services.network_service import NetworkService

router = APIRouter(prefix="/network", tags=["network"])


def _get_service(request: Request) -> NetworkService:
    svc: NetworkService | None = getattr(request.app.state, "network_service", None)
    if svc is None or not svc.is_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "NETWORK_NOT_READY",
                "message": "Network graph has not been computed yet. Please retry shortly.",
            },
        )
    return svc


@router.get(
    "",
    response_model=NetworkResponse,
    summary="Author interaction network graph",
    description=(
        "Returns nodes (authors) and edges (shared topic cluster interactions) "
        "with PageRank influence scores and community IDs from greedy modularity detection. "
        "Nodes are sorted by PageRank descending; edges by weight descending."
    ),
)
def get_network(request: Request) -> NetworkResponse:
    svc = _get_service(request)
    result = svc.result  # type: ignore[union-attr]

    return NetworkResponse(
        nodes=[
            NetworkNode(
                id=n.id,
                pagerank=n.pagerank,
                community=n.community,
                post_count=n.post_count,
            )
            for n in result.nodes
        ],
        edges=[
            NetworkEdge(source=e.source, target=e.target, weight=e.weight)
            for e in result.edges
        ],
        num_nodes=result.num_nodes,
        num_edges=result.num_edges,
        num_communities=result.num_communities,
    )
