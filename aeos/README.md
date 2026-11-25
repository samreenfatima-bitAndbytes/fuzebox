# FuzeBox AEOS — Economic Cognition Layer

A working full-stack reference implementation of the **Economic Cognition Layer (ECL)** for FuzeBox AEOS, with the r-Potential operator dashboard layered on top.

Patent references: USPTO Provisional **63/898,712** — Family 2 (UoP master equation), Family 5 (trust tiers T0–T4), Family 6 (canonical event schema + HMAC chain), Family 8 (predictive economic ledger five-structure).

---

## What this is

Three coordinated planes that price every agent action regardless of harness:

1. **Observation Plane** — canonical event capture across browser/desktop/server/email/agent surfaces with HMAC-chained provenance and a per-tenant coverage manifest.
2. **Predictive Economic Ledger (PEL)** — five-structure rows (Predicted / Actual / Variance / Counterfactual / Reconciled) reconciled against systems of record.
3. **Cognition Plane** — Five Equations (RoP, CUoW, MER, CTR, GSTI) rolled into the TUoP master equation with H/A/S synergy and trust-tier promotion.

Plus a complete dashboard surface (`r-Potential`) with Live Monitor, Recommendations, Coverage, Audit, Financial Impact, and a printable Board Report.

---

## Stack

- **Runtime**: Node.js 20+ · TypeScript 5.6
- **Server**: Express 5 · Drizzle ORM · better-sqlite3 (dev) — swap to Postgres in prod via Drizzle dialect
- **Client**: React 18 · Vite 7 · TanStack Query v5 · Tailwind 3 + shadcn/ui · wouter (hash routing)
- **Build**: `tsx` for dev, `esbuild` for server bundle, `vite build` for client

Single-port architecture: Express serves the API and the built client from the same process (default `:5000`).

---

## Getting started

```bash
# 1. Install
npm install

# 2. Initialize the dev database (SQLite)
npm run db:push

# 3. Run dev server (hot-reload server + Vite middleware)
npm run dev
# → http://localhost:5000

# 4. Production build
npm run build
NODE_ENV=production node dist/index.cjs
```

On first request the server auto-seeds tenant `ten_demo` with 120 canonical events, 120 ledger rows (97 closed / 23 open), 6 demo agents, 3 recommendations, and 7 coverage entries (see `server/cognition.ts → seedIfEmpty`).

---

## Repo layout

```
fuzebox-ecl/
├── client/                          # Vite + React app
│   ├── index.html
│   └── src/
│       ├── App.tsx                  # Routes (uses wouter useHashLocation)
│       ├── main.tsx
│       ├── index.css                # Theme tokens — VIP Sigma palette
│       ├── components/
│       │   ├── Layout.tsx           # Sidebar + topbar shell
│       │   ├── Logo.tsx
│       │   ├── KpiCard.tsx          # Top-row KPI cards
│       │   ├── Pill.tsx             # Pill / StatusDot / SigmaBadge
│       │   ├── SectionCard.tsx      # Framed panel
│       │   └── ui/                  # shadcn/ui primitives
│       ├── hooks/
│       ├── lib/
│       │   ├── queryClient.ts       # TanStack Query config
│       │   ├── format.ts            # USD / σ / × formatters
│       │   └── utils.ts
│       └── pages/
│           ├── Dashboard.tsx        # Hero + 4 KPIs + Five Equations rollup
│           ├── CognitionPlane.tsx   # Master equation + snapshot history
│           ├── ObservationPlane.tsx # Event ledger + HMAC chain proof
│           ├── PredictiveLedger.tsx # Five-structure rows + simulator
│           ├── FiveEquations.tsx    # Per-equation deep dive
│           ├── CoverageManifest.tsx # Per-vendor coverage map
│           ├── Recommendations.tsx  # Adopt / reject + cognition trigger
│           ├── AgentRoster.tsx      # T0–T4 trust ladder
│           ├── LiveMonitor.tsx      # 5s auto-refresh agent + event feed
│           ├── FinancialImpact.tsx  # Per-vendor breakdown + ROI waterfall
│           ├── Audit.tsx            # Governance log + ISO/IEC 42001 banner
│           ├── BoardReport.tsx      # Printable Q-end report
│           └── ComingSoon.tsx       # Stubs for benchmarks/scenarios/risk
│
├── server/
│   ├── index.ts                     # Express bootstrap
│   ├── routes.ts                    # All API endpoints
│   ├── cognition.ts                 # Adapters · ingest · reconcile · rollup · recommend · seed
│   ├── storage.ts                   # Drizzle storage layer
│   ├── static.ts                    # Static asset serving in prod
│   └── vite.ts                      # Vite middleware in dev
│
├── shared/
│   └── schema.ts                    # 8 Drizzle tables + Zod schemas
│
├── script/
│   └── build.ts                     # Production build orchestrator
│
├── drizzle.config.ts
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── vite.config.ts
└── components.json                  # shadcn/ui registry config
```

---

## Data model (`shared/schema.ts`)

Eight tables, all keyed by `tenantId` for multi-tenant isolation:

