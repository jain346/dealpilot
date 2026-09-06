import asyncio
import warnings
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI
from fastapi.responses import FileResponse

from agent_api import create_agent_router
from auth import router as auth_router
from auth import services as auth_services
from workflow import DealPilotWorkflow


# ADK orchestrates function calls itself, but google-genai emits this advisory
# for its internal AsyncModels call. It is not actionable by this CLI client.
warnings.filterwarnings(
    "ignore",
    message=r"Direct use of automatic function calling \(AFC\).*",
    category=UserWarning,
)


workflow = DealPilotWorkflow()

# `uvicorn run_agent:app` serves this API. Auth routes are public only for
# signup/login; every agent workflow route requires a Bearer JWT.
app = FastAPI(title="DealPilot API")
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(create_agent_router(workflow))


@app.get("/", include_in_schema=False)
async def web_ui():
    return FileResponse(Path(__file__).with_name("static") / "index.html")


@app.get("/health")
async def health():
    return {"status": "ok"}


async def main():
    """Keep a local CLI entry point with its own isolated development session."""
    user_id = "local_developer"
    if not auth_services.get_user(user_id):
        # The CLI is a local-development convenience, but it follows the same
        # durable ownership constraint as browser users.
        auth_services.create_user(user_id, str(uuid4()), None)
    session_id = await workflow.create_session(user_id)

    print("🤖 DealPilot chat is ready. Type 'exit' or 'quit' to end.\n")

    while True:
        user_query = input("You: ").strip()
        if user_query.lower() in {"exit", "quit"}:
            print("Goodbye!")
            break
        if not user_query:
            continue

        response_text = await workflow.run_message(user_id, session_id, user_query)
        if response_text:
            print(f"\nDealPilot: {response_text}\n")


if __name__ == "__main__":
    asyncio.run(main())
