from google.adk.agents.llm_agent import Agent

from typing import Literal

from google.adk.agents.llm_agent import Agent
from pydantic import BaseModel, Field

class CreatorProfile(BaseModel):
    niche: str
    platform: str
    audience_description: str
    audience_region: str

    audience_size: int | None = None
    average_views: int | None = None
    engagement_rate: float | None = None


class BrandResearchSummary(BaseModel):
    company_name: str
    summary: str

    products: list[str] = Field(default_factory=list)
    target_markets: list[str] = Field(default_factory=list)
    target_customers: list[str] = Field(default_factory=list)

    recent_activity: list[str] = Field(default_factory=list)

    creator_partnership_signals: list[str] = Field(
        default_factory=list
    )

    partnership_requirements: list[str] = Field(
        default_factory=list
    )

    why_now: list[str] = Field(
        default_factory=list
    )

    risks_or_unknowns: list[str] = Field(
        default_factory=list
    )


class FitInput(BaseModel):
    creator: CreatorProfile
    brand: BrandResearchSummary


class FitOutput(BaseModel):
    overall_score: float = Field(
        ge=0.0,
        le=100.0,
    )

    audience_fit: float = Field(
        ge=0.0,
        le=100.0,
    )

    content_fit: float = Field(
        ge=0.0,
        le=100.0,
    )

    market_fit: float = Field(
        ge=0.0,
        le=100.0,
    )

    partnership_fit: float = Field(
        ge=0.0,
        le=100.0,
    )

    timing_fit: float = Field(
        ge=0.0,
        le=100.0,
    )

    recommendation: Literal[
        "STRONG_MATCH",
        "GOOD_MATCH",
        "WEAK_MATCH",
        "NOT_RECOMMENDED",
    ]

    strengths: list[str] = Field(
        default_factory=list
    )

    concerns: list[str] = Field(
        default_factory=list
    )

    reasoning: str



FIT_AGENT_INSTRUCTION = """
You are the Fit Agent of DealPilot.

Your responsibility is to evaluate whether a researched company
is a strong sponsorship or partnership fit for a specific content creator.

You receive:
1. A CreatorProfile.
2. A BrandResearchSummary.

Do not perform web research.
Do not call external tools.
Do not discover additional companies.
Do not calculate sponsorship pricing.
Do not write a sponsorship pitch.

Use only the information provided in the input.

## Evaluation Dimensions

Evaluate:

1. Audience Fit
   Does the company's target customer or market overlap with
   the creator's audience?

2. Content Fit
   Does the company's product or service naturally fit the creator's
   niche and content?

3. Market Fit
   Does the creator's geographic audience overlap with the company's
   target markets?

4. Partnership Fit
   Is there evidence that the company works with creators,
   influencers, ambassadors, affiliates, or similar partners?
   Are the apparent requirements compatible with the creator?

5. Timing Fit
   Does the company's current activity provide a timely reason
   to approach them?

## Scoring

Return a score from 0 to 100 for each dimension.

Calculate an overall score based on the dimensions above.

Do not give a high score merely because the company is well known.

Strong evidence of a real partnership opportunity should improve
partnership fit.

A company that merely sells a relevant product without evidence of
creator activity should not automatically receive a high partnership score.

## Recommendation

Use:

90-100 → STRONG_MATCH
75-89  → GOOD_MATCH
50-74  → WEAK_MATCH
0-49   → NOT_RECOMMENDED

Clearly explain:
- strongest reasons to pursue the opportunity
- concerns or mismatches
- what information is missing

Return only the configured FitOutput.
"""

root_agent = Agent(
    model='gemini-3.6-flash',
    name='fit_agent',
    description=(
        "Evaluates whether a researched brand is a strong sponsorship "
        "match for a specific content creator."
    ),
    mode='single_turn',
    input_schema=FitInput,
    output_schema=FitOutput,
    output_key="last_fit_output",
    instruction=FIT_AGENT_INSTRUCTION,
)