| Table | Purpose | Patent family |
|---|---|---|
| `tenants` | tenant registry | — |
| `agents` | agent identity + trust tier (T0–T4) + vendor/model | F5 |
| `canonicalEvents` | Observation Plane events with HMAC chain | F6 |
| `coverageManifest` | per-surface health and capture gaps | F6 |
| `pelRows` | Predictive Economic Ledger five-structure rows | F8 |
| `equationSnapshots` | Cognition Plane rollup history (RoP/CUoW/MER/CTR/GSTI/TUoP) | F2 |
| `recommendations` | adopt/reject economic recommendations | F2/F8 |
| `governanceDecisions` | audit log of adoption / rejection / overrides | F5 |

---

## API surface (`server/routes.ts`)

All endpoints require `X-Tenant-Id` header (defaults to `ten_demo` in dev).

```
GET    /api/dashboard/summary              hero + 4 KPIs + status rollup
GET    /api/observation/events             canonical event ledger
GET    /api/observation/coverage           coverage manifest + gap detection
POST   /api/observation/ingest             single canonical event ingest

GET    /api/pel/rows?status=all|open|closed    PEL rows
POST   /api/pel/reconcile                  simulate SoR reconciliation
POST   /api/pel/rollup                     recompute equations + snapshot

GET    /api/recommendations                list with status filter
POST   /api/recommendations/:id/adopt      apply + governance log
POST   /api/recommendations/:id/reject     dismiss + governance log
POST   /api/recommendations/generate       run cognition pass

GET    /api/agents                         roster + trust tiers
GET    /api/governance/decisions           audit log
```

The canonical event JSON shape and HMAC chain construction are documented in `fuzebox_ecl_integration_spec.md` (separate deliverable).

---

## Five Equations (Cognition Plane)

Implemented in `server/cognition.ts → recomputeEquations`:

- **RoP** — Return on Potential = realized economic value / minimum viable potential
- **CUoW** — Cost per Unit of Work = $ spent / canonical events closed
- **MER** — Model Economic Ratio = value delivered / model token cost
- **CTR** — Counterfactual Take Rate = adopted recommendations / generated
- **GSTI** — Governance + Safety + Trust Index, weighted from T-tier and decision log

Rolled into the **TUoP master equation** with H/A/S (Human / Agent / System) synergy weighting (Family 2).

---

## Trust tiers (Family 5)

| Tier | Capability | Example agent |
|---|---|---|
| T0 | Observed only — no autonomous action | new agent in shadow mode |
| T1 | Suggest only — human approves all | `agt_recommendation` |
| T2 | Act in sandbox — bounded scope | `agt_line_compare`, `agt_customer_response`, `agt_service_advisor` |
| T3 | Act in production — variance gates | `agt_odds_analyzer`, `agt_resume_screener_v3` |
| T4 | Act + delegate to subagents | (none in demo seed) |

Promotion criteria: rolling 30-day variance < threshold, governance log clean, CUoW within budget envelope.

---

## Configuration

- `DATABASE_URL` — defaults to local SQLite `data.db`. Swap to Postgres by editing `drizzle.config.ts` dialect and `server/storage.ts` driver.
- `PORT` — defaults to `5000`.
- `NODE_ENV` — `development` enables Vite middleware; `production` serves the built client from `dist/public`.
- `HMAC_SECRET` — used for canonical event chain hashing. Provide a strong tenant-scoped secret in production.

---

## Dev notes that will save the next engineer time

- **Hash routing required** for the embedded-iframe deploy target. Top-level router in `App.tsx` is `<Router hook={useHashLocation}>` from `wouter/use-hash-location`.
- **Event timestamp field** is `capturedAt` (not `occurredAt`). Several pages depend on this — see `ObservationPlane.tsx` and `LiveMonitor.tsx`.
- **Recommendation savings convention**: `predictedDeltaUsd` is the cost change (negative = savings). Display layer flips sign: `projectedSavings = -sum(predictedDeltaUsd)`.
- **TanStack Query v5 object form** everywhere: `useQuery({ queryKey: ['/api/...'] })`.
- **Trust tier label rendering**: use global flag — `tier.replace(/_/g, " · ")`. The single-replace bug eats subsequent underscores.
- **Every interactive element has `data-testid`** for downstream e2e harnesses.
- **API base in `client/src/lib/queryClient.ts`** uses a `__PORT_5000__` placeholder that the deploy pipeline rewrites. For local dev it resolves to `window.location.origin`.

---

## Production hardening checklist

Before this leaves the lab:

- [ ] Replace SQLite with Postgres (Drizzle dialect swap — schema is dialect-agnostic)
- [ ] Move `HMAC_SECRET` to per-tenant KMS-backed key
- [ ] Add auth middleware in front of `/api/*` (passport-local stubbed in deps)
- [ ] Wire real adapters in `server/cognition.ts` — current implementations are demo seeders
- [ ] Add per-tenant rate limiting on ingest
- [ ] Stand up a queue (BullMQ / SQS) in front of `/api/observation/ingest` for high-volume capture
- [ ] Add OpenTelemetry traces — the canonical event chain is the natural carrier
- [ ] Compliance cartridge exports (EU AI Act, ISO/IEC 42001, NIST AI RMF) per the v1.5 roadmap

---

## License

Proprietary — FuzeBox.ai. Patent pending: USPTO Provisional 63/898,712.

For licensing or commercial integration: contact Les Ottolenghi.
