"""HTTP models and routes for the authenticated DealPilot workflow."""

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth.middleware import get_current_user
from auth.models import UserInDB
from workflow import DealPilotWorkflow, WorkflowSessionNotFound


class AgentSession(BaseModel):
    session_id: str


class AgentMessage(BaseModel):
    message: str = Field(min_length=1, max_length=20_000)


class AgentResponse(BaseModel):
    session_id: str
    response: dict[str, Any]


class ConversationMessage(BaseModel):
    role: str
    content: str
    created_at: str


class ConversationSummary(BaseModel):
    session_id: str
    created_at: str


def normalize_agent_response(raw_response: str) -> dict[str, Any]:
    """Convert the plain text agent answer into a JSON-safe payload with markdown and links."""
    text = (raw_response or "").replace("\r\n", "\n").strip()
    if not text:
        text = "I completed the workflow but did not return a written response."
    links = re.findall(r"https?://[^\s<>'\")\]]+", text)
    return {
        "text": text,
        "markdown": text,
        "links": links,
    }


def create_agent_router(workflow: DealPilotWorkflow) -> APIRouter:
    router = APIRouter(prefix="/agent", tags=["agent"])

    @router.post("/sessions", response_model=AgentSession, status_code=status.HTTP_201_CREATED)
    async def create_session(current_user: UserInDB = Depends(get_current_user)):
        session_id = await workflow.create_session(current_user.username)
        return AgentSession(session_id=session_id)

    @router.get("/sessions", response_model=list[ConversationSummary])
    async def list_sessions(current_user: UserInDB = Depends(get_current_user)):
        return workflow.get_user_conversations(current_user.username)

    @router.post("/sessions/{session_id}/messages", response_model=AgentResponse)
    async def send_message(
        session_id: str,
        payload: AgentMessage,
        current_user: UserInDB = Depends(get_current_user),
    ):
        try:
            response = await workflow.run_message(
                current_user.username, session_id, payload.message
            )
        except WorkflowSessionNotFound:
            # Do not reveal whether another user's session ID exists.
            raise HTTPException(status_code=404, detail="Session not found")
        return AgentResponse(
            session_id=session_id,
            response=normalize_agent_response(response),
        )

    @router.get("/sessions/{session_id}/messages", response_model=list[ConversationMessage])
    async def get_conversation(
        session_id: str, current_user: UserInDB = Depends(get_current_user)
    ):
        if not workflow.user_owns_session(current_user.username, session_id):
            raise HTTPException(status_code=404, detail="Session not found")
        return workflow.get_conversation(session_id)

    return router
