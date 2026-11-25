"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { Select } from "@/components/ui/Select";
import {
  filterAgentRoster,
  type AgentRosterData,
  type AgentRosterRow,
  type RosterTierFilter,
} from "@/lib/agent-roster";
import { TRUST_LADDER } from "@/lib/trust-tier";
import type { RosterHealth } from "@/lib/trust-tier";
import { useShellScrollChain } from "@/lib/scroll-chain";

const HEALTH_CLASS: Record<RosterHealth, string> = {
  green: "fb-roster-health--green",
  amber: "fb-roster-health--amber",
  red: "fb-roster-health--red",
};

/** Flip to true when the trust distribution strip should be visible again. */
const SHOW_TRUST_DISTRIBUTION = false;

const TIER_FILTER_OPTIONS: { value: RosterTierFilter; label: string }[] = [
  { value: "all", label: "All trust tiers" },
  ...TRUST_LADDER.map((t) => ({
    value: String(t.level) as RosterTierFilter,
    label: `${t.code} · ${t.title}`,
  })),
];

export function AgentRosterKpis({ summary }: { summary: AgentRosterData["summary"] }) {
  const statusLine = [
    `${summary.passing} passing`,
    `${summary.noRuns} no runs`,
    summary.watch > 0 ? `${summary.watch} watch` : null,
    summary.failing > 0 ? `${summary.failing} failing` : null,
    summary.inactive > 0 ? `${summary.inactive} inactive` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Registered agents"
        value={String(summary.registered)}
        sub={statusLine}
      />
      <KpiCard
        label="Trusted (T3+)"
        value={String(summary.trustedT3Plus)}
        sub="cleared for autonomous run"
      />
      <KpiCard
        label="Supervised (T2)"
        value={String(summary.supervisedT2)}
        sub="human-gated decisions"
      />
      <KpiCard
        label="Observed (T0/T1)"
        value={String(summary.observedT0T1)}
        sub="not yet promoted"
      />
    </KpiGrid>
  );
}

