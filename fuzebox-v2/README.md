# Fuzebox — AI Agent Performance Platform

A production-ready multi-agent orchestration platform with a **Next.js** performance dashboard, webhook integration, JWT authentication, and Docker deployment.

## What It Does

- **Agent Registry** — create and manage AI agents from the UI, no code changes needed
- **Scenario Builder** — define workflows with multi-step pipelines, assign agents to each step
- **Webhook Server** — receive requests from any external system (Slack, Zapier, CrewAI, curl, etc.)
- **Auto-routing** — triage classifies incoming requests and routes them to the right scenario automatically
- **Workflow Orchestrator** — executes pipeline steps sequentially, tracks every task end to end
- **Performance Dashboard** — live metrics, cost tracking, agent scorecards, workflow traces (Next.js)
- **JWT Authentication** — token-based auth with role management (admin / operator / readonly)
- **Docker deployment** — one command to run the stack

---

## Project Structure

```
fuzebox-v2/
├── frontend/                # Next.js dashboard (primary UI, :3000)
├── agents/                  # Worker, triage, orchestrator
├── src/
│   ├── auth.py              # JWT authentication, user management
│   └── dashboard/           # Python data layer (API + orchestration)
├── webhook_server.py        # FastAPI API + webhook
├── docker-compose.yml
└── .env                     # Secrets (never commit)
```

---

## Quick Start (Docker — recommended)

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — at minimum set `CLAUDE_API_KEY` and `JWT_SECRET`. Generate a secret:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 2. Start the stack

```bash
docker compose up --build
```

### 3. Open the dashboard

| Service        | URL                         | Description                    |
|----------------|-----------------------------|--------------------------------|
| **Dashboard**  | http://localhost:3000       | Next.js UI (login required)    |
| **API**        | http://localhost:8000       | FastAPI webhook server         |
| **API docs**   | http://localhost:8000/docs  | Swagger UI                     |

Default login: `admin` / `changeme` (from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env` on first run).

Use **Load demo data** in the header to populate agents, workflows, and traces.

### Stop

```bash
docker compose down
```

---

## Quick Start (local dev)

### Backend

```bash
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set DATABASE_URL, CLAUDE_API_KEY, JWT_SECRET, etc.

python webhook_server.py   # http://localhost:8000
```

### Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` in `frontend/.env.local` must point at the webhook server (default `http://localhost:8000`).

See [frontend/README.md](frontend/README.md) for routes, API table, and troubleshooting.

---

## Deep links (not in sidebar)

| URL | Purpose |
|-----|---------|
| `/v2-mission-control` | Split-screen operator tuning |
| `/v2-mission-control?wf=<workflow_id>` | Pre-select a run |
| `/scenario-builder?agent=<id>` | Open Scenario Builder → Agents tab with that agent highlighted |
| `/agent-roster` | Trust-tier agent roster (Patent Family 5) |
| `/agent-compare` | Side-by-side agent A/B comparison |
| `/agent-compare?a=<id>&b=<id>` | Pre-select comparison pair |
| `/agent-dependencies` | Agent dependencies, data flow, shared resources, cascade risks |
| `/six-sigma/correlations` | Six Sigma correlation engine (COR-001..003 from task telemetry) |
| `/economic-cognition/uop-library` | UoP Library — published Units of Production catalogue |
| `/cognition-plane` | Redirects to `/six-sigma/correlations` |

---

## Creating Agents & Workflows

1. **Agents** — `/agents` or Scenario Builder → tab 1 (links to registry)
2. **Scenario** — `/scenario-builder`: team → pipeline → cost → save
3. **Run pipeline** — header **Generate request**, or `POST /webhook`

---

## Webhook Integration

### Authentication

```bash
curl -X POST http://localhost:8000/auth/token \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "changeme"}'
```

### Submit a request

```bash
curl -X POST http://localhost:8000/webhook \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "I was charged twice this month", "source": "slack"}'
```

### Request payload

```json
{
  "text":        "The request or message to process",
  "source":      "slack | zapier | crewai | manual | etc.",
  "customer_id": "optional customer identifier",
  "scenario_id": "optional — force a specific scenario",
  "metadata":    {}
}
```

### Key endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /auth/token | Public | Login |
| POST | /webhook | Operator+ | Run pipeline |
| GET | /status/{request_id} | Bearer | Poll run completion |
| GET | /api/* | Bearer | Dashboard data (agents, economics, traces, …) |
| POST | /api/admin/seed-demo | Operator+ | Load demo dataset |

Full list: [frontend/README.md](frontend/README.md) or http://localhost:8000/docs

---

## User Management

Users live in the database. First startup creates admin from `.env`.

| Role | Webhook | Dashboard | Manage users |
|------|---------|-----------|--------------|
| admin | Yes | Yes | Yes (API only) |
| operator | Yes | Yes | No |
| readonly | No | Yes | No |

There is no users admin page in the UI yet — use the `/users` API (admin token required).

---

## Running Agents Manually

```bash
python run_agents.py
python run_agents.py --scenario <scenario_id> --input "Customer request text"
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Dashboard | **Next.js 15** (React, Tailwind) |
| API | FastAPI + Uvicorn |
| AI agents | Anthropic Claude (Haiku) |
| Database | PostgreSQL (Docker) / SQLite (local) |
| Auth | JWT + bcrypt |
| Deployment | Docker Compose |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| DATABASE_URL | Yes* | — | PostgreSQL URL (Docker sets this) |
| CLAUDE_API_KEY | Yes | — | Anthropic API key |
| JWT_SECRET | Yes | — | JWT signing secret |
| JWT_EXPIRE_HOURS | No | 24 | Token lifetime |
| ADMIN_USERNAME | No | admin | Bootstrap admin |
| ADMIN_PASSWORD | No | changeme | Bootstrap password |
| NEXT_PUBLIC_API_URL | Frontend | http://localhost:8000 | Browser → API (set at build in Docker) |

\* See `.env.example` for local vs Docker `DATABASE_URL` values.

---

## Operations

- After changing `webhook_server.py`: `docker restart fuzebox-webhook-v2` (or use `WEBHOOK_RELOAD=true` in compose).
- Rebuild frontend after UI changes: `docker compose up --build frontend`.
- Single-container image (`Dockerfile` + `start.sh` + nginx) still exists for all-in-one deploys; default compose uses separate services with **:3000** as the dashboard entry.
