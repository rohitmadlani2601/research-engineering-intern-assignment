from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import health_router, posts_router, search_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.models.post import ErrorDetail
from app.services.dataset import load_posts
from app.services.embedding_service import EmbeddingService
from app.services.post_service import PostService
from app.services.search_service import SearchService

configure_logging()
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logger.info("startup_begin", app=settings.APP_NAME, env=settings.ENVIRONMENT)

    posts: list = []
    try:
        posts = await asyncio.to_thread(
            load_posts, settings.DATA_PATH, settings.MAX_ROWS_IN_MEMORY
        )
        app.state.post_service = PostService(posts)
        logger.info("startup_complete", total_posts=len(posts))
    except FileNotFoundError as exc:
        logger.error("dataset_missing", error=str(exc))
        app.state.post_service = None

    # ── Semantic search index ──────────────────────────────────────────────
    # Run model loading and embedding generation in a thread so we don't
    # block the event loop during the potentially long startup phase.
    try:
        embedding_svc = EmbeddingService()
        await asyncio.to_thread(embedding_svc.load_model)
        await asyncio.to_thread(embedding_svc.build_index, posts)
        app.state.search_service = SearchService(
            embedding_service=embedding_svc,
            posts=posts,
        )
        logger.info(
            "semantic_search_ready",
            model=embedding_svc.model_name,
            indexed_posts=embedding_svc.num_posts,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("semantic_search_startup_failed", error=str(exc))
        app.state.search_service = None

    yield

    logger.info("shutdown")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.APP_VERSION,
        description=(
            "NarrativeLens — a production-grade API for analyzing how narratives "
            "spread across social media platforms."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(posts_router, prefix="/api/v1")
    app.include_router(search_router, prefix="/api/v1")

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_exception", path=str(request.url), error=str(exc))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorDetail(
                code="INTERNAL_ERROR",
                message="An unexpected error occurred.",
            ).model_dump(),
        )

    return app


app = create_app()

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
        log_config=None,
    )
