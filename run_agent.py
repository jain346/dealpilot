import asyncio
from google.adk.runners import Runner
from google.adk.apps import App
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.sessions import InMemorySessionService
from google.genai import types


# Import the root agent exported by the project
from agent1 import root_agent


async def main():
    session_service = InMemorySessionService()

    APP_NAME = "terminal-multi-agent-app"
    USER_ID = "local_developer"
    SESSION_ID = "session_001"

    await session_service.create_session(
        app_name=APP_NAME, user_id=USER_ID, session_id=SESSION_ID
    )

    app = App(
        name=APP_NAME,
        root_agent=root_agent,
        context_cache_config=ContextCacheConfig(),
    )
    runner = Runner(
        app=app,
        session_service=session_service,
    )

    user_query = "Hi"

    input_message = types.Content(
        role="user", parts=[types.Part.from_text(text=user_query)]
    )

    print(f"🚀 Dispatched query to Multi-Agent cluster: '{user_query}'\n")

    event_stream = runner.run_async(
        user_id=USER_ID, session_id=SESSION_ID, new_message=input_message
    )

    async for event in event_stream:
        if event.is_final_response() and event.content and event.content.parts:
            response_text = "".join(
                part.text or "" for part in event.content.parts if part.text
            )
            if response_text:
                print(f"\n🤖 Final Agent Response:\n{response_text}")


if __name__ == "__main__":
    asyncio.run(main())
