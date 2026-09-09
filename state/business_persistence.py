from __future__ import annotations

import json

from database import connection, now


def save_opportunity_output(
    username: str,
    session_id: str,
    output: dict,
) -> list[int]:
    """Upsert opportunities keyed by (user_id, company_name).

    If an opportunity for the same user and company already exists, its content
    fields and updated_at are refreshed while created_at is preserved.  The
    canonical session_id is updated to the most recent session so that workflow
    references remain valid.
    """
    opportunity_ids: list[int] = []

    for opportunity in output.get("opportunities", []):
        company_name = opportunity["company_name"].strip()
        signal_type  = opportunity["signal_type"].strip()
        description  = opportunity["opportunity_description"].strip()

        with connection() as db:
            existing = db.execute(
                """
                SELECT id FROM opportunities
                WHERE user_id = ? AND lower(company_name) = lower(?)
                ORDER BY updated_at DESC
                LIMIT 1
                """,
                (username, company_name),
            ).fetchone()

            if existing:
                # Update content; preserve created_at.
                db.execute(
                    """
                    UPDATE opportunities SET
                        session_id              = ?,
                        company_url             = ?,
                        signal_type             = ?,
                        opportunity_description = ?,
                        requirements            = ?,
                        is_explicit_opportunity = ?,
                        why_relevant            = ?,
                        why_now                 = ?,
                        confidence              = ?,
                        confidence_level        = ?,
                        source_urls             = ?,
                        updated_at              = ?
                    WHERE id = ?
                    """,
                    (
                        session_id,
                        opportunity.get("company_url"),
                        signal_type,
                        description,
                        json.dumps(opportunity.get("requirements", [])),
                        int(opportunity.get("is_explicit_opportunity", False)),
                        opportunity["why_relevant"],
                        opportunity.get("why_now"),
                        opportunity["confidence"],
                        opportunity["confidence_level"],
                        json.dumps(opportunity.get("source_urls", [])),
                        now(),
                        existing["id"],
                    ),
                )
                opportunity_ids.append(existing["id"])
                continue

            # New company — insert.
            cursor = db.execute(
                """
                INSERT INTO opportunities (
                    user_id,
                    session_id,
                    company_name,
                    company_url,
                    signal_type,
                    opportunity_description,
                    requirements,
                    is_explicit_opportunity,
                    why_relevant,
                    why_now,
                    confidence,
                    confidence_level,
                    source_urls,
                    status,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    username,
                    session_id,
                    company_name,
                    opportunity.get("company_url"),
                    signal_type,
                    description,
                    json.dumps(opportunity.get("requirements", [])),
                    int(opportunity.get("is_explicit_opportunity", False)),
                    opportunity["why_relevant"],
                    opportunity.get("why_now"),
                    opportunity["confidence"],
                    opportunity["confidence_level"],
                    json.dumps(opportunity.get("source_urls", [])),
                    "DISCOVERED",
                    now(),
                    now(),
                ),
            )
            opportunity_ids.append(cursor.lastrowid)

    return opportunity_ids


def save_brand_research_output(
    username: str,
    session_id: str,
    output: dict,
    opportunity_id: int | None = None,
) -> int:
    with connection() as db:
        if opportunity_id is not None:
            existing = db.execute(
                "SELECT id FROM brand_research WHERE user_id = ? AND opportunity_id = ?",
                (username, opportunity_id),
            ).fetchone()
        else:
            existing = db.execute(
                """
                SELECT id FROM brand_research
                WHERE user_id = ? AND opportunity_id IS NULL
                  AND lower(company_name) = lower(?)
                """,
                (username, output["company_name"].strip()),
            ).fetchone()

        values = (
            output["company_name"].strip(),
            output.get("official_website"),
            "COMPLETED",
            output.get("summary"),
            json.dumps(output.get("products", [])),
            json.dumps(output.get("target_markets", [])),
            json.dumps(output.get("target_customers", [])),
            json.dumps(output.get("recent_activity", [])),
            json.dumps(output.get("creator_partnership_signals", [])),
            json.dumps(output.get("partnership_requirements", [])),
            json.dumps(output.get("why_now", [])),
            json.dumps(output.get("evidence", [])),
            json.dumps(output.get("risks_or_unknowns", [])),
            output.get("confidence"),
            now(),
        )
        if existing:
            db.execute(
                """
                UPDATE brand_research SET company_name = ?, company_url = ?,
                    status = ?, summary = ?, products = ?, target_markets = ?,
                    target_customers = ?, recent_activity = ?,
                    creator_partnership_signals = ?, partnership_requirements = ?,
                    why_now = ?, evidence = ?, risks_or_unknowns = ?,
                    confidence = ?, updated_at = ?
                WHERE id = ?
                """,
                (*values, existing["id"]),
            )
            return existing["id"]

        cursor = db.execute(
            """
            INSERT INTO brand_research (
                user_id,
                session_id,
                opportunity_id,
                company_name,
                company_url,
                status,
                summary,
                products,
                target_markets,
                target_customers,
                recent_activity,
                creator_partnership_signals,
                partnership_requirements,
                why_now,
                evidence,
                risks_or_unknowns,
                confidence,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                session_id,
                opportunity_id,
                output["company_name"].strip(),
                output.get("official_website"),
                "COMPLETED",
                output.get("summary"),
                json.dumps(output.get("products", [])),
                json.dumps(output.get("target_markets", [])),
                json.dumps(output.get("target_customers", [])),
                json.dumps(output.get("recent_activity", [])),
                json.dumps(output.get("creator_partnership_signals", [])),
                json.dumps(output.get("partnership_requirements", [])),
                json.dumps(output.get("why_now", [])),
                json.dumps(output.get("evidence", [])),
                json.dumps(output.get("risks_or_unknowns", [])),
                output.get("confidence"),
                now(),
                now(),
            ),
        )

        return cursor.lastrowid


