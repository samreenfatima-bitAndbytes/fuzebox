# Fuzebox Frontend (Next.js)

Next.js dashboard for the Fuzebox agent performance platform.

## Design system (Phase 0)

- **Tokens:** `src/app/globals.css` (`:root` / `.dark`) — all legacy `--brand-*` and alert/chart variables are kept
- **Catalog:** `src/lib/design-tokens.ts` — token names and `cssVar()` helper
- **Typography:** system font stack by default (`src/lib/fonts.ts` — no Google Fonts at build). Optional offline Inter: `npm install @fontsource/inter @fontsource/jetbrains-mono` and wire imports in `fonts.ts`
- **Tailwind:** `tailwind.config.ts` maps spacing, radius, shadows, and `font-sans` / `font-mono` to CSS variables
- **Utilities:** `.fb-btn-primary`, `.fb-text-*`, `.fb-focus-ring` — optional; existing `.fb-*` classes unchanged in name and behavior

## Shared UI (Phase 3)

- **Components:** `src/components/ui/` — `EmptyState`, `KpiCard`, `DataTable`, `Modal`, `Alert`, `StatusBadge`, `PageToolbar`, `DownloadCsvButton`, `FormField`, `FilterChipGroup`, `ChartPanel`
- **Select:** nav-accent for selected options; trigger uses `fb-input` styles
- **Charts / tables:** unified empty states; KPI grids; agents & scorecard tables use `DataTable`

## Page polish (Phase 4)

- **Layout primitives:** `PageTabs`, `PageTabPanel`, `PageSection`, `ChartPanel`, `PageLoading`, `PageEmpty` (`src/components/ui/`)
- **Pattern:** `PageToolbar` filters → loading/error → tabbed `fb-card` with segmented `PageTabs` (matches Overview)
- **Applied:** all dashboard routes — Overview, Performance, Economics, Agents, Agent Roster, Agent Compare, Tasks, Observation Plane, Quality, Traces, Run Review, Scenario Builder, V2 Mission Control, plus `/agents/new` and `/agents/[id]/edit`
- **Forms:** `FormField` / `FormTextarea`; `AgentForm` uses `PageSection`, `fb-card`, nav-accent chips
- **View components:** Observation/Trace/Quality/Agent tables → `DataTable`; filters → `FilterChipGroup`; charts → `ChartPanel` on Performance & Economics
- **Studio flows:** `components/studio/StudioLayout.tsx` — shared tabs/KPIs/steps table for Training Studio modal & V2 Mission Control; Run Review & Scenario Builder aligned

## App shell (Phase 2)

- **Sidebar:** nav accent tokens, `aria-current="page"`, collapsible rail, mobile drawer + Escape
- **Header:** top bar (status + Refresh/Options) + page title row with grouped operator actions
- **Banners:** pending-run and demo-seed styling aligned to tokens

## Auth UI (Phase 1)

- **Route:** `/login` — split layout (`AuthLayout`), segmented tabs, `SignInForm` / `RegisterForm`
- **Components:** `src/components/auth/*` — shared fields, errors, and `fb-btn-primary` / `fb-input` tokens

**Migrated:** full dashboard — all sidebar pages on Next.js. Global **Generate request** and **Load demo data** in the page header (operator+).

**Theme:** navy → blue → teal palette via `globals.css` tokens (`--accent-gradient`, `--page-title-color`, colored page headers, gradient primary buttons, tinted inputs). Auth/login uses the same system.

## Prerequisites

- Docker stack running (`docker compose up`) — Next.js on **3000**, API on **8000**
- Node.js 20+

## Setup

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open **http://localhost:3000**

- Login: `admin` / `changeme` (from `.env` in project root), or **Create account** tab → `POST /auth/register`
- All sidebar pages are on Next.js (`/overview`, `/agents`, `/scenario-builder`, etc.)
- **Generate request** shows a shell banner while the pipeline saves; polls `/status/{request_id}` every 5s
- **Economics** / **Performance** leaderboard tab: CSV download buttons available