function TierOverviewStrip({
  byTier,
}: {
  byTier: AgentRosterData["summary"]["byTier"];
}) {
  return (
    <div className="fb-roster-tier-strip">
      {TRUST_LADDER.map((tier) => {
        const count = byTier[tier.level] ?? 0;
        return (
          <div
            key={tier.code}
            className={`fb-roster-tier-chip fb-roster-tier--t${tier.level}`}
          >
            <span className="font-semibold">{tier.code}</span>
            <span className="text-brand-muted">·</span>
            <span className="tabular-nums">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function RosterTableRow({ row }: { row: AgentRosterRow }) {
  const activity =
    row.totalRuns > 0 && row.successRatePct != null
      ? `${row.totalRuns} runs · ${row.successRatePct}% pass`
      : "no runs in window";

  return (
    <DataTableRow>
      <DataTableCell>
        <div className="fb-qar-agent-cell">
          <Link
            href={`/agents/${encodeURIComponent(row.agentId)}/edit`}
            className="fb-qar-agent-name"
          >
            {row.name}
          </Link>
          <Link
            href={`/agent-compare?a=${encodeURIComponent(row.agentId)}`}
            className="text-xs text-brand-primary hover:underline"
          >
            Compare
          </Link>
          <span className="fb-qar-agent-id">{row.agentId}</span>
        </div>
      </DataTableCell>
      <DataTableCell>
        <div className="text-sm text-brand-ink">{row.vendor}</div>
        <div className="font-mono text-xs text-brand-muted">{row.model}</div>
      </DataTableCell>
      <DataTableCell>
        <span className={`fb-qar-tier fb-roster-tier--t${row.trustLevel}`}>
          {row.trustTierLabel}
        </span>
      </DataTableCell>
      <DataTableCell align="right">
        <span
          className="fb-roster-sigma tabular-nums"
          title="From task success rate in window"
        >
          {row.sigma}
        </span>
        <div className="text-xs text-brand-muted">{activity}</div>
      </DataTableCell>
      <DataTableCell align="right" className="tabular-nums text-sm">
        {row.cuowLabel}
      </DataTableCell>
      <DataTableCell align="right" className="tabular-nums text-sm">
        {row.merLabel}
      </DataTableCell>
      <DataTableCell align="right" className="tabular-nums text-sm">
        {row.p90LatencyMs != null ? `${row.p90LatencyMs}ms` : "—"}
      </DataTableCell>
      <DataTableCell align="right">
        <span
          className={["fb-roster-health", HEALTH_CLASS[row.health]].join(" ")}
        >
          <span className="fb-roster-health-dot" aria-hidden />
          {row.healthLabel}
        </span>
      </DataTableCell>
    </DataTableRow>
  );
}

export function AgentRosterTable({
  rows,
  filteredCount,
  totalCount,
}: {
  rows: AgentRosterRow[];
  filteredCount: number;
  totalCount: number;
}) {
  const scrollRef = useShellScrollChain();

  if (totalCount === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No agents registered.{" "}
        <Link href="/agents/new" className="text-brand-primary hover:underline">
          Create an agent
        </Link>{" "}
        to populate the roster.
      </p>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No agents match the current filters ({filteredCount} of {totalCount}{" "}
        hidden).
      </p>
    );
  }

  return (
    <>
      {filteredCount < totalCount ? (
        <p className="mb-2 text-xs text-brand-muted">
          Showing {filteredCount} of {totalCount} agents
        </p>
      ) : null}
      <div ref={scrollRef} className="fb-roster-table-scroll">
        <DataTable>
          <DataTableHead>
            <tr>
              <th className="fb-data-table-cell">Agent</th>
              <th className="fb-data-table-cell">Vendor / Model</th>
              <th className="fb-data-table-cell">Trust tier</th>
              <th className="fb-data-table-cell text-right">Sigma</th>
              <th className="fb-data-table-cell text-right" title="Cost per run (economics)">
                CUoW
              </th>
              <th className="fb-data-table-cell text-right" title="Estimated MER">
                MER
              </th>
              <th className="fb-data-table-cell text-right" title="p90 latency (performance)">
                p90
              </th>
              <th className="fb-data-table-cell text-right">Status</th>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {rows.map((row) => (
              <RosterTableRow key={row.agentId} row={row} />
            ))}
          </DataTableBody>
        </DataTable>
      </div>
    </>
  );
}

export function AgentRosterTrustLadder({
  byTier,
}: {
  byTier: AgentRosterData["summary"]["byTier"];
}) {
  return (
    <div className="fb-roster-ladder fb-kpi-chrome">
      <p className="fb-roster-ladder-eyebrow">Patent Family 5</p>
      <h3 className="fb-roster-ladder-title">Trust tier ladder</h3>
      <p className="mb-4 text-sm text-brand-muted">
        Promotion uses task success in the selected window and registry trust level
        from v2.
      </p>
      <ul className="fb-roster-ladder-list">
        {TRUST_LADDER.map((tier) => {
          const count = byTier[tier.level] ?? 0;
          const agentLabel = count === 1 ? "agent" : "agents";
          return (
            <li key={tier.code} className="fb-roster-ladder-item">
              <div className="fb-roster-ladder-item-head">
                <span className={`fb-roster-ladder-code fb-roster-tier--t${tier.level}`}>
                  {tier.code} · {tier.title}
                </span>
                <span className="fb-roster-ladder-count">
                  {count} {agentLabel}
                </span>
              </div>
              <p className="fb-roster-ladder-blurb">{tier.blurb}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AgentRosterDashboard({
  roster,
}: {
  roster: AgentRosterData;
}) {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<RosterTierFilter>("all");

  const filteredRows = useMemo(
    () => filterAgentRoster(roster, search, tierFilter).rows,
    [roster, search, tierFilter],
  );

  return (
    <div className="space-y-4">
      <AgentRosterKpis summary={roster.summary} />

      {SHOW_TRUST_DISTRIBUTION ? (
        <div className="fb-card-accent-top p-4 sm:p-5">
          <p className="text-sm font-semibold text-brand-ink">Trust distribution</p>
          <p className="mt-1 text-sm text-brand-muted">
            Count of agents at each tier (T0–T4) in the registry.
          </p>
          <TierOverviewStrip byTier={roster.summary.byTier} />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] xl:items-start">
        <div className="fb-card-accent-top min-w-0 p-4 sm:p-6">
          <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-brand-ink">All agents</h2>
              <p className="text-sm text-brand-muted">
                Sigma and status from task outcomes in the selected window.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <label className="sr-only" htmlFor="roster-search">
                Search roster
              </label>
              <input
                id="roster-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agents…"
                className="fb-input w-full text-sm sm:w-56"
              />
              <Select
                id="roster-tier-filter"
                size="sm"
                value={tierFilter}
                onChange={(v) => setTierFilter(v as RosterTierFilter)}
                options={TIER_FILTER_OPTIONS}
                aria-label="Filter by trust tier"
                className="min-w-[10.5rem]"
              />
            </div>
          </header>
          <AgentRosterTable
            rows={filteredRows}
            filteredCount={filteredRows.length}
            totalCount={roster.rows.length}
          />
        </div>

        <AgentRosterTrustLadder byTier={roster.summary.byTier} />
      </div>
    </div>
  );
}
