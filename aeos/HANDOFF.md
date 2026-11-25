# r-Potential — Economic Cognition Dashboard

A FuzeBox AEOS dashboard for monitoring AI agent fleets across enterprise processes (Sports Betting, Auto Insurance Claims, Commercial Lending, Dealer Service, Player Loyalty, AML/KYC, Resort Ops).

## Stack

- **Frontend:** React 18 + Vite 7 + TypeScript + Tailwind CSS v3 + shadcn/ui + wouter (hash routing)
- **Backend:** Express + better-sqlite3 + Drizzle ORM
- **Charts:** Pure inline SVG (no chart library dependency)
- **Hosting:** Static frontend bundle + Express server on a single port (5000)

## Quick start

```bash
npm install
npm run dev          # dev server on http://localhost:5000
```

## Production build

```bash
npm run build                              # outputs dist/public + dist/index.cjs
NODE_ENV=production node dist/index.cjs    # serves both static + api on :5000
```

## Project layout

```
client/src/
├── App.tsx                    # all hash routes
├── components/
│   ├── Layout.tsx             # sidebar, top bar, scroll architecture
│   ├── KpiCard.tsx            # 6-tone KPI card
│   ├── Pill.tsx               # 7-tone pill + StatusDot + SigmaBadge
│   ├── SectionCard.tsx        # bordered section with kicker/title/action
│   ├── Logo.tsx
│   └── ui/                    # shadcn primitives
├── lib/
│   ├── personas.ts            # SHARED data — 7 PROCESSES, 15 AGENTS, 7 REVIEWERS
│   ├── format.ts              # usd, num, pct, sigma, ago helpers
│   ├── queryClient.ts
│   └── utils.ts
└── pages/
    ├── Dashboard.tsx          # HOME
    ├── LiveMonitor.tsx
    ├── AgentRoster.tsx        # MY AI AGENTS
    ├── AgentCompare.tsx       # A/B compare with hexagonal radar
    ├── Dependencies.tsx       # per-process pipelines + shared resources
    ├── FinancialImpact.tsx    # INSIGHTS
    ├── FiveEquations.tsx
    ├── Scenarios.tsx
    ├── AIMaturity.tsx         # 5-level pentagon radar
    ├── BuildVsBuy.tsx         # weighted matrix
    ├── Correlations.tsx       # SIX SIGMA
    ├── CognitionPlane.tsx     # ECONOMIC COGNITION
    ├── ObservationPlane.tsx
    ├── PredictiveLedger.tsx
    ├── CoverageManifest.tsx
    ├── Recommendations.tsx
    ├── UoPLibrary.tsx
    ├── Audit.tsx              # GOVERNANCE — Human Oversight Audit Log
    ├── RiskAnalysis.tsx       # FMEA Register with S/O/D/RPN heatmap
    ├── DeployAgentCode.tsx
    ├── Oversight.tsx          # Unreviewed Decisions
    ├── Rules.tsx              # Rules & Compliance (policy library)
    ├── Compliance.tsx         # Certification (ISO 42001 + EU AI Act)
    ├── Quality.tsx            # QUALITY tab — Tasks & Reviews
    └── BoardReport.tsx        # PLANNING

server/
├── index.ts                   # Express bootstrap
├── routes.ts                  # API endpoints (registerRoutes)
├── storage.ts                 # IStorage Drizzle wrapper
└── vite.ts                    # dev-mode Vite middleware

shared/schema.ts               # Drizzle SQLite schema (single source of truth for types)
```

## Conventions

- **Hash routing.** wouter `<Router hook={useHashLocation}>` — all paths are `/#/...`. Required for iframe/static-host deployment.
- **`personas.ts` is the single source of truth** for agent/process data across the new pages. Edit there to propagate changes.
- **Charts are inline SVG.** No Chart.js / Recharts. Each page builds its own minimal SVG. Keeps bundle small.
- **`data-testid` on every interactive element.** Pattern: `{action}-{target}` (e.g. `button-export-audit`, `select-process`).
- **TanStack Query v5 object form only:** `useQuery({ queryKey: [...] })`.
- **SQLite via Drizzle is synchronous** — terminate queries with `.get()` or `.all()`, never destructure.
- **No `localStorage`/`sessionStorage`/cookies.** Sandbox-blocked. Use React state or backend storage.

## Deployment

The build output `dist/public` is fully static and can be hosted on any CDN (S3, Cloudflare Pages, Vercel static). The Express server in `dist/index.cjs` handles API calls; it can run as a separate service on port 5000 or be co-hosted.

The `template/client/src/lib/queryClient.ts` uses a `__PORT_5000__` placeholder that the deploy step rewrites to point API calls at the proxied backend path.

## Persona system

The dashboard ships with a single diversified company persona — a hospitality / VIP-focused conglomerate running agents across:

| Process | Sigma | Agents |
|---|---|---|
| Sports Betting Analyst | 3.4σ | Odds Analysis · Line Comparison · Recommendation Writer |
| Auto Insurance Claims | 4.1σ | FNOL Triage · Damage Estimator · Subrogation Recovery |
| Commercial Loan Origination | 3.8σ | Loan Underwriter · Covenant Check |
| Dealer Service Triage | 3.6σ | Service Triage · Estimate Composer |
| Player Loyalty & Retention | 3.9σ | VIP Segmenter · Comp Offer Composer |
| AML / KYC Screening | 4.4σ | AML Screener · Sanctions Match |
| Resort Operations | 3.2σ | Folio Reconciler |

To re-skin for a different vertical (single-vertical or different mix), edit `client/src/lib/personas.ts` and the diversified data tables inside `Audit.tsx`, `RiskAnalysis.tsx`, `Oversight.tsx`, `Rules.tsx`, `Compliance.tsx`, and `Quality.tsx`.

## Routes

| Path | Page |
|---|---|
| `/` | Dashboard |
| `/live` | Live Monitor |
| `/agents` | Agent Roster |
| `/agents-compare` | Agent Comparisons |
| `/agents-dependencies` | Dependencies |
| `/financial` | Financial Impact |
| `/equations` | Five Equations |
| `/benchmarks` | Benchmarks (placeholder) |
| `/scenarios` | What-If Scenarios |
| `/models` | Model Comparison (placeholder) |
| `/maturity` | AI Maturity |
| `/buildbuy` | Build vs Buy |
| `/correlations` | Correlations (Six Sigma) |
| `/cognition` | Cognition Plane |
| `/observation` | Observation Plane |
| `/ledger` | Predictive Ledger |
| `/coverage` | Coverage Manifest |
| `/recommendations` | Recommendations |
| `/uop-library` | UoP Library |
| `/audit` | Audit Trail |
| `/risk` | Risk Analysis (FMEA) |
| `/deploy-agent` | Deploy Agent Code |
| `/unreviewed` | Unreviewed Decisions |
| `/compliance` | Rules & Compliance |
| `/certification` | Certification |
| `/quality` | Tasks & Reviews |
| `/board` | Board Report |
