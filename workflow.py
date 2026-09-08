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
    get_messages,
    get_user,
    user_owns_conversation,
)

from state.business_persistence import (
    save_opportunity_output,
    save_brand_research_output,
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
                logger.warning(
                    "agent_output_not_json",
                    extra={"output_chars": len(text)},
                )
                return None

        return None

class WorkflowSessionNotFound(Exception):
    """Raised when a user tries to use a session they do not own."""


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

    async def create_session(self, user_id: str) -> str:
        """Create an unguessable session and persist its user ownership."""
        if get_user(user_id) is None:
            raise ValueError(
                f"User '{user_id}' does not exist; create the account before creating a session."
            )

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

    

    async def run_message(self,user_id: str,session_id: str,message: str,) -> str:
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
            # ENSURE ADK SESSION EXISTS
            # --------------------------------------------------

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
                message,
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
                    try:
                        save_brand_research_output(
                            username=user_id,
                            session_id=session_id,
                            output=research_output,
                        )

                        logger.info(
                            "brand_research_output_persisted",
                            extra={
                                "user_id": user_id,
                                "session_id": session_id,
                            },
                        )

                    except Exception:
                        logger.exception(
                            "brand_research_persistence_failed",
                            extra={
                                "user_id": user_id,
                                "session_id": session_id,
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
                    try:
                        save_fit_output(
                            username=user_id,
                            session_id=session_id,
                            output=fit_output,
                        )

                        logger.info(
                            "fit_output_persisted",
                            extra={
                                "user_id": user_id,
                                "session_id": session_id,
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
