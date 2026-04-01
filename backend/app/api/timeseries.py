"""
Time-Series API
===============

GET /api/v1/timeseries
    Returns the full-corpus daily post counts + AI summary.

GET /api/v1/timeseries?query=<text>
    Filters posts by semantic similarity to <query> first, then returns
    the time series for the matching subset.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.models.timeseries import TimeSeriesPoint, TimeSeriesResponse
from app.services.timeseries_service import TimeSeriesService

router = APIRouter(prefix="/timeseries", tags=["timeseries"])


# ── Dependency helpers ─────────────────────────────────────────────────────────

def _get_ts_service(request: Request) -> TimeSeriesService:
    svc: TimeSeriesService | None = getattr(request.app.state, "timeseries_service", None)
    if svc is None or not svc.is_ready:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "TIMESERIES_NOT_READY",
                "message": "Time-series data has not been computed yet. Please retry shortly.",
            },
        )
    return svc


def _get_search_service(request: Request):
    return getattr(request.app.state, "search_service", None)


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=TimeSeriesResponse,
    summary="Daily post count time series",
    description=(
        "Returns chronological daily post counts for the full corpus or a "
        "semantically filtered subset (when `query` is provided). "
        "Includes a short rule-based narrative summary and peak-date annotation."
    ),
)
def get_timeseries(
    request: Request,
    query: str | None = Query(None, description="Optional semantic search query to filter posts."),
    top_k: int = Query(5000, ge=10, le=50_000, description="Max posts to include when using semantic search."),
) -> TimeSeriesResponse:
    ts_svc = _get_ts_service(request)

    if not query or not query.strip():
        # Full-corpus result — use cached
        result = ts_svc.result  # type: ignore[union-attr]
        return TimeSeriesResponse(
            points=[TimeSeriesPoint(date=p.date, count=p.count) for p in result.points],
            summary=result.summary,
            peak_date=result.peak_date,
            peak_count=result.peak_count,
            total_posts=result.total_posts,
            date_range_days=result.date_range_days,
            query=None,
        )

    # Semantic-filtered subset
    search_svc = _get_search_service(request)
    if search_svc is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SEARCH_NOT_READY", "message": "Semantic search is not ready yet."},
        )

    search_results = search_svc.search(query=query.strip(), top_k=top_k, threshold=0.15)
    # SearchResultItem is a subclass of RedditPost — pass results directly
    filtered_posts = search_results.results  # type: ignore[assignment]


    if not filtered_posts:
        return TimeSeriesResponse(
            points=[],
            summary="No posts matched this query — try a broader search term.",
            peak_date=None,
            peak_count=0,
            total_posts=0,
            date_range_days=0,
            query=query.strip(),
        )

    result = ts_svc.compute_for_posts(filtered_posts)
    return TimeSeriesResponse(
        points=[TimeSeriesPoint(date=p.date, count=p.count) for p in result.points],
        summary=result.summary,
        peak_date=result.peak_date,
        peak_count=result.peak_count,
        total_posts=result.total_posts,
        date_range_days=result.date_range_days,
        query=query.strip(),
    )
