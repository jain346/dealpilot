"""HTTP models and routes for the authenticated DealPilot workflow."""

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth.middleware import get_current_user
from auth.models import UserInDB
from state.models import CreatorProfile, CreatorProfileUpdate
from state.profile import load_or_create_creator_profile, update_creator_profile
from workflow import (
    DealPilotWorkflow,
    WorkflowActionInProgress,
    WorkflowActionPending,
    WorkflowSessionNotFound,
)
from database import (
    add_message,
    delete_brand_research,
    delete_fit_result,
    delete_opportunity,
    get_opportunity,
    get_brand_research,
    get_fit_result,
    list_opportunities,
    list_brand_research,
    list_fit_results,
)

class AgentSession(BaseModel):
    session_id: str


class AgentMessage(BaseModel):
    message: str = Field(min_length=1, max_length=20_000)


class AgentResponse(BaseModel):
    session_id: str
    response: dict[str, Any]


class ProfileResponse(CreatorProfile):
    """Persistent creator profile returned to the authenticated workspace."""


class ConversationMessage(BaseModel):
    role: str
    content: str
    created_at: str


class ConversationSummary(BaseModel):
    session_id: str
    created_at: str


class OpportunityItem(BaseModel):
    id: int
    user_id: str
    session_id: str

    company_name: str
    company_url: str | None = None

    signal_type: str
    opportunity_description: str

    requirements: list[str] = Field(default_factory=list)

    is_explicit_opportunity: bool

    why_relevant: str
    why_now: str | None = None

    confidence: float
    confidence_level: str

    source_urls: list[str] = Field(default_factory=list)

    status: str

    created_at: str
    updated_at: str


class ResearchItem(BaseModel):
    id: int
    user_id: str
    session_id: str

    opportunity_id: int | None = None

    company_name: str
    company_url: str | None = None

    status: str
    summary: str | None = None

    products: list[str] = Field(default_factory=list)
    target_markets: list[str] = Field(default_factory=list)
    target_customers: list[str] = Field(default_factory=list)
    recent_activity: list[str] = Field(default_factory=list)

    creator_partnership_signals: list[str] = Field(default_factory=list)
    partnership_requirements: list[str] = Field(default_factory=list)
    why_now: list[str] = Field(default_factory=list)

    evidence: list[dict[str, Any]] = Field(default_factory=list)

    risks_or_unknowns: list[str] = Field(default_factory=list)

    confidence: float | None = None

    created_at: str
    updated_at: str


