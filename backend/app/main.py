from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncIterator

import structlog
import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    chat_router,
    clusters_router,
    embedding_map_router,
    health_router,
    network_router,
    posts_router,
    search_router,
    timeseries_router,
)
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.models.post import ErrorDetail
from app.services.chat_service import ChatService
from app.services.clustering_service import ClusteringService
from app.services.dataset import load_posts
from app.services.embedding_service import EmbeddingService
from app.services.embedding_viz_service import EmbeddingVizService
from app.services.network_service import NetworkService
from app.services.post_service import PostService
from app.services.search_service import SearchService
from app.services.timeseries_service import TimeSeriesService

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
        embedding_svc = None  # type: ignore[assignment]

    # ── Chat service (RAG pipeline) ───────────────────────────────────────────
    if app.state.search_service is not None:
        try:
            app.state.chat_service = ChatService(
                search_service=app.state.search_service
            )
            logger.info("chat_service_ready")
        except Exception as exc:  # noqa: BLE001
            logger.error("chat_service_startup_failed", error=str(exc))
            app.state.chat_service = None
    else:
        app.state.chat_service = None
        logger.warning("chat_service_skipped", reason="search_service_not_ready")

    # ── Topic clustering ───────────────────────────────────────────────────
    clustering_svc = ClusteringService()
    try:
        if embedding_svc is not None:
            await asyncio.to_thread(clustering_svc.run, posts, embedding_svc)
        app.state.clustering_service = clustering_svc
        logger.info(
            "clustering_ready",
            num_clusters=(
                clustering_svc.result.num_clusters
                if clustering_svc.result
                else 0
            ),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("clustering_startup_failed", error=str(exc))
        app.state.clustering_service = None

    # ── Time-series ────────────────────────────────────────────────────────
    try:
        ts_svc = TimeSeriesService()
        await asyncio.to_thread(ts_svc.run, posts)
        app.state.timeseries_service = ts_svc
        logger.info(
            "timeseries_ready",
            date_range_days=ts_svc.result.date_range_days if ts_svc.result else 0,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("timeseries_startup_failed", error=str(exc))
        app.state.timeseries_service = None

    # ── Network graph ──────────────────────────────────────────────────────
    try:
        network_svc = NetworkService()
        if clustering_svc.result is not None:
            await asyncio.to_thread(
                network_svc.run, posts, clustering_svc.result
            )
        app.state.network_service = network_svc
        logger.info(
            "network_ready",
            num_nodes=network_svc.result.num_nodes if network_svc.result else 0,
            num_edges=network_svc.result.num_edges if network_svc.result else 0,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("network_startup_failed", error=str(exc))
        app.state.network_service = None

    # ── Embedding visualisation ────────────────────────────────────────────
    try:
        embedding_viz_svc = EmbeddingVizService()
        if embedding_svc is not None and clustering_svc.result is not None:
            await asyncio.to_thread(
                embedding_viz_svc.run, posts, embedding_svc, clustering_svc.result
            )
        app.state.embedding_viz_service = embedding_viz_svc
        logger.info(
            "embedding_viz_ready",
            total=embedding_viz_svc.result.total_posts if embedding_viz_svc.result else 0,
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("embedding_viz_startup_failed", error=str(exc))
        app.state.embedding_viz_service = None

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
    app.include_router(chat_router, prefix="/api/v1")
    app.include_router(clusters_router, prefix="/api/v1")
    app.include_router(timeseries_router, prefix="/api/v1")
    app.include_router(network_router, prefix="/api/v1")
    app.include_router(embedding_map_router, prefix="/api/v1")

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
