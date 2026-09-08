from __future__ import annotations

import json

from database import connection, now


def save_opportunity_output(
    username: str,
    session_id: str,
    output: dict,
) -> list[int]:
    opportunity_ids: list[int] = []

    for opportunity in output.get("opportunities", []):
        with connection() as db:
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
                    opportunity["company_name"],
                    opportunity.get("company_url"),
                    opportunity["signal_type"],
                    opportunity["opportunity_description"],
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
                output["company_name"],
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


def save_fit_output(
    username: str,
    session_id: str,
    output: dict,
    opportunity_id: int | None = None,
    research_id: int | None = None,
) -> int:
    with connection() as db:
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
                output["company_name"],
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


