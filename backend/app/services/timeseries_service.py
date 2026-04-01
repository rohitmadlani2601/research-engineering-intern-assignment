"""
TimeSeriesService
=================
Groups posts by calendar date (derived from created_utc) and produces a
chronological count series, plus a short rule-based narrative summary.

Design decisions
----------------
- Runs once at startup; result is immutable thereafter.
- Summary is generated via statistical heuristics (peak detection, trend
  direction) — no external API required.
- Optional query filtering is handled at the *API layer* so this service
  stays dependency-free.
"""

from __future__ import annotations

import time
from collections import Counter
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

import structlog

from app.models.post import RedditPost

logger = structlog.get_logger(__name__)


# ── Result types ───────────────────────────────────────────────────────────────

@dataclass
class TimeSeriesPoint:
    date: str   # ISO 8601 date string: YYYY-MM-DD
    count: int


@dataclass
class TimeSeriesResult:
    points: list[TimeSeriesPoint]
    summary: str
    peak_date: Optional[str]
    peak_count: int
    total_posts: int
    date_range_days: int
    elapsed_s: float


# ── Helpers ────────────────────────────────────────────────────────────────────

def _trend_direction(counts: list[int]) -> str:
    """Return 'rising', 'falling', or 'stable' based on first vs. last third."""
    n = len(counts)
    if n < 6:
        return "stable"
    third = n // 3
    first_avg = sum(counts[:third]) / third
    last_avg = sum(counts[-third:]) / third
    if last_avg > first_avg * 1.25:
        return "rising"
    if last_avg < first_avg * 0.75:
        return "falling"
    return "stable"


def _generate_summary(
    points: list[TimeSeriesPoint],
    peak_date: Optional[str],
    peak_count: int,
    trend: str,
) -> str:
    """Build a 1–2 sentence natural-language insight without external APIs."""
    if not points:
        return "No activity data available for this selection."

    total = sum(p.count for p in points)
    span = len(points)

    trend_phrases = {
        "rising":  "Post volume shows a clear upward trend over the period.",
        "falling": "Activity gradually declined over the observed period.",
        "stable":  "Discussion volume remained relatively consistent throughout.",
    }
    base = trend_phrases[trend]

    if peak_date and peak_count > 0:
        avg = total / span if span else 1
        spike_ratio = peak_count / avg
        if spike_ratio >= 3:
            spike_desc = f"A significant spike of {peak_count:,} posts occurred on {peak_date}, suggesting a major event drove discussion."
        elif spike_ratio >= 1.8:
            spike_desc = f"Activity peaked on {peak_date} with {peak_count:,} posts — roughly {spike_ratio:.1f}× the daily average."
        else:
            spike_desc = f"The busiest day was {peak_date} with {peak_count:,} posts."
        return f"{base} {spike_desc}"

    return base


def _build_result(posts: list[RedditPost]) -> TimeSeriesResult:
    t0 = time.perf_counter()

    date_counter: Counter[str] = Counter()
    for post in posts:
        day = post.created_utc.date().isoformat()
        date_counter[day] += 1

    sorted_dates = sorted(date_counter.keys())
    points = [TimeSeriesPoint(date=d, count=date_counter[d]) for d in sorted_dates]

    counts = [p.count for p in points]
    peak_date: Optional[str] = None
    peak_count = 0
    if counts:
        peak_idx = counts.index(max(counts))
        peak_date = points[peak_idx].date
        peak_count = counts[peak_idx]

    trend = _trend_direction(counts)
    summary = _generate_summary(points, peak_date, peak_count, trend)

    span = len(points)
    total = sum(counts)

    elapsed = time.perf_counter() - t0
    return TimeSeriesResult(
        points=points,
        summary=summary,
        peak_date=peak_date,
        peak_count=peak_count,
        total_posts=total,
        date_range_days=span,
        elapsed_s=round(elapsed, 4),
    )


# ── Main service ───────────────────────────────────────────────────────────────

class TimeSeriesService:
    """
    Pre-computes the global time series at startup.

    The API layer can call :meth:`compute_for_posts` with a filtered
    subset of posts for query-specific time series — this is cheap since
    it only iterates dates.
    """

    def __init__(self) -> None:
        self._result: Optional[TimeSeriesResult] = None

    @property
    def is_ready(self) -> bool:
        return self._result is not None

    @property
    def result(self) -> Optional[TimeSeriesResult]:
        return self._result

    def run(self, posts: list[RedditPost]) -> None:
        """Build and cache the full-corpus time series. Call once at startup."""
        logger.info("timeseries_start", total_posts=len(posts))
        self._result = _build_result(posts)
        logger.info(
            "timeseries_complete",
            date_range_days=self._result.date_range_days,
            peak_date=self._result.peak_date,
            elapsed_s=self._result.elapsed_s,
        )

    def compute_for_posts(self, posts: list[RedditPost]) -> TimeSeriesResult:
        """Compute a fresh time series for an arbitrary post subset (no caching)."""
        return _build_result(posts)
