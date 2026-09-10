import asyncio
import time
import warnings
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from logging_config import configure_logging, logger

configure_logging()

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

@app.on_event("startup")
async def on_startup():
    try:
        await workflow.session_service.prepare_tables()
    except Exception as e:
        logger.warning(f"Database session table preparation warning: {e}")

    try:
        from gcs_persistence import start_gcs_sync_loop, GCS_BUCKET_NAME
        from database import DATABASE_PATH
        if GCS_BUCKET_NAME:
            asyncio.create_task(start_gcs_sync_loop(DATABASE_PATH))
    except Exception as e:
        logger.warning(f"Could not initialize GCS background sync: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    try:
        from gcs_persistence import upload_db_to_gcs, GCS_BUCKET_NAME
        from database import DATABASE_PATH
        if GCS_BUCKET_NAME:
            upload_db_to_gcs(DATABASE_PATH, force=True)
    except Exception as e:
        logger.warning(f"GCS shutdown upload warning: {e}")

frontend_dist = Path(__file__).parent / "frontend" / "dealpilot-ui" / "dist"
if (frontend_dist / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="frontend-assets")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid4())
        started_at = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "http_request_failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
                },
            )
            raise

        response.headers["X-Request-ID"] = request_id
        logger.info(
            "http_request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
            },
        )
        return response


app.add_middleware(RequestLoggingMiddleware)


@app.get("/", include_in_schema=False)
async def web_ui():
    frontend_dist = Path(__file__).parent / "frontend" / "dealpilot-ui" / "dist"
    built_index = frontend_dist / "index.html"
    if built_index.exists():
        return FileResponse(built_index)
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
