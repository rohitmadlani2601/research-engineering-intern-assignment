"""
Chat API Router
===============
Exposes POST /api/v1/chat.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.models.chat import ChatRequest, ChatResponse
from app.services.chat_service import ChatService

router = APIRouter(tags=["chat"])


def _get_chat_service(request: Request) -> ChatService:
    """Dependency: retrieve the ChatService from app state."""
    service: ChatService | None = getattr(request.app.state, "chat_service", None)
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Chat service is not ready. "
                "The semantic search index may still be loading."
            ),
        )
    return service


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="RAG-powered chatbot over Reddit posts",
    description=(
        "Retrieves the most semantically relevant posts for the user's query, "
        "then generates a concise extractive answer with cited sources. "
        "No external APIs or LLMs are used — purely local computation."
    ),
    status_code=status.HTTP_200_OK,
)
async def chat(
    body: ChatRequest,
    request: Request,
) -> ChatResponse:
    """
    **POST /api/v1/chat**

    Run the RAG pipeline for the user's natural-language question.

    - **query**: user's question (required, must be non-empty)

    Returns a 2–4 sentence extractive answer plus up to 5 source posts.
    """
    if not body.query:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Query must not be empty.",
        )

    chat_service = _get_chat_service(request)
    return chat_service.answer(query=body.query)
