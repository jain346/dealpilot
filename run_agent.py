import asyncio
import warnings
from google.adk.runners import Runner
from google.adk.apps import App
from google.adk.agents.context_cache_config import ContextCacheConfig
from google.adk.sessions import InMemorySessionService
from google.genai import types


# Import the root agent exported by the project
from agent import root_agent


# ADK orchestrates function calls itself, but google-genai emits this advisory
# for its internal AsyncModels call. It is not actionable by this CLI client.
warnings.filterwarnings(
    "ignore",
    message=r"Direct use of automatic function calling \(AFC\).*",
    category=UserWarning,
)


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
        # Gemini 3 requires at least 4,096 cached tokens. Use a larger local
        # gate because the cacheable prefix is smaller than the full prompt.
        context_cache_config=ContextCacheConfig(min_tokens=8192),
    )
    runner = Runner(
        app=app,
        session_service=session_service,
    )

    print("🤖 DealPilot chat is ready. Type 'exit' or 'quit' to end.\n")

    while True:
        user_query = input("You: ").strip()
        if user_query.lower() in {"exit", "quit"}:
            print("Goodbye!")
            break
        if not user_query:
            continue

        input_message = types.Content(
            role="user", parts=[types.Part.from_text(text=user_query)]
        )
        event_stream = runner.run_async(
            user_id=USER_ID, session_id=SESSION_ID, new_message=input_message
        )

        async for event in event_stream:
            if event.is_final_response() and event.content and event.content.parts:
                response_text = "".join(
                    part.text or "" for part in event.content.parts if part.text
                )
                if response_text:
                    print(f"\nDealPilot: {response_text}\n")


if __name__ == "__main__":
    asyncio.run(main())
