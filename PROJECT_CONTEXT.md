# DealPilot: Technical Context, System Architecture & Product Blueprint

> **Document Classification**: System Architecture, Runtime Specifications & Product Context Document  
> **Target Audience**: Large Language Model (LLM) Tools, AI Coding Agents, Product Consultants, System Architects  
> **Core Framework**: Google Agent Development Kit (ADK) & Google Cloud Vertex AI  
> **Repository**: `dealpilot`  
> **Version**: 1.0 (Production Release)  

---

## 1. Executive Overview & Purpose of This Document

### 1.1 Document Purpose
This document provides an exhaustive, ground-truth technical and product specification of the **DealPilot** platform. It is specifically structured so that:
1. **LLM Tools & Coding Agents** (Claude, Gemini, Cursor, ChatGPT) can ingest this document to immediately understand all internal boundaries, agent hierarchies, schemas, tool contracts, database models, and runtime flows without hallucination.
2. **Product & Strategy Consultants** can instantly grasp what the platform currently accomplishes, evaluate architectural strengths and trade-offs, and recommend targeted product expansions, monetization mechanics, and enterprise rollouts.

### 1.2 What DealPilot Does
DealPilot is an **autonomous commercial copilot and partnership intelligence platform for content creators**. In the creator economy, sponsorships and brand deals represent 70–80% of revenue, but managing them is highly fragmented, manual, and stressful. Creators typically lack talent managers, guess their market rates, spend hours on manual research, and struggle with cold pitch formulation.

DealPilot solves this by orchestrating a multi-agent AI system that:
1. Ingests and maintains a **persistent commercial profile** of the creator (niche, audience size, engagement, geography).
2. Autonomously discovers **verified commercial sponsorship signals** in the market (product launches, brand expansions, marketing hires, active campaigns).
3. Conducts **asynchronous deep brand research** via Model Context Protocol (MCP) live web intelligence.
4. Calculates an **algorithmic 5-dimensional compatibility score** (0–100) with concrete pitch angles.
5. Operates a conversational **Deal Desk** that drafts custom outreach emails, handles counter-offers, and advises on contract terms.

---

## 2. Technical Stack & Resource Matrix

Below is the complete inventory of all technologies, external APIs, cloud services, and runtime libraries powering DealPilot:

| Category | Component / Resource | Version / Provider | Purpose & Responsibility |
| :--- | :--- | :--- | :--- |
| **LLM Inference** | Gemini 3.7 Flash | Google Cloud Vertex AI (`us-central1`) | Primary inference engine for Director Agent, Brand Research Agent, and Fit Evaluation Agent. |
| **LLM Inference** | Gemini 3.6 Flash | Google Cloud Vertex AI (`us-central1`) | High-speed discovery engine for the Opportunity Agent. |
| **Agent Framework** | Google Agent Development Kit (`google-adk`) | `0.1.x` (`google.adk`) | Hierarchical agent orchestration, session state management, tool context injection, context caching. |
| **Web Search MCP** | Parallel Search MCP | `https://search.parallel.ai/mcp` | Real-time web search and markdown fetching (`web_search`, `web_fetch`) for commercial signal discovery. |
| **Deep Research MCP**| Parallel Task MCP | `https://task-mcp.parallel.ai/mcp` | Multi-source asynchronous deep research (`createDeepResearch`, `getStatus`, `getResultMarkdown`). |
| **Backend Framework**| FastAPI & Uvicorn | Python 3.11 / ASGI | REST API gateway, SSE/streaming communication, request validation, dependency injection. |
| **Database (App)** | SQLite 3 | `dealpilot.db` (WAL mode) | Canonical persistence for users, conversations, messages, creator profiles, opportunities, research, fit. |
| **Database (ADK)** | Async SQLite / SQLAlchemy | `sqlite+aiosqlite:///dealpilot.db` | Durable session service (`DatabaseSessionService`) backing ADK conversation turns and user state. |
| **Cloud Storage** | Google Cloud Storage (GCS) | `gs://${PROJECT_ID}-dealpilot-data` | Persistence bridge (`gcs_persistence.py`) syncing SQLite DB on Cloud Run container startup/shutdown. |
| **Authentication** | Google OAuth 2.0 & JWT | `google-auth`, `python-jose`, `passlib` | Google Identity Services token verification, bcrypt password hashing, cryptographically signed JWT sessions. |
| **Frontend UI** | React 18, Vite, TypeScript | React 18.3, Vite 5, TS 5.4 | Single Page Application (SPA), CSS custom properties theme engine, mobile-responsive layout. |
| **Typography** | Google Fonts | `DM Sans`, `Space Grotesk` | Interface typography and visual hierarchy. |
| **Deployment** | Google Cloud Run | Fully managed serverless container | Production hosting (`--memory 2Gi --cpu 2 --min-instances 1`). |
| **Containerization** | Docker Multi-Stage | Node 20 (Build) + Python 3.11-slim (Runtime) | Production artifact packaging. |