def save_brand_research_job(
    username: str,
    session_id: str,
    company_name: str,
    company_url: str | None,
    opportunity_id: int | None = None,
) -> int:
    """Persist a queued Parallel Task research job for later completion."""
    with connection() as db:
        if opportunity_id is not None:
            existing = db.execute(
                "SELECT id FROM brand_research WHERE user_id = ? AND opportunity_id = ?",
                (username, opportunity_id),
            ).fetchone()
        else:
            existing = db.execute(
                """
                SELECT id FROM brand_research
                WHERE user_id = ? AND opportunity_id IS NULL
                  AND lower(company_name) = lower(?)
                """,
                (username, company_name.strip()),
            ).fetchone()
        if existing:
            return existing["id"]
        cursor = db.execute(
            """
            INSERT INTO brand_research (
                user_id, session_id, opportunity_id, company_name, company_url,
                status, products, target_markets,
                target_customers, recent_activity, creator_partnership_signals,
                partnership_requirements, why_now, evidence, risks_or_unknowns,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', '[]', ?, ?)
            """,
            (
                username,
                session_id,
                opportunity_id,
                company_name.strip(),
                company_url,
                "IN_PROGRESS",
                now(),
                now(),
            ),
        )
        return cursor.lastrowid


def save_fit_output(
    username: str,
    session_id: str,
    output: dict,
    opportunity_id: int | None = None,
    research_id: int | None = None,
) -> int:
    """Upsert fit results keyed by (user_id, company_name).

    If a fit result for the same user and company already exists, its scores
    and qualitative fields are updated along with updated_at; created_at is
    preserved.  opportunity_id / research_id are updated to the latest run's
    values so the cross-references stay fresh.
    """
    company_name = output["company_name"].strip()

    with connection() as db:
        existing = db.execute(
            """
            SELECT id FROM fit_results
            WHERE user_id = ? AND lower(company_name) = lower(?)
            ORDER BY updated_at DESC
            LIMIT 1
            """,
            (username, company_name),
        ).fetchone()

        if existing:
            # Update all score and qualitative fields; preserve created_at.
            db.execute(
                """
                UPDATE fit_results SET
                    session_id      = ?,
                    opportunity_id  = ?,
                    research_id     = ?,
                    overall_score   = ?,
                    audience_fit    = ?,
                    content_fit     = ?,
                    market_fit      = ?,
                    partnership_fit = ?,
                    timing_fit      = ?,
                    recommendation  = ?,
                    strengths       = ?,
                    concerns        = ?,
                    reasoning       = ?,
                    updated_at      = ?
                WHERE id = ?
                """,
                (
                    session_id,
                    opportunity_id,
                    research_id,
                    output["overall_score"],
                    output["audience_fit"],
                    output["content_fit"],
                    output["market_fit"],
                    output["partnership_fit"],
                    output["timing_fit"],
                    output["recommendation"],
                    json.dumps(output.get("strengths", [])),
                    json.dumps(output.get("concerns", [])),
                    output["reasoning"],
                    now(),
                    existing["id"],
                ),
            )
            return existing["id"]

        # New company — insert.
        cursor = db.execute(
            """
            INSERT INTO fit_results (
                user_id,
                session_id,
                opportunity_id,
                research_id,
                company_name,
                overall_score,
                audience_fit,
                content_fit,
                market_fit,
                partnership_fit,
                timing_fit,
                recommendation,
                strengths,
                concerns,
                reasoning,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                session_id,
                opportunity_id,
                research_id,
                company_name,
                output["overall_score"],
                output["audience_fit"],
                output["content_fit"],
                output["market_fit"],
                output["partnership_fit"],
                output["timing_fit"],
                output["recommendation"],
                json.dumps(output.get("strengths", [])),
                json.dumps(output.get("concerns", [])),
                output["reasoning"],
                now(),
                now(),
            ),
        )
        return cursor.lastrowid


