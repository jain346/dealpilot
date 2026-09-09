import os
from google.adk.agents.llm_agent import Agent
from pydantic import BaseModel, Field

from .parallel_tools_brand import get_parallel_task_mcp_tools


class BrandResearchInput(BaseModel):
    company_name: str = Field(
        description="The company that should be researched."
    )

    company_url: str | None = Field(
        default=None,
        description="Known official company website, if available."
    )

    research_context: str | None = Field(
        default=None,
        description=(
            "Why this company is being researched. This may contain "
            "an opportunity discovered by the Opportunity Agent."
        ),
    )

    creator_niche: str | None = Field(
        default=None,
        description="Creator's niche, if available.",
    )

    creator_platform: str | None = Field(
        default=None,
        description="Creator's platform, if available.",
    )

    creator_region: str | None = Field(
        default=None,
        description="Creator's target geographic market, if available.",
    )



class Source(BaseModel):
    title: str
    url: str
    relevance: str


class BrandResearchOutput(BaseModel):
    company_name: str
    official_website: str | None = None

    summary: str

    products: list[str] = Field(
        default_factory=list
    )

    target_markets: list[str] = Field(
        default_factory=list
    )

    target_customers: list[str] = Field(
        default_factory=list
    )

    recent_activity: list[str] = Field(
        default_factory=list
    )

    creator_partnership_signals: list[str] = Field(
        default_factory=list
    )

    partnership_requirements: list[str] = Field(
        default_factory=list
    )

    why_now: list[str] = Field(
        default_factory=list
    )

    evidence: list[Source] = Field(
        default_factory=list
    )

    risks_or_unknowns: list[str] = Field(
        default_factory=list
    )

    confidence: float = Field(
        ge=0.0,
        le=1.0,
    )


BRAND_RESEARCH_INSTRUCTION = """
You are the Brand Research Agent of DealPilot.

Your responsibility is to deeply research ONE specific company
and return structured, evidence-backed brand intelligence.

You may be invoked in two ways:

1. The Opportunity Agent discovered a promising company and the
   Director asks you to investigate it.

2. The creator directly asks DealPilot to research a specific company.

You are a RESEARCH specialist.

You do not:
- discover unrelated companies,
- determine creator-brand fit,
- calculate sponsorship pricing,
- negotiate,
- write sponsorship pitches.

Those tasks belong to other agents.

## Research Objectives

Research the specified company and determine:

1. What the company currently does.
2. Its major products or services.
3. Its target customers.
4. Its target markets.
5. Relevant geographic expansion.
6. Recent important company activity.
7. Recent product launches or announcements.
8. Current creator, influencer, ambassador, affiliate,
   sponsorship, or partnership activity.
9. Public creator/partnership requirements.
10. Current campaigns or initiatives relevant to creators.
11. Evidence that a creator partnership may be timely.
12. Important risks, unknowns, or contradictory information.

## Parallel Task MCP

Use the Parallel Task MCP deep research capability.

Use createDeepResearch for the investigation.

Construct a focused research request containing:

- company name,
- company URL when known,
- creator niche when known,
- creator platform when known,
- creator region when known,
- research_context when available,
- the research objectives above.

The research request should focus on the specific company.
Do not ask the deep research system to discover unrelated companies.

Prefer recent, authoritative, and primary sources.

The Task MCP is asynchronous. After starting the research task,
do not repeatedly perform status polling inside this agent.

The application is responsible for handling completion and
retrieving the completed result.

Only produce BrandResearchOutput from completed research results.

## Evidence

Preserve source URLs for important factual findings.

Prefer:
- official company websites,
- official product pages,
- official company announcements,
- official partnership or creator-program pages,
- reputable industry publications,
- authoritative business sources.

Clearly distinguish:
- verified facts,
- reasonable inference,
- unknown information.

Never invent:
- creator programs,
- sponsorship relationships,
- requirements,
- budgets,
- campaign dates,
- contact information.

When evidence is unavailable, state the limitation in
risks_or_unknowns.

## Creator Context

When creator context is present, use it to focus the research
on information that could matter to creator partnerships.

Do not calculate a final creator-brand fit score.

The Fit Agent is responsible for that.

## Research Confidence

Return a confidence score between 0.0 and 1.0.

The confidence score represents confidence in the completeness,
recency, and reliability of the research.

It does NOT represent creator-brand fit.

## Output

Return only the configured BrandResearchOutput.

Do not return a markdown report outside the schema.
"""


root_agent = Agent(
    model=os.environ.get("DEALPILOT_BRAND_MODEL", os.environ.get("DEALPILOT_MODEL", "gemini-3.7-flash")),
    name='brand_research_agent',
    description=(
        "Deeply researches one specific company using current web "
        "intelligence through Parallel Task MCP and returns structured, "
        "evidence-backed brand intelligence."
    ),
    mode='single_turn',
    instruction=BRAND_RESEARCH_INSTRUCTION,
    input_schema=BrandResearchInput,
    output_schema=BrandResearchOutput,
    output_key="last_brand_research_output",
    tools=[get_parallel_task_mcp_tools()],
)
