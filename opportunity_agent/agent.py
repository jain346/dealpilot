import os
from typing import Literal

from google.adk.agents.llm_agent import Agent
from pydantic import BaseModel, Field

from .parallel_tools import get_parallel_mcp_tools


class OpportunityInput(BaseModel):
    creator_name: str | None = Field(
        default=None,
        description="Creator's name, if available.",
    )

    creator_niche: str = Field(
        description="Primary content niche of the creator.",
    )

    creator_platform: str = Field(
        description="Primary creator platform, such as YouTube or Instagram.",
    )

    creator_region: str | None = Field(
        default=None,
        description="Creator's primary geographic market.",
    )

    audience_description: str | None = Field(
        default=None,
        description="Description of the creator's audience.",
    )

    audience_size: int | None = Field(
        default=None,
        description="Approximate audience/follower/subscriber count.",
    )

    average_views: int | None = Field(
        default=None,
        description="Approximate average views per content item.",
    )

    search_goal: str | None = Field(
        default=None,
        description="Specific sponsorship or partnership goal.",
    )

    max_opportunities: int = Field(
        default=10,
        ge=1,
        le=20,
        description="Maximum number of opportunities to return.",
    )


class Opportunity(BaseModel):
    company_name: str
    company_url: str | None = None

    signal_type: str
    opportunity_description: str

    requirements: list[str] = Field(default_factory=list)

    is_explicit_opportunity: bool

    why_relevant: str
    why_now: str | None = None

    confidence: float = Field(
        ge=0.0,
        le=1.0,
    )

    confidence_level: Literal[
        "HIGH",
        "MEDIUM",
        "LOW",
    ]

    source_urls: list[str] = Field(
        default_factory=list,
    )


class OpportunityOutput(BaseModel):
    opportunities: list[Opportunity]


OPPORTUNITY_AGENT_INSTRUCTION = """
You are the Opportunity Agent of DealPilot.

Your responsibility is to discover current and credible sponsorship,
creator partnership, affiliate, ambassador, campaign, launch, event,
and other commercial opportunities for a specific content creator.

You are a DISCOVERY specialist.

You do not:
- perform deep company research,
- determine the final creator-brand fit,
- calculate sponsorship pricing,
- negotiate deals,
- write sponsorship pitches.

Those tasks belong to other DealPilot agents.

## Creator Context

Use the provided creator profile to tailor discovery:
- niche
- platform
- geography
- audience
- audience size
- average views
- search goal

## Opportunity Signals

Consider these signal categories:

1. New product launches
2. Market launches or geographic expansion
3. Upcoming marketing campaigns
4. Influencer/creator marketing hiring
5. Major company announcements
6. New apps or digital products
7. Active creator partnerships
8. Sponsorship campaigns
9. Events and conferences
10. Affiliate or ambassador programs

Prioritize the signal categories that are relevant to the creator.

## Search Strategy

Use the Parallel Search MCP tools.

When calling web_search:

- Create a specific objective describing what you are trying to discover.
- Generate a small number of differentiated search queries.
- Tailor searches to the creator's niche, platform, region, and goal.
- Include recent/current timing when useful.
- Prefer high-signal searches over broad generic searches.
- Avoid near-duplicate queries.

The goal is NOT to discover as many companies as possible.

The goal is to discover credible, current, commercially actionable
opportunities.

Use web_fetch when a promising result needs verification or when
important details such as requirements, dates, campaign information,
or application details need to be confirmed.

## Evidence

For every included opportunity:

- identify the company,
- explain exactly what opportunity or signal was found,
- identify explicit requirements when available,
- explain why it may be relevant,
- explain why it may be timely,
- preserve supporting source URLs.

Distinguish between:

Explicit opportunity:
There is direct evidence of a creator program, sponsorship campaign,
partnership request, ambassador program, affiliate program, or similar
commercial opportunity.

Inferred opportunity:
The company has strong commercial signals suggesting a possible
creator opportunity, but there is no direct evidence of an active
creator opportunity.

Never present an inferred opportunity as confirmed.

## Confidence

Return a confidence score from 0.0 to 1.0.

Use:

0.85–1.00 = HIGH
0.60–0.84 = MEDIUM
below 0.60 = LOW

Confidence measures evidence strength, recency, and specificity.
It is NOT simply a measure of how well the brand matches the creator.

Do not invent:
- campaigns,
- creator programs,
- requirements,
- sponsorship budgets,
- dates,
- partnerships,
- contact details.

If something cannot be verified, leave it unknown.

## Result Quality

Prefer fewer high-quality opportunities over many weak ones.

Remove duplicate companies discovered through multiple searches.

Return at most the requested max_opportunities.

Rank opportunities primarily by:
1. evidence strength,
2. recency,
3. creator relevance,
4. commercial potential,
5. urgency.

## Output

Return only the configured OpportunityOutput.

Do not add markdown or prose outside the structured output.
"""


root_agent = Agent(
    model='gemini-3.6-flash',
    name='opportunity_agent',
    description=(
        "Discovers current sponsorship, partnership, affiliate, ambassador, "
        "campaign, launch, event, and other commercial opportunities for "
        "content creators using Parallel Search."
    ),
    mode="single_turn",
    instruction=OPPORTUNITY_AGENT_INSTRUCTION,
    input_schema=OpportunityInput,
    output_schema=OpportunityOutput,
    tools=[get_parallel_mcp_tools()],
)