## API (FastAPI)

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /auth/token` | Public | Login |
| `GET /api/auth/me` | Bearer | Session check |
| `GET /api/agents` | Bearer | Agent registry list |
| `GET /api/agents/dependencies?days=30` | Bearer | Process chains, shared resources, dependency risks |
| `GET /api/six-sigma/correlations?days=7` | Bearer | Six Sigma correlation KPIs + COR rows |
| `GET /api/economic-cognition/uop-library?manual_cost=75` | Bearer | UoP Library KPIs + published entries |
| `GET /api/agents/{id}` | Bearer | Agent detail (edit form) |
| `POST /api/agents` | Operator+ | Create agent |
| `PUT /api/agents/{id}` | Operator+ | Update agent |
| `DELETE /api/agents/{id}` | Operator+ | Delete agent |
| `GET /api/quality/summary?days=30` | Bearer | Quality KPIs + task log |
| `GET /api/observation/screening?days=30` | Bearer | AI screening histogram, HITL, skills (ECL proxy or local) |
| `GET /api/governance/reviews?days=30` | Bearer | Team review queue (ECL proxy or canonical events) |
| `GET /api/governance/performance?days=30` | Bearer | Reviewer performance stats |
| `GET /api/observation/registry?days=30` | Bearer | Quality agent registry + run stats (ECL proxy or local) |
| `GET /api/observation/outreach?days=30` | Bearer | Outreach QA drafts + KPIs (ECL proxy or local) |
| `GET /api/observation-plane/summary?days=30` | Bearer | Observation Plane KPIs + tables |
| `GET /api/tasks/scorecards?days=7&group=All` | Bearer | Task scorecards + by-type breakdown |
| `GET /api/performance/summary?days=7` | Bearer | Performance charts + leaderboard |
| `GET /api/economics/summary?days=7&manual_cost=50` | Bearer | Economics ROI, costs, tokens, workflows |
| `GET /api/overview/summary?days=7` | Bearer | Dashboard overview KPIs + charts |
| `GET /api/traces?limit=50` | Bearer | Recent trace IDs |
| `GET /api/traces/{trace_id}` | Bearer | Trace KPIs, timeline offsets, span table |
| `GET /api/run-review/summary` | Bearer | Pipeline runs + agent telemetry |
| `GET /api/run-review/workflows/{id}` | Bearer | Training studio (summary, steps, tune defaults, compare) |
| `POST /v2/tune` | Bearer | Save V2 tuning parameters |
| `POST /v2/rerun` | Bearer | Re-run pipeline with tuned params |
| `GET /status/{request_id}` | Bearer | Poll training cycle progress |
| `GET /api/scenarios` | Bearer | Scenario library list |
| `GET /api/scenarios/{id}` | Bearer | Scenario detail (load into builder) |
| `POST /api/scenarios` | Operator+ | Create scenario |
| `PUT /api/scenarios/{id}` | Operator+ | Update scenario |
| `PATCH /api/scenarios/{id}/status` | Operator+ | Change scenario status |
| `PATCH /api/scenarios/{id}/cost` | Operator+ | Quick-edit cost model |
| `DELETE /api/scenarios/{id}` | Operator+ | Delete scenario |
| `GET /api/agents/matrices/skills` | Bearer | Skills matrix |
| `GET /api/agents/matrices/permissions` | Bearer | Permissions matrix |
| `GET /api/agents/violations` | Bearer | Policy violations |
| `POST /webhook` | Bearer | Generate request (pipeline) |
| `POST /api/admin/seed-demo` | Operator+ | Bulk demo dataset |

After changing `webhook_server.py`, restart the webhook container (or rely on `WEBHOOK_RELOAD=true` in `docker-compose.yml`):

```bash
docker restart fuzebox-webhook-v2
```

If pages show **"Not Found"** for Scenario Builder, Run Review, or Traces, the API on port 8000 is almost always running old code — restart as above, then hard-refresh the browser.

### Build fails with `EACCES` on `.next`

The cache was created as **root** (e.g. `sudo npm run dev` or a root-owned process). Stop the dev server, then:

```bash
cd frontend
sudo rm -rf .next
npm run build
```

Run **`npm run dev` as your normal user**, not with sudo. `npm run prebuild` checks cache permissions before building.
