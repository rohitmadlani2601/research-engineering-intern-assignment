from app.api.health import router as health_router
from app.api.posts import router as posts_router
from app.api.search import router as search_router

__all__ = ["health_router", "posts_router", "search_router"]
