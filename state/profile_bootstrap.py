import asyncio

from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmRequest, LlmResponse

from state.models import CreatorProfile
from state.profile import load_or_create_creator_profile


PROFILE_STATE_KEY = "user:creator_profile"


async def bootstrap_creator_profile(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
) -> LlmResponse | None:
    """
    Load the creator's persistent profile into ADK user state.

    Application DB is the canonical source.
    ADK user state is the runtime copy used by the Director.
    """

    state = callback_context.state

    # ADK already has the persistent user-scoped profile.
    if PROFILE_STATE_KEY in state:
        return None

    user_id = callback_context.session.user_id

    if not user_id:
        return None

    # database.py is synchronous SQLite, so don't block ADK's
    # asynchronous execution loop.
    creator_profile = await asyncio.to_thread(
        load_or_create_creator_profile,
        user_id,
    )

    state[PROFILE_STATE_KEY] = creator_profile.model_dump(
        mode="json",
    )

    return None