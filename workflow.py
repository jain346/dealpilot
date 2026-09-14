"""Authenticated, user-scoped access to the DealPilot ADK workflow."""

import asyncio
import time
from collections import defaultdict
from uuid import uuid4
import json

from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.apps import App
from google.adk.runners import Runner
from google.adk.sessions import DatabaseSessionService
from google.genai import types

from agent import root_agent
from logging_config import logger
from database import (
    add_message,
    create_conversation,
    adk_database_url,
    get_conversations,
    delete_conversation,
    get_messages,
    get_user,
    get_opportunity,
    get_brand_research,
    list_brand_research,
    list_fit_results,
    user_owns_conversation,
)

from state.business_persistence import (
    save_opportunity_output,
    save_brand_research_output,
    save_brand_research_job,
    save_brand_research_job,
    save_fit_output,
)

TRACKED_OUTPUT_KEYS = (
    "last_opportunity_output",
    "last_brand_research_output",
    "last_fit_output",
)

def _parse_agent_output(value):
        """
        Convert an ADK output_key value into a Python dict.

        Structured specialist outputs may arrive in state as a JSON string.
        """
        if value is None:
            return None

        if isinstance(value, dict):
            return value

        if isinstance(value, str):
            text = value.strip()

            if not text:
                return None

            try:
                return json.loads(text)
            except json.JSONDecodeError:
                fenced = text.replace("```json", "").replace("```", "").strip()
                try:
                    return json.loads(fenced)
                except json.JSONDecodeError:
                    start = fenced.find("{")
                    end = fenced.rfind("}")
                    if start >= 0 and end > start:
                        try:
                            return json.loads(fenced[start : end + 1])
                        except json.JSONDecodeError:
                            pass
                    logger.warning(
                        "agent_output_not_json",
                        extra={"output_chars": len(text)},
                    )
                    return None

        return None

class WorkflowSessionNotFound(Exception):
    """Raised when a user tries to use a session they do not own."""


class WorkflowActionPending(Exception):
    """Raised when an asynchronous specialist job has not completed yet."""


class WorkflowActionInProgress(Exception):
    """Raised when this user already has a research action in progress."""


