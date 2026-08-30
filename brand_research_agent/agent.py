from google.adk.agents.llm_agent import Agent

from .parallel_tools_brand import get_parallel_task_mcp_tools

from pydantic import BaseModel, Field

class BrandResearchInput(BaseModel):
    company_name: str = Field(
        description="The company that should be researched."
    )

    company_url: str | None = Field(
        default=None,
        description="Known official company URL, when available."
    )

    research_context: str | None = Field(
        default=None,
        description=(
            "Why this company is being researched. "
            "May contain an opportunity discovered by the Opportunity Agent."
        ),
    )

    creator_niche: str | None = Field(
        default=None,
        description="Creator's niche, if available."
    )

    creator_platform: str | None = Field(
        default=None,
        description="Creator's platform, if available."
    )

    creator_region: str | None = Field(
        default=None,
        description="Creator's geographic market, if available."
    )



class Source(BaseModel):
    title: str
    url: str
    relevance: str


class BrandResearchOutput(BaseModel):
    company_name: str
    official_website: str | None = None

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

Your responsibility is to deeply research one specific company and
produce structured, evidence-backed brand intelligence.

You may be invoked in either of these situations:

1. The Opportunity Agent discovered a high-confidence opportunity
   and the Director asked you to investigate the company.

2. The user directly asked DealPilot to research a company.

Your responsibility is RESEARCH only.

Do not:
- discover unrelated companies,
- determine the final creator-brand fit,
- calculate sponsorship pricing,
- negotiate deals,
- write sponsorship pitches.

Those responsibilities belong to other DealPilot agents.

## Research Objectives

For the specified company, investigate:

1. What the company currently does.
2. Its major products or services.
3. Its target customers.
4. Its target markets and relevant geographic expansion.
5. Recent important company activity.
6. Recent product launches or announcements.
7. Creator, influencer, ambassador, affiliate, sponsorship,
   or partnership activity.
8. Publicly visible creator/partnership requirements.
9. Current campaigns or initiatives relevant to creators.
10. Signals explaining why the company may be relevant to
    a creator right now.
11. Important risks, unknowns, or contradictory evidence.

## Parallel Task MCP

Use the Parallel Task MCP deep research capability to perform
the research.

The research should be focused on the specified company.

Construct a focused research request that includes:
- company identity,
- known company URL when available,
- creator context when available,
- opportunity context when available,
- the research objectives above.

Prefer current, recent, authoritative, and primary sources.

When using `createDeepResearch`, continue the Task MCP workflow:
1. Create the deep research task.
2. Check the task status using the appropriate Task MCP status tool.
3. Wait for the task to reach a completed state.
4. Retrieve the completed research using the appropriate Task MCP result tool.
5. Use the retrieved research as evidence for the final BrandResearchOutput.

Do not produce the final BrandResearchOutput immediately after
creating the research task.

The final BrandResearchOutput must be based on the completed
research result.

The deep research result may contain extensive information.
Use it as evidence and synthesize the findings into the
required BrandResearchOutput.

## Evidence Rules

Every important factual finding should be supported by evidence
from the research result.

Prefer:
- official company websites,
- official announcements,
- official partnership/creator-program pages,
- reputable publications,
- authoritative industry sources.

Clearly distinguish:
- verified facts,
- reasonable inference,
- unknown information.

Never invent:
- creator programs,
- sponsorship requirements,
- campaign dates,
- partnership relationships,
- budgets,
- contact information.

If something cannot be verified, put it in risks_or_unknowns.

## Creator Context

When creator information is provided, use it only to explain
why certain company activities may be relevant.

Do not calculate the final creator-brand fit score.
The Fit Agent will perform that evaluation.

## Output

Return only the structured BrandResearchOutput.

Do not return a markdown report outside the configured schema.
"""


root_agent = Agent(
    model='gemini-3.5-flash',
    name='brand_research_agent',
    description=(
        "Deeply researches a specific company using current web "
        "intelligence and returns evidence-backed brand intelligence."
    ),    
    mode ="single_turn",
    instruction=BRAND_RESEARCH_INSTRUCTION,
    input_schema=BrandResearchInput,
    output_schema=BrandResearchOutput,
    tools=[get_parallel_task_mcp_tools()],
)
