from __future__ import annotations

import time

from fastapi import APIRouter, Request

from app.core.config import get_settings
from app.models.post import HealthStatus
from app.services.post_service import PostService

router = APIRouter(tags=["health"])

_start_time = time.monotonic()


@router.get(
    "/health",
    response_model=HealthStatus,
    summary="System health check",
)
def health_check(request: Request) -> HealthStatus:
    settings = get_settings()
    service: PostService | None = getattr(request.app.state, "post_service", None)

    return HealthStatus(
        status="ok",
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        dataset_loaded=service is not None,
        total_posts=service.total if service else None,
        uptime_seconds=round(time.monotonic() - _start_time, 2),
    )