---

## 3. High-Level System Architecture & Execution Flow

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                      |
|   React 18 + Vite + TypeScript UI (Mobile & Desktop Responsive)                   |
|   Pages: Overview | Opportunities | Research | Fit | Conversations | Profile      |
+-----------------------------------------+-----------------------------------------+
                                          | HTTPS / REST + SSE
                                          v
+-----------------------------------------------------------------------------------+
|                             FASTAPI GATEWAY LAYER                                 |
|   Endpoints: /auth/*, /agent/sessions, /agent/opportunities, /agent/research, etc. |
|   Middleware: JWT Auth, User-Tenant Isolation, Database Session Injection        |
+--------------------+------------------------------------+-------------------------+
                     |                                    |
                     v                                    v
+------------------------------------+   +------------------------------------------+
|       CANONICAL DATABASE           |   |       GOOGLE ADK ORCHESTRATION           |
|   SQLite (dealpilot.db)            |   |   App: 'dealpilot'                       |
|   - users                          |   |   Context Cache Config: min_tokens=8192  |
|   - conversations & messages       |   |   DatabaseSessionService (Async DB)      |
|   - creator_profiles               |<->|   Runner (Session-Locked Execution)      |
|   - opportunities                  |   +--------------------+---------------------+
|   - brand_research                 |                        |
|   - fit_results                    |                        v
+--------------------+---------------+   +------------------------------------------+
                     |                   |            DIRECTOR AGENT                |
                     |                   |   Model: gemini-3.7-flash                |
                     |                   |   State: user:creator_profile            |
                     |                   +---+----------------+-----------------+---+
                     |                       |                |                 |
                     |         Sub-Agent     |  Sub-Agent     |   Sub-Agent     |
                     |         Delegation    v  Delegation    v   Delegation    v
                     |      +------------------+ +----------------+ +---------------+
                     |      | OPPORTUNITY AGENT| | BRAND RESEARCH | | FIT AGENT     |
                     |      | gemini-3.6-flash | | gemini-3.7-fl. | | gemini-3.7-fl.|
                     |      +--------+---------+ +--------+-------+ +-------+-------+
                     |               |                    |                 |
+--------------------+----+          v                    v                 v
| GCS PERSISTENCE BRIDGE  | +------------------+ +----------------+ +---------------+
| gcs_persistence.py      | | Parallel Search  | | Parallel Task  | | Pure Algorith.|
| Sync on boot / shutdown | | MCP Server       | | MCP Server     | | Fit Engine    |
+-------------------------+ +------------------+ +----------------+ +---------------+
```

---

## 4. Multi-Agent System Deep Dive: Roles, Prompts & Tools

DealPilot uses a **hierarchical multi-agent structure** defined under the Google Agent Development Kit (`google.adk.agents.llm_agent.Agent`).

### 4.1 Master Director Agent (`agent.py`)
- **Model**: `gemini-3.7-flash`
- **Role**: Conversational orchestrator, intent classifier, and synthesizer.
- **Responsibilities**:
  - Understands the creator's conversational intent (finding sponsors, researching a company, evaluating fit, drafting a pitch).
  - Validates that the persistent profile has the 4 required fields (`niche`, `platforms`, `region`, `audience_size`) before triggering discovery.
  - Delegates to specialized sub-agents via wrapped function tools.
  - Maintains zero-leakage conversation memory while keeping the permanent creator profile isolated in `user:creator_profile`.
- **Tools**:
  - `save_creator_profile`: Updates explicit creator profile parameters.
  - Delegated calls to `opportunity_agent`, `brand_research_agent`, and `fit_agent`.

### 4.2 Opportunity Discovery Agent (`opportunity_agent/agent.py`)
- **Model**: `gemini-3.6-flash`
- **Role**: Commercial signal scout.
- **Mission**: Scans live market data to find active brand campaigns, sponsorship drives, product launches, and ambassador programs matching the creator's exact niche and scale.
- **Tools**: Parallel Search MCP (`parallel_tools.py`) providing:
  - `web_search`: Multi-query parallel web search with fast mode and low-latency token-efficient results.
  - `web_fetch`: URL markdown reader for deep extraction when campaign verification is required.
- **Data Contract**:
  - **Input (`OpportunityInput`)**: `creator_niche`, `creator_platform`, `creator_region`, `audience_size`, `audience` (target demographic groups), `average_views`, `search_goal`, `max_opportunities`.
  - **Output (`OpportunityOutput`)**: List of `Opportunity` objects containing:
    - `company_name`, `company_url`
    - `signal_type` (Product Launch, Geographical Expansion, Creator Marketing Hiring, Active Sponsorship, Ambassador Program)
    - `opportunity_description`, `requirements`
    - `is_explicit_opportunity` (Boolean: true if direct creator program confirmed; false if inferred commercial signal)
    - `why_relevant`, `why_now`
    - `confidence` (float 0.0 to 1.0), `confidence_level` (`HIGH`, `MEDIUM`, `LOW`)
    - `source_urls`

### 4.3 Brand Research Agent (`brand_research_agent/agent.py`)
- **Model**: `gemini-3.7-flash`
- **Role**: Deep brand due diligence analyst.
- **Mission**: Deeply investigates **one single company** to extract factual product catalogs, audience demographics, creator partnership footprint, partnership terms, and corporate risks.
- **Tools**: Parallel Task MCP (`parallel_tools_brand.py`) providing live web task execution.
- **Data Contract**:
  - **Input (`BrandResearchInput`)**: `company_name`, `company_url`, `research_context`, `creator_niche`, `creator_platform`, `creator_region`.
  - **Output (`BrandResearchOutput`)**:
    - `company_name`, `official_website`, `summary`
    - `products`: List of core offerings and recent launches
    - `target_markets`: Geographic and sector focus
    - `target_customers`: Buyer personas
    - `recent_activity`: Recent business and marketing initiatives
    - `creator_partnership_signals`: Past creator sponsorships, formats, and affiliate terms
    - `partnership_requirements`: Follower minimums, exclusivity rules, deliverables
    - `why_now`: Commercial timing rationale
    - `evidence`: List of source citations (`title`, `url`, `relevance`)
    - `risks_or_unknowns`: Brand safety warnings, controversies, unverified claims
    - `confidence`: Confidence score (0.0 to 1.0)

### 4.4 Fit Evaluation Agent (`fit_agent/agent.py`)
- **Model**: `gemini-3.7-flash`
- **Role**: Algorithmic partnership compatibility evaluator.
- **Mission**: Evaluates grounded brand research against the creator's persistent profile. **Does NOT browse the web**—operates as a strict analytical engine.
- **Scoring Dimensions (0–100)**:
  1. `audience_fit` (25%): Overlap between brand target personas and creator audience.
  2. `content_fit` (25%): Natural alignment between creator content format and the product.
  3. `market_fit` (20%): Geographic product availability vs. creator audience distribution.
  4. `partnership_fit` (15%): Deliverable feasibility relative to creator scale and commitments.
  5. `timing_fit` (15%): Seasonal and campaign launch alignment.
- **Data Contract**:
  - **Input (`FitInput`)**: `creator` (`CreatorProfile`) + `brand` (`BrandResearchSummary`).
  - **Output (`FitOutput`)**:
    - `overall_score` (0.0 to 100.0)
    - 5 pillar scores (`audience_fit`, `content_fit`, `market_fit`, `partnership_fit`, `timing_fit`)
    - `recommendation`: `STRONG_MATCH` (85+), `GOOD_MATCH` (70–84), `WEAK_MATCH` (50–69), `NOT_RECOMMENDED` (<50)
    - `strengths`: List of competitive advantages
    - `concerns`: List of potential friction points or audience risks
    - `reasoning`: Detailed narrative synthesis and actionable pitch hooks

---

## 5. Database Schema & State Management

The application maintains canonical data in SQLite (`dealpilot.db`), with tables created idempotently on startup (`database.py`):

```sql
-- 1. User Authentication & Accounts
CREATE TABLE users (
    username TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    hashed_password TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 2. Conversations / Sessions
CREATE TABLE conversations (
    session_id TEXT PRIMARY KEY,
    username TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

-- 3. Messages Transcript
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES conversations(session_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- 4. Persistent Creator Profile (Canonical User Identity)
CREATE TABLE creator_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(username) ON DELETE CASCADE,
    creator_name TEXT,
    niche TEXT,
    platforms TEXT,             -- JSON Array: ["YouTube", "Instagram"]
    region TEXT,
    languages TEXT,             -- JSON Array: ["English"]
    audience TEXT,              -- JSON Array: ["Developers", "Students"]
    audience_description TEXT,
    audience_size INTEGER,
    average_views INTEGER,
    engagement_rate REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 5. Discovered Commercial Opportunities
CREATE TABLE opportunities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES conversations(session_id) ON DELETE CASCADE,
    company_name TEXT NOT NULL,
    company_url TEXT,
    signal_type TEXT NOT NULL,
    opportunity_description TEXT NOT NULL,
    requirements TEXT NOT NULL DEFAULT '[]',     -- JSON Array
    is_explicit_opportunity INTEGER NOT NULL DEFAULT 0,
    why_relevant TEXT NOT NULL,
    why_now TEXT,
    confidence REAL NOT NULL,
    confidence_level TEXT NOT NULL,              -- HIGH, MEDIUM, LOW
    source_urls TEXT NOT NULL DEFAULT '[]',      -- JSON Array
    status TEXT NOT NULL DEFAULT 'DISCOVERED',   -- DISCOVERED, RESEARCHED, ARCHIVED
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 6. In-Depth Brand Research
CREATE TABLE brand_research (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES conversations(session_id) ON DELETE CASCADE,
    opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
    company_name TEXT NOT NULL,
    company_url TEXT,
    status TEXT NOT NULL DEFAULT 'COMPLETED',    -- IN_PROGRESS, COMPLETED, FAILED
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

-- 7. Quantitative Fit Evaluations
CREATE TABLE fit_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES conversations(session_id) ON DELETE CASCADE,
    opportunity_id INTEGER REFERENCES opportunities(id) ON DELETE SET NULL,
    research_id INTEGER REFERENCES brand_research(id) ON DELETE SET NULL,
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
```

---

## 6. Complete REST API Specifications

All endpoints under `/agent/*` require a valid JWT Bearer token in the `Authorization` header (`auth/middleware.py:get_current_user`).

| HTTP Method | Route | Request Payload | Response Schema | Functionality |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/google` | `{"credential": "<id_token>"}` | `{"access_token": "...", "token_type": "bearer"}` | Google OAuth 2.0 One-Tap / Identity login. |
| `POST` | `/auth/token` | `OAuth2PasswordRequestForm` | `{"access_token": "...", "token_type": "bearer"}` | Standard username & password login. |
| `GET` | `/agent/profile` | None | `ProfileResponse` | Retrieves the authenticated creator's persistent profile. |
| `PATCH` | `/agent/profile` | `CreatorProfileUpdate` | `ProfileResponse` | Updates profile fields and syncs runtime ADK user state. |
| `POST` | `/agent/sessions` | None | `AgentSession` | Initializes a new conversation session with unguessable UUID. |
| `GET` | `/agent/sessions` | None | `list[ConversationSummary]` | Lists previous conversation sessions belonging to user. |
| `DELETE`| `/agent/sessions/{id}`| None | `204 No Content` | Deletes a conversation session and cascades messages. |
| `POST` | `/agent/sessions/{id}/messages` | `{"message": "..."}` | `AgentResponse` | Sends message to Director Agent; runs agent pipeline. |
| `GET` | `/agent/sessions/{id}/messages` | None | `list[ConversationMessage]` | Fetches chronological message history for session. |
| `GET` | `/agent/opportunities` | None | `list[OpportunityItem]` | Retrieves all discovered commercial opportunities for user. |
| `DELETE`| `/agent/opportunities/{id}`| None | `204 No Content` | Removes opportunity (blocks if research is in-progress). |
| `POST` | `/agent/opportunities/{id}/research` | Query: `session_id?` | `ResearchItem` | Triggers Brand Research Agent on the specific opportunity. |
| `POST` | `/agent/opportunities/{id}/fit` | Query: `session_id?` | `FitItem` | Runs Fit Agent (triggers research first if missing). |
| `GET` | `/agent/research` | None | `list[ResearchItem]` | Lists all completed and in-progress brand research dossiers. |
| `GET` | `/agent/research/{id}` | None | `ResearchItem` | Detailed research brief including products, evidence, and risks. |
| `DELETE`| `/agent/research/{id}` | None | `204 No Content` | Deletes brand research dossier. |
| `POST` | `/agent/research/{id}/fit` | Query: `session_id?` | `FitItem` | Evaluates fit directly from completed research dossier. |
| `GET` | `/agent/fit` | None | `list[FitItem]` | Lists all quantitative match evaluations for user. |
| `GET` | `/agent/fit/{id}` | None | `FitItem` | Retrieves complete fit score breakdown, strengths, and pitch hooks. |
| `DELETE`| `/agent/fit/{id}` | None | `204 No Content` | Deletes fit result record. |

---

## 7. Cloud Infrastructure & State Persistence Strategy

### 7.1 Serverless Deployment on Google Cloud Run
DealPilot is containerized via a multi-stage Docker build and deployed as a serverless container on **Google Cloud Run**:
- Region: `us-central1`
- Configuration: 2 vCPUs, 2 GiB RAM, 300s timeout.
- Concurrency & Scaling: `--min-instances 1 --max-instances 1` keeps instances warm and prevents multi-instance SQLite concurrency contention.

### 7.2 The GCS Cloud Storage Persistence Bridge (`gcs_persistence.py`)
Because Cloud Run containers have an ephemeral local filesystem, DealPilot solves database durability without requiring an expensive managed Cloud SQL instance:
1. **Container Boot / Startup**: `download_db_from_gcs()` checks if `dealpilot.db` exists in the designated GCS bucket (`gs://${PROJECT_ID}-dealpilot-data`). If found, it streams the database to the container before SQLite initializes.
2. **Periodic & Shutdown Sync**: When database mutations occur, or during graceful SIGTERM container shutdown, `upload_db_to_gcs()` uploads the latest SQLite database file back to Google Cloud Storage.

---

## 8. Current System Limitations & Technical Debt

When planning project expansions or assisting with code modifications, LLMs and product consultants should be aware of these current architectural constraints:

1. **Single-Instance SQLite Constraint**: Because SQLite is file-based, Cloud Run is pinned to `--max-instances 1`. For multi-region scale or high concurrency (>500 concurrent active users), the persistence layer must be migrated to **Google Cloud SQL for PostgreSQL** or **Spanner**.
2. **Synchronous HTTP Waiting on Long-Running Research**: Currently, `POST /opportunities/{id}/research` initiates research and awaits the agent response. While timeouts are set to 300s, deep multi-page research can take 15–45 seconds. This should be decoupled into a WebSocket / Server-Sent Events (SSE) or webhook architecture.
3. **Manual Follower & Analytics Entry**: The creator must manually type in their follower count, average views, and engagement rate. There is no automated telemetry pulling from YouTube, Instagram, or TikTok APIs.
4. **Outbound Execution Gap**: While DealPilot generates ready-to-use pitch hooks and email copy, the creator must still copy-paste text into their email client. There is no automated email dispatch.
5. **No Contract Document Ingestion**: Creators cannot currently upload PDF sponsorship contracts for automated legal risk extraction.

---

## 9. Strategic Expansion Roadmap for Product Consultants & LLM Engineering

Below are the priority product tracks where product consultants and AI engineers should focus to scale DealPilot from an intelligence copilot into a full commercial operating system:

```
+-----------------------------------------------------------------------------------+
|                        STRATEGIC EXPANSION ROADMAP                                |
+-----------------------------------------------------------------------------------+
| PHASE 2: IMMEDIATE HORIZON (Months 1-3) - OUTREACH & CLOSING AUTOMATION           |
| - 1. One-Click Pitch Dispatch (Gmail API / SendGrid integration)                  |
| - 2. Automated Smart Email Sequences (Day 3, Day 7 follow-ups with open tracking) |
| - 3. Dynamic Digital Media Kit & Pricing Engine (Live stats + CPM calculator)     |
| - 4. Sponsorship Contract AI Redline Assistant (PDF upload + clause risk scoring) |
| - 5. Brand Decision-Maker Contact Enrichment (Apollo/Hunter API integration)      |
+-----------------------------------------------------------------------------------+
| PHASE 3: MEDIUM HORIZON (Months 4-8) - CREATOR CRM & FINANCIAL OPERATIONS        |
| - 6. Visual Sponsorship Kanban CRM (Scouted -> Pitched -> Contract -> Paid)      |
| - 7. Live Social Telemetry Sync (YouTube Data API, Meta Graph API, TikTok API)    |
| - 8. Integrated Invoicing & Milestone Escrow (Stripe Connect / Wise payout engine)|
| - 9. Peer & Competitor Sponsorship Radar (Alerts when peers sign new sponsors)    |
+-----------------------------------------------------------------------------------+
| PHASE 4: LONG-TERM HORIZON (Months 9-18) - TWO-SIDED NETWORK & MARKETPLACE       |
| - 10. Two-Sided Reverse Brand Brief Marketplace (Brands post briefs directly)     |
| - 11. Anonymized Rate Transparency & Collective Bargaining Index                  |
| - 12. Conversational AI Voice Negotiation Agent (Audio intake & prep calls)       |
| - 13. Automated Post-Campaign Sponsor ROI Deck & Renewal Triggers                 |
+-----------------------------------------------------------------------------------+
```

---

## 10. Guidance for AI Coding Agents & LLMs Working in This Repo

When editing or extending this codebase, adhere to the following invariants:
1. **Never Bypass the Canonical Database**: Always write to `database.py` / `state/business_persistence.py`. ADK runtime user state (`user:creator_profile`) must remain in sync with SQLite.
2. **Preserve Tenant Isolation**: Every query in `database.py` MUST filter by `user_id = ?` or `username = ?`. Never expose cross-user conversation sessions or opportunities.
3. **Structured Agent Outputs**: Sub-agents (`opportunity_agent`, `brand_research_agent`, `fit_agent`) return strict Pydantic models. Do not alter their schema definitions without simultaneously updating `state/business_persistence.py` and `frontend/dealpilot-ui/src/App.tsx`.
4. **Director Orchestration Rules**: The Director Agent does not perform web searches directly; it delegates to specialist agents. Direct research requests must route to `brand_research_agent`, while fit requests must use grounded brand research rather than fabricating corporate information.
5. **No Hardcoded API Keys**: All secrets (`PARALLEL_API_KEY`, `DEALPILOT_JWT_SECRET`, Google Cloud project IDs) must be read from environment variables or `.env`.

---
*End of Technical Context & Architecture Specification.*
