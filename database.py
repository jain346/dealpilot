"""Small SQLite persistence layer for users, conversations, and messages."""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional
import json


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
            
            CREATE TABLE IF NOT EXISTS creator_profiles (
                user_id TEXT PRIMARY KEY
                    REFERENCES users(username) ON DELETE CASCADE,

                creator_name TEXT,

                niche TEXT,

                platforms TEXT,

                region TEXT,

                languages TEXT,

                audience_description TEXT,

                audience_size INTEGER,

                average_views INTEGER,

                engagement_rate REAL,

                created_at TEXT NOT NULL,

                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS creator_profiles_updated_idx
                ON creator_profiles(updated_at);

            CREATE TABLE IF NOT EXISTS opportunities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id TEXT NOT NULL
                    REFERENCES users(username) ON DELETE CASCADE,

                session_id TEXT NOT NULL
                    REFERENCES conversations(session_id) ON DELETE CASCADE,

                company_name TEXT NOT NULL,
                company_url TEXT,

                signal_type TEXT NOT NULL,
                opportunity_description TEXT NOT NULL,

                requirements TEXT NOT NULL DEFAULT '[]',

                is_explicit_opportunity INTEGER NOT NULL DEFAULT 0,

                why_relevant TEXT NOT NULL,
                why_now TEXT,

                confidence REAL NOT NULL,
                confidence_level TEXT NOT NULL,

                source_urls TEXT NOT NULL DEFAULT '[]',

                status TEXT NOT NULL DEFAULT 'DISCOVERED',

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS opportunities_user_updated_idx
                ON opportunities(user_id, updated_at DESC);

            CREATE INDEX IF NOT EXISTS opportunities_session_idx
                ON opportunities(session_id);


            CREATE TABLE IF NOT EXISTS brand_research (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id TEXT NOT NULL
                    REFERENCES users(username) ON DELETE CASCADE,

                session_id TEXT NOT NULL
                    REFERENCES conversations(session_id) ON DELETE CASCADE,

                opportunity_id INTEGER
                    REFERENCES opportunities(id) ON DELETE SET NULL,

                company_name TEXT NOT NULL,
                company_url TEXT,

                status TEXT NOT NULL DEFAULT 'COMPLETED',

                summary TEXT,

                products TEXT NOT NULL DEFAULT '[]',
                target_markets TEXT NOT NULL DEFAULT '[]',
                target_customers TEXT NOT NULL DEFAULT '[]',
                recent_activity TEXT NOT NULL DEFAULT '[]',
                creator_partnership_signals TEXT NOT NULL DEFAULT '[]',
                partnership_requirements TEXT NOT NULL DEFAULT '[]',
                why_now TEXT NOT NULL DEFAULT '[]',

                evidence TEXT NOT NULL DEFAULT '[]',
                risks_or_unknowns TEXT NOT NULL DEFAULT '[]',

                confidence REAL,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS brand_research_user_updated_idx
                ON brand_research(user_id, updated_at DESC);

            CREATE INDEX IF NOT EXISTS brand_research_session_idx
                ON brand_research(session_id);

            CREATE TABLE IF NOT EXISTS fit_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,

                user_id TEXT NOT NULL
                    REFERENCES users(username) ON DELETE CASCADE,

                session_id TEXT NOT NULL
                    REFERENCES conversations(session_id) ON DELETE CASCADE,

                opportunity_id INTEGER
                    REFERENCES opportunities(id) ON DELETE SET NULL,

                research_id INTEGER
                    REFERENCES brand_research(id) ON DELETE SET NULL,

                company_name TEXT NOT NULL,

                overall_score REAL NOT NULL,
                audience_fit REAL NOT NULL,
                content_fit REAL NOT NULL,
                market_fit REAL NOT NULL,
                partnership_fit REAL NOT NULL,
                timing_fit REAL NOT NULL,

                recommendation TEXT NOT NULL,

                strengths TEXT NOT NULL DEFAULT '[]',
                concerns TEXT NOT NULL DEFAULT '[]',

                reasoning TEXT NOT NULL,

                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS fit_results_user_updated_idx
                ON fit_results(user_id, updated_at DESC);

            CREATE INDEX IF NOT EXISTS fit_results_session_idx
                ON fit_results(session_id);
            """
        )

        db.execute("DROP INDEX IF EXISTS brand_research_task_idx")
        research_columns = {
            row[1] for row in db.execute("PRAGMA table_info(brand_research)")
        }
        if "parallel_task_id" in research_columns:
            db.execute("ALTER TABLE brand_research DROP COLUMN parallel_task_id")

        # Clean up duplicates: run as individual execute() calls so they share
        # the same connection transaction.  executescript() issues an implicit
        # COMMIT before each statement, so DELETE + CREATE INDEX end up in
        # separate transactions — the index creation would see pre-DELETE data
        # and raise IntegrityError.  Using execute() here means the DELETE's
        # effect is visible when CREATE UNIQUE INDEX validates the table.
        db.execute(
            "DELETE FROM opportunities WHERE id NOT IN ("
            "SELECT MAX(id) FROM opportunities GROUP BY user_id, lower(company_name))"
        )
        db.execute(
            "DELETE FROM brand_research WHERE id NOT IN ("
            "SELECT MIN(id) FROM brand_research WHERE opportunity_id IS NOT NULL "
            "GROUP BY user_id, opportunity_id) AND opportunity_id IS NOT NULL"
        )
        db.execute(
            "DELETE FROM brand_research WHERE id NOT IN ("
            "SELECT MIN(id) FROM brand_research WHERE opportunity_id IS NULL "
            "GROUP BY user_id, lower(company_name)) AND opportunity_id IS NULL"
        )
        db.execute(
            "DELETE FROM fit_results WHERE id NOT IN ("
            "SELECT MAX(id) FROM fit_results GROUP BY user_id, lower(company_name))"
        )
        db.execute(
            "DELETE FROM brand_research WHERE status = 'IN_PROGRESS' AND id NOT IN ("
            "SELECT MIN(id) FROM brand_research WHERE status = 'IN_PROGRESS' GROUP BY user_id)"
        )

        # Create / refresh unique indexes.  Each is wrapped in its own
        # try/except so a pre-existing index or a rare duplicate that the
        # DELETE above missed never crashes startup.
        for _stmt in [
            "DROP INDEX IF EXISTS opportunities_logical_key_idx",
            "CREATE UNIQUE INDEX IF NOT EXISTS opportunities_company_key_idx"
            " ON opportunities(user_id, lower(company_name))",
            "CREATE UNIQUE INDEX IF NOT EXISTS brand_research_opportunity_key_idx"
            " ON brand_research(user_id, opportunity_id) WHERE opportunity_id IS NOT NULL",
            "CREATE UNIQUE INDEX IF NOT EXISTS brand_research_company_key_idx"
            " ON brand_research(user_id, lower(company_name)) WHERE opportunity_id IS NULL",
            "DROP INDEX IF EXISTS fit_results_logical_key_idx",
            "DROP INDEX IF EXISTS fit_results_company_key_idx",
            "CREATE UNIQUE INDEX IF NOT EXISTS fit_results_company_key_idx"
            " ON fit_results(user_id, lower(company_name))",
            "CREATE UNIQUE INDEX IF NOT EXISTS brand_research_active_user_idx"
            " ON brand_research(user_id) WHERE status = 'IN_PROGRESS'",
        ]:
            try:
                db.execute(_stmt)
            except Exception:
                pass  # index already exists or rare edge-case dup; non-fatal


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_user(username: str) -> Optional[dict[str, Optional[str]]]:
    with connection() as db:
        row = db.execute(
            "SELECT username, email, hashed_password FROM users WHERE LOWER(username) = LOWER(?)",
            (username.strip(),),
        ).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> Optional[dict[str, Optional[str]]]:
    with connection() as db:
        row = db.execute(
            "SELECT username, email, hashed_password FROM users WHERE LOWER(email) = LOWER(?)",
            (email.strip(),),
        ).fetchone()
    return dict(row) if row else None



def create_user(
    username: str, email: Optional[str], hashed_password: str
) -> dict[str, Optional[str]]:
    normalized_username = username.strip()
    normalized_email = email.strip().lower() if email else None
    with connection() as db:
        db.execute(
            "INSERT INTO users (username, email, hashed_password, created_at) VALUES (?, ?, ?, ?)",
            (normalized_username, normalized_email, hashed_password, now()),
        )
    return {
        "username": normalized_username,
        "email": normalized_email,
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


def delete_conversation(session_id: str, username: str) -> bool:
    """Delete a conversation and its cascading messages if owned by user."""
    with connection() as db:
        cursor = db.execute(
            "DELETE FROM conversations WHERE session_id = ? AND username = ?",
            (session_id, username),
        )
        return cursor.rowcount > 0


def get_creator_profile(username: str) -> Optional[dict]:
    with connection() as db:
        row = db.execute(
            """
            SELECT
                user_id,
                creator_name,
                niche,
                platforms,
                region,
                languages,
                audience_description,
                audience_size,
                average_views,
                engagement_rate,
                created_at,
                updated_at
            FROM creator_profiles
            WHERE user_id = ?
            """,
            (username,),
        ).fetchone()

    if not row:
        return None

    profile = dict(row)

    profile["platforms"] = (
        json.loads(profile["platforms"])
        if profile["platforms"]
        else []
    )

    profile["languages"] = (
        json.loads(profile["languages"])
        if profile["languages"]
        else []
    )

    return profile


def create_empty_creator_profile(username: str) -> dict:
    timestamp = now()

    with connection() as db:
        db.execute(
            """
            INSERT OR IGNORE INTO creator_profiles (
                user_id,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?)
            """,
            (username, timestamp, timestamp),
        )

    profile = get_creator_profile(username)

    if profile is None:
        raise RuntimeError(
            f"Failed to create creator profile for user '{username}'"
        )

    return profile

def upsert_creator_profile(
    username: str,
    profile: dict,
) -> dict:
    timestamp = now()

    platforms = json.dumps(
        profile.get("platforms", []),
        ensure_ascii=False,
    )

    languages = json.dumps(
        profile.get("languages", []),
        ensure_ascii=False,
    )

    raw_audience_size = profile.get("audience_size")
    audience_size = None
    if raw_audience_size is not None:
        try:
            parsed = int(raw_audience_size)
            if parsed > 0:
                audience_size = parsed
        except (ValueError, TypeError):
            audience_size = None

    with connection() as db:
        existing = db.execute(
            "SELECT user_id FROM creator_profiles WHERE user_id = ?",
            (username,),
        ).fetchone()

        if existing:
            db.execute(
                """
                UPDATE creator_profiles
                SET
                    creator_name = ?,
                    niche = ?,
                    platforms = ?,
                    region = ?,
                    languages = ?,
                    audience_description = ?,
                    audience_size = ?,
                    average_views = ?,
                    engagement_rate = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (
                    profile.get("creator_name"),
                    profile.get("niche"),
                    platforms,
                    profile.get("region"),
                    languages,
                    profile.get("audience_description"),
                    audience_size,
                    profile.get("average_views"),
                    profile.get("engagement_rate"),
                    timestamp,
                    username,
                ),
            )
        else:
            db.execute(
                """
                INSERT INTO creator_profiles (
                    user_id,
                    creator_name,
                    niche,
                    platforms,
                    region,
                    languages,
                    audience_description,
                    audience_size,
                    average_views,
                    engagement_rate,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    username,
                    profile.get("creator_name"),
                    profile.get("niche"),
                    platforms,
                    profile.get("region"),
                    languages,
                    profile.get("audience_description"),
                    audience_size,
                    profile.get("average_views"),
                    profile.get("engagement_rate"),
                    timestamp,
                    timestamp,
                ),
            )


    return get_creator_profile(username)

def list_opportunities(
    username: str,
    status: str | None = None,
) -> list[dict]:
    """Return the most-recently-updated opportunity per company for this user."""

    query = """
        SELECT o.*
        FROM opportunities o
        INNER JOIN (
            SELECT lower(company_name) AS norm, MAX(updated_at) AS max_updated
            FROM opportunities
            WHERE user_id = ?
            GROUP BY lower(company_name)
        ) AS latest
          ON lower(o.company_name) = latest.norm
         AND o.updated_at = latest.max_updated
        WHERE o.user_id = ?
    """

    params: list = [username, username]

    if status:
        query += " AND o.status = ?"
        params.append(status)

    query += " ORDER BY o.updated_at DESC"

    with connection() as db:
        rows = db.execute(query, params).fetchall()

    results = []

    for row in rows:
        item = dict(row)

        item["requirements"] = json.loads(
            item["requirements"] or "[]"
        )
        item["source_urls"] = json.loads(
            item["source_urls"] or "[]"
        )
        item["is_explicit_opportunity"] = bool(
            item["is_explicit_opportunity"]
        )

        results.append(item)

    return results


def get_opportunity(
    username: str,
    opportunity_id: int,
) -> dict | None:
    with connection() as db:
        row = db.execute(
            """
            SELECT *
            FROM opportunities
            WHERE id = ? AND user_id = ?
            """,
            (opportunity_id, username),
        ).fetchone()

    if row is None:
        return None

    item = dict(row)

    item["requirements"] = json.loads(
        item["requirements"] or "[]"
    )
    item["source_urls"] = json.loads(
        item["source_urls"] or "[]"
    )
    item["is_explicit_opportunity"] = bool(
        item["is_explicit_opportunity"]
    )

    return item


def delete_opportunity(username: str, opportunity_id: int) -> str | None:
    with connection() as db:
        row = db.execute(
            "SELECT id FROM opportunities WHERE id = ? AND user_id = ?",
            (opportunity_id, username),
        ).fetchone()
        if row is None:
            return None
        active_research = db.execute(
            """
            SELECT 1 FROM brand_research
            WHERE opportunity_id = ? AND user_id = ? AND status = 'IN_PROGRESS'
            LIMIT 1
            """,
            (opportunity_id, username),
        ).fetchone()
        if active_research is not None:
            return "IN_PROGRESS"
        db.execute("DELETE FROM fit_results WHERE opportunity_id = ? AND user_id = ?", (opportunity_id, username))
        db.execute("DELETE FROM brand_research WHERE opportunity_id = ? AND user_id = ?", (opportunity_id, username))
        db.execute("DELETE FROM opportunities WHERE id = ? AND user_id = ?", (opportunity_id, username))
        return "DELETED"


def list_brand_research(
    username: str,
) -> list[dict]:
    """Return the most-recently-updated research record per company for this user."""
    with connection() as db:
        rows = db.execute(
            """
            SELECT br.*
            FROM brand_research br
            INNER JOIN (
                SELECT lower(company_name) AS norm, MAX(updated_at) AS max_updated
                FROM brand_research
                WHERE user_id = ?
                GROUP BY lower(company_name)
            ) AS latest
              ON lower(br.company_name) = latest.norm
             AND br.updated_at = latest.max_updated
            WHERE br.user_id = ?
            ORDER BY br.updated_at DESC
            """,
            (username, username),
        ).fetchall()

    results = []

    json_fields = [
        "products",
        "target_markets",
        "target_customers",
        "recent_activity",
        "creator_partnership_signals",
        "partnership_requirements",
        "why_now",
        "evidence",
        "risks_or_unknowns",
    ]

    for row in rows:
        item = dict(row)

        for field in json_fields:
            item[field] = json.loads(item[field] or "[]")

        results.append(item)

    return results

def list_fit_results(
    username: str,
) -> list[dict]:
    """Return the most-recently-updated fit result per company for this user."""
    with connection() as db:
        rows = db.execute(
            """
            SELECT fr.*
            FROM fit_results fr
            INNER JOIN (
                SELECT lower(company_name) AS norm, MAX(updated_at) AS max_updated
                FROM fit_results
                WHERE user_id = ?
                GROUP BY lower(company_name)
            ) AS latest
              ON lower(fr.company_name) = latest.norm
             AND fr.updated_at = latest.max_updated
            WHERE fr.user_id = ?
            ORDER BY fr.updated_at DESC
            """,
            (username, username),
        ).fetchall()

    results = []

    for row in rows:
        item = dict(row)

        item["strengths"] = json.loads(
            item["strengths"] or "[]"
        )
        item["concerns"] = json.loads(
            item["concerns"] or "[]"
        )

        results.append(item)

    return results

def get_brand_research(
    username: str,
    research_id: int,
) -> Optional[dict]:
    with connection() as db:
        row = db.execute(
            """
            SELECT *
            FROM brand_research
            WHERE id = ? AND user_id = ?
            """,
            (research_id, username),
        ).fetchone()

    if row is None:
        return None

    research = dict(row)

    json_fields = [
        "products",
        "target_markets",
        "target_customers",
        "recent_activity",
        "creator_partnership_signals",
        "partnership_requirements",
        "why_now",
        "evidence",
        "risks_or_unknowns",
    ]

    for field in json_fields:
        research[field] = (
            json.loads(research[field])
            if research[field]
            else []
        )

    return research


def delete_brand_research(username: str, research_id: int) -> str | None:
    with connection() as db:
        row = db.execute(
            "SELECT status FROM brand_research WHERE id = ? AND user_id = ?",
            (research_id, username),
        ).fetchone()
        if row is None:
            return None
        # if row["status"] == "IN_PROGRESS":
        #     return "IN_PROGRESS"
        db.execute("DELETE FROM fit_results WHERE research_id = ? AND user_id = ?", (research_id, username))
        db.execute("DELETE FROM brand_research WHERE id = ? AND user_id = ?", (research_id, username))
        return "DELETED"


def get_fit_result(
    username: str,
    fit_id: int,
) -> Optional[dict]:
    with connection() as db:
        row = db.execute(
            """
            SELECT *
            FROM fit_results
            WHERE id = ? AND user_id = ?
            """,
            (fit_id, username),
        ).fetchone()

    if row is None:
        return None

    fit = dict(row)

    fit["strengths"] = (
        json.loads(fit["strengths"])
        if fit["strengths"]
        else []
    )

    fit["concerns"] = (
        json.loads(fit["concerns"])
        if fit["concerns"]
        else []
    )

    return fit


def delete_fit_result(username: str, fit_id: int) -> bool:
    with connection() as db:
        cursor = db.execute(
            "DELETE FROM fit_results WHERE id = ? AND user_id = ?",
            (fit_id, username),
        )
        return cursor.rowcount > 0

init_db()