class FitItem(BaseModel):
    id: int
    user_id: str
    session_id: str

    opportunity_id: int | None = None
    research_id: int | None = None

    company_name: str

    overall_score: float
    audience_fit: float
    content_fit: float
    market_fit: float
    partnership_fit: float
    timing_fit: float

    recommendation: str

    strengths: list[str] = Field(default_factory=list)
    concerns: list[str] = Field(default_factory=list)

    reasoning: str

    created_at: str
    updated_at: str



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

    @router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_session(session_id: str, current_user: UserInDB = Depends(get_current_user)):
        if not workflow.delete_session(current_user.username, session_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    @router.get("/profile", response_model=ProfileResponse)
    async def get_profile(current_user: UserInDB = Depends(get_current_user)):
        return load_or_create_creator_profile(current_user.username)

    @router.patch("/profile", response_model=ProfileResponse)
    async def patch_profile(
        payload: CreatorProfileUpdate,
        current_user: UserInDB = Depends(get_current_user),
    ):
        return update_creator_profile(current_user.username, payload)

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

    @router.post("/sessions/{session_id}/custom_message", status_code=status.HTTP_201_CREATED)
    async def append_custom_message(
        session_id: str,
        payload: dict[str, Any],
        current_user: UserInDB = Depends(get_current_user),
    ):
        if not workflow.user_owns_session(current_user.username, session_id):
            raise HTTPException(status_code=404, detail="Session not found")
        role = payload.get("role", "assistant")
        content = payload.get("content", "")
        if content:
            add_message(session_id, role, content)
        return {"status": "ok"}

    @router.get("/opportunities",response_model=list[OpportunityItem],)
    async def get_opportunities(
        current_user: UserInDB = Depends(get_current_user),
    ):
        return list_opportunities(current_user.username)

    @router.get(
    "/opportunities/{opportunity_id}",
    response_model=OpportunityItem,)
    async def get_opportunity_detail(
        opportunity_id: int,
        current_user: UserInDB = Depends(get_current_user),
    ):
        opportunity = get_opportunity(
            current_user.username,
            opportunity_id,
        )

        if opportunity is None:
            raise HTTPException(
                status_code=404,
                detail="Opportunity not found",
            )

        return opportunity

    @router.delete("/opportunities/{opportunity_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def remove_opportunity(
        opportunity_id: int,
        current_user: UserInDB = Depends(get_current_user),
    ):
        result = delete_opportunity(current_user.username, opportunity_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        if result == "IN_PROGRESS":
            raise HTTPException(
                status_code=409,
                detail="This opportunity has research in progress and cannot be deleted yet.",
            )

    @router.post(
        "/opportunities/{opportunity_id}/research",
        response_model=ResearchItem,
    )
    async def research_opportunity(
        opportunity_id: int,
        session_id: str | None = None,
        current_user: UserInDB = Depends(get_current_user),
    ):
        try:
            research_id = await workflow.research_opportunity(
                current_user.username,
                opportunity_id,
                session_id=session_id,
            )
        except WorkflowSessionNotFound:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        except WorkflowActionInProgress as error:
            raise HTTPException(status_code=409, detail=str(error))
        except RuntimeError as error:
            raise HTTPException(status_code=502, detail=str(error))

        return get_brand_research(current_user.username, research_id)

    @router.post(
        "/opportunities/{opportunity_id}/fit",
        response_model=FitItem,
    )
    async def evaluate_opportunity_fit(
        opportunity_id: int,
        session_id: str | None = None,
        current_user: UserInDB = Depends(get_current_user),
    ):
        try:
            fit_id = await workflow.evaluate_opportunity_fit(
                current_user.username,
                opportunity_id,
                session_id=session_id,
            )
        except WorkflowSessionNotFound:
            raise HTTPException(status_code=404, detail="Opportunity not found")
        except WorkflowActionInProgress as error:
            raise HTTPException(status_code=409, detail=str(error))
        except WorkflowActionPending as error:
            raise HTTPException(status_code=409, detail=str(error))
        except RuntimeError as error:
            raise HTTPException(status_code=502, detail=str(error))

        fit = get_fit_result(current_user.username, fit_id)
        if fit is None:
            raise HTTPException(status_code=404, detail="Fit result not found")
        return fit

    @router.get(
    "/research",
    response_model=list[ResearchItem],)
    async def get_research(
        current_user: UserInDB = Depends(get_current_user),
    ):
        return list_brand_research(
            current_user.username
        )

    @router.get(
    "/research/{research_id}",
    response_model=ResearchItem,)
    async def get_research_detail(
        research_id: int,
        current_user: UserInDB = Depends(get_current_user),
    ):
        research = get_brand_research(
            current_user.username,
            research_id,
        )

        if research is None:
            raise HTTPException(
                status_code=404,
                detail="Research not found",
            )

        return research

    @router.delete("/research/{research_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def remove_research(
        research_id: int,
        current_user: UserInDB = Depends(get_current_user),
    ):
        result = delete_brand_research(current_user.username, research_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Research not found")

    @router.post("/research/{research_id}/fit", response_model=FitItem)
    async def evaluate_research_fit(
        research_id: int,
        session_id: str | None = None,
        current_user: UserInDB = Depends(get_current_user),
    ):
        research = get_brand_research(current_user.username, research_id)
        if research is None:
            raise HTTPException(status_code=404, detail="Research not found")
        
        opp_id = research.get("opportunity_id")
        if opp_id:
            try:
                fit_id = await workflow.evaluate_opportunity_fit(
                    current_user.username,
                    opp_id,
                    session_id=session_id,
                )
                fit = get_fit_result(current_user.username, fit_id)
                if fit is None:
                    raise HTTPException(status_code=404, detail="Fit result not found")
                return fit
            except WorkflowActionInProgress as error:
                raise HTTPException(status_code=409, detail=str(error))
            except WorkflowActionPending as error:
                raise HTTPException(status_code=409, detail=str(error))
            except RuntimeError as error:
                raise HTTPException(status_code=502, detail=str(error))

        existing_fit = next(
            (item for item in list_fit_results(current_user.username) if item.get("research_id") == research_id),
            None,
        )
        if existing_fit is not None:
            return existing_fit

        target_session_id = session_id or await workflow.create_session(current_user.username)
        runner_session_id = await workflow.create_session(current_user.username)
        try:
            await workflow.run_message(
                current_user.username,
                runner_session_id,
                f"Evaluate creator-brand fit using the fit_agent for this company. Reuse this completed brand research and do not browse or research another company. Company: {research['company_name']}. Research ID: {research_id}. Research JSON: {json.dumps(research)}. Return and persist the structured fit result.",
                research_id=research_id,
                persist_session_id=target_session_id,
            )
            fit = next(
                (item for item in list_fit_results(current_user.username) if item.get("research_id") == research_id),
                None,
            )
            if fit is None:
                raise HTTPException(status_code=500, detail="Fit evaluation could not be completed")
            return fit
        finally:
            workflow.delete_session(current_user.username, runner_session_id)

    @router.get(
    "/fit",
    response_model=list[FitItem],)
    async def get_fit(
        current_user: UserInDB = Depends(get_current_user),
    ):
        return list_fit_results(
            current_user.username
        )

    @router.get(
    "/fit/{fit_id}",
    response_model=FitItem,)
    async def get_fit_detail(
        fit_id: int,
        current_user: UserInDB = Depends(get_current_user),
    ):
        fit = get_fit_result(
            current_user.username,
            fit_id,
        )

        if fit is None:
            raise HTTPException(
                status_code=404,
                detail="Fit result not found",
            )

        return fit

    @router.delete("/fit/{fit_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def remove_fit(
        fit_id: int,
        current_user: UserInDB = Depends(get_current_user),
    ):
        if not delete_fit_result(current_user.username, fit_id):
            raise HTTPException(status_code=404, detail="Fit result not found")
    
    return router

    