class DealPilotWorkflow:
    """One ADK app with isolated conversation sessions for each authenticated user."""

    app_name = "dealpilot"

    def __init__(self) -> None:
        # ADK stores events and session state in SQLite, so the agent has the
        # full prior context after an API/server restart.
        self.session_service = DatabaseSessionService(adk_database_url())
        self.app = App(
            name=self.app_name,
            root_agent=root_agent,
            # Keep the existing cache threshold used by the CLI runner.
            context_cache_config=ContextCacheConfig(min_tokens=8192),
        )
        self.runner = Runner(app=self.app, session_service=self.session_service)
        self._session_locks: defaultdict[tuple[str, str], asyncio.Lock] = defaultdict(
            asyncio.Lock
        )

    async def _sync_user_creator_profile(self, user_id: str) -> None:
        """Sync canonical SQLite creator profile into ADK user state storage."""
        from state.profile import load_or_create_creator_profile
        from datetime import datetime, timezone

        await self.session_service.prepare_tables()
        profile = load_or_create_creator_profile(user_id)
        schema = self.session_service._get_schema_classes()
        now = datetime.now(timezone.utc)
        if self.session_service._uses_naive_datetime():
            now = now.replace(tzinfo=None)

        async with self.session_service._rollback_on_exception_session() as sql_session:
            user_state_row = await sql_session.get(
                schema.StorageUserState, (self.app_name, user_id)
            )
            if user_state_row:
                user_state_row.state["creator_profile"] = profile.model_dump(mode="json")
                user_state_row.update_time = now
            else:
                user_state_row = schema.StorageUserState(
                    app_name=self.app_name,
                    user_id=user_id,
                    state={"creator_profile": profile.model_dump(mode="json")},
                    update_time=now,
                )
                sql_session.add(user_state_row)
            await sql_session.commit()

    async def create_session(self, user_id: str) -> str:
        """Create an unguessable session and persist its user ownership."""
        if get_user(user_id) is None:
            raise ValueError(
                f"User '{user_id}' does not exist; create the account before creating a session."
            )

        await self._sync_user_creator_profile(user_id)
        session_id = str(uuid4())
        await self.session_service.create_session(
            app_name=self.app_name, user_id=user_id, session_id=session_id
        )
        create_conversation(session_id, user_id)
        logger.info(
            "workflow_session_created",
            extra={"user_id": user_id, "session_id": session_id},
        )
        return session_id


    def user_owns_session(self, user_id: str, session_id: str) -> bool:
        """Return whether the persisted conversation belongs to this user."""
        return user_owns_conversation(session_id, user_id)

    def get_conversation(self, session_id: str) -> list[dict[str, str]]:
        """Return the persisted message transcript in chronological order."""
        return get_messages(session_id)

    def get_user_conversations(self, user_id: str) -> list[dict[str, str]]:
        """Return only conversations owned by this user."""
        return get_conversations(user_id)

    def delete_session(self, user_id: str, session_id: str) -> bool:
        """Delete a conversation session if owned by user."""
        return delete_conversation(session_id, user_id)

    async def research_opportunity(
        self,
        user_id: str,
        opportunity_id: int,
        session_id: str | None = None,
    ) -> int:
        """Research an owned opportunity and persist the structured result."""
        opportunity = get_opportunity(user_id, opportunity_id)
        if opportunity is None:
            raise WorkflowSessionNotFound

        existing_research = next(
            (item for item in list_brand_research(user_id) if item.get("opportunity_id") == opportunity_id),
            None,
        )
        if existing_research is not None and existing_research.get("status") == "COMPLETED":
            return existing_research["id"]

        active_research = next(
            (item for item in list_brand_research(user_id) if item.get("status") == "IN_PROGRESS"),
            None,
        )
        if active_research is not None and active_research.get("id") != (existing_research or {}).get("id"):
            raise WorkflowActionInProgress(
                "A brand research job is already in progress. Please wait for it to complete."
            )

        target_session_id = session_id or (existing_research["session_id"] if existing_research else await self.create_session(user_id))
        ##runner_session_id = await self.create_session(user_id)
        
        response = await self.run_message(
                user_id,
                target_session_id,
                f"Research this specific opportunity using the brand_research_agent, then persist its structured result. "
                f"Do not discover other companies. Opportunity ID: {opportunity_id}. Company: {opportunity['company_name']}. "
                f"Official URL: {opportunity.get('company_url') or 'unknown'}. Opportunity context: {opportunity['opportunity_description']}. "
                f"Known source URLs already found during opportunity discovery — use these as a starting point instead of "
                f"resolving the company from scratch: {', '.join(opportunity.get('source_urls') or []) or 'none available'}.",
                opportunity_id=opportunity_id,
                persist_session_id=target_session_id,
                conversation_message=f"Research brand: {opportunity['company_name']}",
            )
        research = next(
                (item for item in list_brand_research(user_id) if item.get("opportunity_id") == opportunity_id),
                None,
            )
        if research is None:
            if response:
                return save_brand_research_job(
                        username=user_id,
                        session_id=target_session_id,
                        company_name=opportunity["company_name"],
                        company_url=opportunity.get("company_url"),
                        opportunity_id=opportunity_id,
                    )
            raise WorkflowActionPending("Brand research is still in progress. Try again when it completes.")
        return research["id"]
       

    async def evaluate_opportunity_fit(
        self,
        user_id: str,
        opportunity_id: int,
        session_id: str | None = None,
    ) -> int:
        """Evaluate fit for an owned opportunity, researching it first if needed."""
        opportunity = get_opportunity(user_id, opportunity_id)
        if opportunity is None:
            raise WorkflowSessionNotFound

        existing_research = next(
            (item for item in list_brand_research(user_id) if item.get("opportunity_id") == opportunity_id),
            None,
        )
        active_research = next(
            (item for item in list_brand_research(user_id) if item.get("status") == "IN_PROGRESS"),
            None,
        )
        if active_research is not None and active_research.get("opportunity_id") != opportunity_id:
            raise WorkflowActionInProgress(
                "A brand research job is already in progress. Fit evaluation is unavailable until it completes."
            )

        research = next(
            (item for item in [existing_research] if item is not None),
            None,
        )
        if research is None:
            research_id = await self.research_opportunity(user_id, opportunity_id, session_id=session_id)
            research = get_brand_research(user_id, research_id)
        if research is None:
            raise RuntimeError("Research was not available for fit evaluation")
        if research.get("status") != "COMPLETED":
            raise WorkflowActionPending("Research is still in progress. Try Evaluate fit again when it is completed.")

        existing_fit = next(
            (
                item for item in list_fit_results(user_id)
                if item.get("opportunity_id") == opportunity_id
                and item.get("research_id") == research["id"]
            ),
            None,
        )
        if existing_fit is not None:
            return existing_fit["id"]

        target_session_id = session_id or await self.create_session(user_id)
        ##runner_session_id = await self.create_session(user_id)
        
        await self.run_message(
                user_id,
                target_session_id,
                f"Evaluate creator-brand fit using the fit_agent for this opportunity. Reuse this completed brand research and do not browse or research another company. Company: {opportunity['company_name']}. Opportunity ID: {opportunity_id}. Research ID: {research['id']}. Research JSON: {json.dumps(research)}. Return and persist the structured fit result.",
                opportunity_id=opportunity_id,
                research_id=research["id"],
                persist_session_id=target_session_id,
                conversation_message=f"Evaluate fit for brand: {opportunity['company_name']}",
            )
        fit = next(
                (item for item in list_fit_results(user_id) if item.get("opportunity_id") == opportunity_id and item.get("research_id") == research["id"]),
                None,
            )
        if fit is None:
            raise RuntimeError("Fit evaluation did not return a structured result")
        return fit["id"]
     

    async def run_message(
        self,
        user_id: str,
        session_id: str,
        message: str,
        opportunity_id: int | None = None,
        research_id: int | None = None,
        persist_session_id: str | None = None,
        conversation_message: str | None = None,
    ) -> str:
        """Run the Director workflow and persist specialist outputs."""

        lock = self._session_locks[(user_id, session_id)]

        async with lock:
            started_at = time.perf_counter()

            # --------------------------------------------------
            # AUTHORIZATION
            # --------------------------------------------------

            if not user_owns_conversation(
                session_id,
                user_id,
            ):
                logger.warning(
                    "workflow_session_not_found",
                    extra={
                        "user_id": user_id,
                        "session_id": session_id,
                    },
                )
                raise WorkflowSessionNotFound

            logger.info(
                "agent_run_started",
                extra={
                    "user_id": user_id,
                    "session_id": session_id,
                    "input_chars": len(message),
                },
            )

            # --------------------------------------------------
            # ENSURE ADK SESSION AND USER PROFILE STATE EXIST
            # --------------------------------------------------

            await self._sync_user_creator_profile(user_id)

            session = await self.session_service.get_session(
                app_name=self.app_name,
                user_id=user_id,
                session_id=session_id,
            )


            if session is None:
                await self.session_service.create_session(
                    app_name=self.app_name,
                    user_id=user_id,
                    session_id=session_id,
                )

            # --------------------------------------------------
            # SNAPSHOT SPECIALIST OUTPUTS BEFORE THE TURN
            # --------------------------------------------------

            session_before = await self.session_service.get_session(
                app_name=self.app_name,
                user_id=user_id,
                session_id=session_id,
            )

            before_state = dict(
                session_before.state
            ) if session_before else {}

            # --------------------------------------------------
            # RUN DIRECTOR
            # --------------------------------------------------

            input_message = types.Content(
                role="user",
                parts=[
                    types.Part.from_text(
                        text=message
                    )
                ],
            )

            add_message(
                session_id,
                "user",
                conversation_message or message,
            )

            responses: list[str] = []

            async for event in self.runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=input_message,
            ):
                if (
                    event.is_final_response()
                    and event.content
                    and event.content.parts
                ):
                    responses.extend(
                        part.text
                        for part in event.content.parts
                        if part.text
                    )

            response = "".join(responses)

            add_message(
                session_id,
                "assistant",
                response,
            )

            # --------------------------------------------------
            # READ UPDATED SESSION STATE
            # --------------------------------------------------

            session_after = await self.session_service.get_session(
                app_name=self.app_name,
                user_id=user_id,
                session_id=session_id,
            )

            after_state = (
                dict(session_after.state)
                if session_after
                else {}
            )

            # --------------------------------------------------
            # PERSIST OPPORTUNITY OUTPUT
            # --------------------------------------------------

            opportunity_raw = after_state.get(
                "last_opportunity_output"
            )

            if (
                opportunity_raw is not None
                and opportunity_raw != before_state.get(
                    "last_opportunity_output"
                )
            ):
                opportunity_output = _parse_agent_output(
                    opportunity_raw
                )

                if opportunity_output:
                    try:
                        save_opportunity_output(
                            username=user_id,
                            session_id=session_id,
                            output=opportunity_output,
                        )

                        logger.info(
                            "opportunity_output_persisted",
                            extra={
                                "user_id": user_id,
                                "session_id": session_id,
                            },
                        )

                    except Exception:
                        logger.exception(
                            "opportunity_output_persistence_failed",
                            extra={
                                "user_id": user_id,
                                "session_id": session_id,
                            },
                        )

            # --------------------------------------------------
            # PERSIST BRAND RESEARCH OUTPUT
            # --------------------------------------------------

            research_raw = after_state.get(
                "last_brand_research_output"
            )

            if (
                research_raw is not None
                and research_raw != before_state.get(
                    "last_brand_research_output"
                )
            ):
                research_output = _parse_agent_output(
                    research_raw
                )

                if research_output:
                    storage_session_id = persist_session_id or session_id
                    try:
                        save_brand_research_output(
                            username=user_id,
                            session_id=storage_session_id,
                            output=research_output,
                            opportunity_id=opportunity_id,
                        )

                        logger.info(
                            "brand_research_output_persisted",
                            extra={
                                "user_id": user_id,
                                "session_id": storage_session_id,
                            },
                        )

                    except Exception:
                        logger.exception(
                            "brand_research_persistence_failed",
                            extra={
                                "user_id": user_id,
                                "session_id": storage_session_id,
                            },
                        )

            # --------------------------------------------------
            # PERSIST FIT OUTPUT
            # --------------------------------------------------

            fit_raw = after_state.get(
                "last_fit_output"
            )

            if (
                fit_raw is not None
                and fit_raw != before_state.get(
                    "last_fit_output"
                )
            ):
                fit_output = _parse_agent_output(
                    fit_raw
                )

                if fit_output:
                    storage_session_id = persist_session_id or session_id
                    try:
                        if "company_name" not in fit_output and opportunity_id is not None:
                            linked_opportunity = get_opportunity(user_id, opportunity_id)
                            if linked_opportunity is not None:
                                fit_output["company_name"] = linked_opportunity["company_name"]
                        save_fit_output(
                            username=user_id,
                            session_id=storage_session_id,
                            output=fit_output,
                            opportunity_id=opportunity_id,
                            research_id=research_id,
                        )

                        logger.info(
                            "fit_output_persisted",
                            extra={
                                "user_id": user_id,
                                "session_id": storage_session_id,
                            },
                        )

                    except Exception:
                        logger.exception(
                            "fit_output_persistence_failed",
                            extra={
                                "user_id": user_id,
                                "session_id": session_id,
                            },
                        )

            # --------------------------------------------------
            # COMPLETE
            # --------------------------------------------------

            logger.info(
                "agent_run_completed",
                extra={
                    "user_id": user_id,
                    "session_id": session_id,
                    "response_chars": len(response),
                    "duration_ms": round(
                        (time.perf_counter() - started_at) * 1000,
                        2,
                    ),
                },
            )

            return response
