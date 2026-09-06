"""Small SQLite persistence layer for users, conversations, and messages."""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional


DATABASE_PATH = Path(
    os.environ.get("DEALPILOT_DATABASE_PATH", Path(__file__).with_name("dealpilot.db"))
)


def adk_database_url() -> str:
    """Return an async SQLite URL for ADK's durable session/event store."""
    configured_url = os.environ.get("DEALPILOT_ADK_DATABASE_URL")
    if configured_url:
        return configured_url
    return f"sqlite+aiosqlite:///{DATABASE_PATH.resolve()}"


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db() -> None:
    with connection() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                hashed_password TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversations (
                session_id TEXT PRIMARY KEY,
                username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS conversations_username_created_idx
                ON conversations(username, created_at DESC);

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES conversations(session_id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS messages_session_created_idx
                ON messages(session_id, id);
            """
        )


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_user(username: str) -> Optional[dict[str, Optional[str]]]:
    with connection() as db:
        row = db.execute(
            "SELECT username, email, hashed_password FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    return dict(row) if row else None


def create_user(
    username: str, email: Optional[str], hashed_password: str
) -> dict[str, Optional[str]]:
    with connection() as db:
        db.execute(
            "INSERT INTO users (username, email, hashed_password, created_at) VALUES (?, ?, ?, ?)",
            (username, email, hashed_password, now()),
        )
    return {
        "username": username,
        "email": email,
        "hashed_password": hashed_password,
    }


def create_conversation(session_id: str, username: str) -> None:
    with connection() as db:
        db.execute(
            "INSERT INTO conversations (session_id, username, created_at) VALUES (?, ?, ?)",
            (session_id, username, now()),
        )


def user_owns_conversation(session_id: str, username: str) -> bool:
    with connection() as db:
        return (
            db.execute(
                "SELECT 1 FROM conversations WHERE session_id = ? AND username = ?",
                (session_id, username),
            ).fetchone()
            is not None
        )


def add_message(session_id: str, role: str, content: str) -> None:
    with connection() as db:
        db.execute(
            "INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (session_id, role, content, now()),
        )


def get_messages(session_id: str) -> list[dict[str, str]]:
    with connection() as db:
        rows = db.execute(
            "SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY id",
            (session_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_conversations(username: str) -> list[dict[str, str]]:
    """Return a user's conversations, newest first."""
    with connection() as db:
        rows = db.execute(
            "SELECT session_id, created_at FROM conversations "
            "WHERE username = ? ORDER BY created_at DESC",
            (username,),
        ).fetchall()
    return [dict(row) for row in rows]


init_db()
