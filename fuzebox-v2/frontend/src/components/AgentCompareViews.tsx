"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import type { ChartData } from "chart.js";
import { Chart } from "react-chartjs-2";
import { ChartBox, useChartJsTheme } from "@/components/charts/ChartJsTheme";
import { useChartTheme } from "@/hooks/useChartTheme";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import {
  buildCompareOverview,
  COMPARE_DIMENSIONS,
  filterCompareAgentOptions,
  formatDpmo,
  formatUsd,
  type AgentCompareMetrics,
  type AgentCompareResult,
  type CompareOverviewStats,
} from "@/lib/agent-compare";
import { formatVendorLabel } from "@/lib/agent-labels";
import type { AgentRegistryItem } from "@/lib/types";

const AGENT_A_COLOR = "#3b82f6";
const AGENT_B_COLOR = "#ef4444";

function CompareIcon({ children }: { children: ReactNode }) {
  return (
    <span className="fb-compare-metric-icon" aria-hidden>
      {children}
    </span>
  );
}

function IconSparkles() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3l1.2 3.6L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3zM5 14l.8 2.4L8 17l-2.2.7L5 20l-.8-2.3L2 17l2.2-.6L5 14zM19 14l.8 2.4L22 17l-2.2.7L19 20l-.8-2.3L16 17l2.2-.6L19 14z" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconPulse() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 12h3l2-7 4 14 2-7h7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconDollar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7H14a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function IconRuns() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 16.5L15.5 8.5" />
    </svg>
  );
}

function IconTrophy() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-amber-500">
      <path d="M6 4h12v2a4 4 0 01-4 4h-1v2h3v2H8v-2h3v-2h-1a4 4 0 01-4-4V4zm2 2v0a2 2 0 002 2h4a2 2 0 002-2V6H8zm-4 0H4a2 2 0 002 3.46A5 5 0 007 14h1V6H4zm16 0h-3v8h1a5 5 0 003-4.54A2 2 0 0020 6z" />
    </svg>
  );
}

const METRIC_ICONS: Record<string, ReactNode> = {
  sigma: (
    <CompareIcon>
      <IconSparkles />
    </CompareIcon>
  ),
  dpmo: (
    <CompareIcon>
      <IconTarget />
    </CompareIcon>
  ),
  success: (
    <CompareIcon>
      <IconPulse />
    </CompareIcon>
  ),
  cost: (
    <CompareIcon>
      <IconDollar />
    </CompareIcon>
  ),
  latency: (
    <CompareIcon>
      <IconClock />
    </CompareIcon>
  ),
  runs: (
    <CompareIcon>
      <IconRuns />
    </CompareIcon>
  ),
};

function AgentSelectorCard({
  slot,
  agents,
  value,
  onChange,
  excludeId,
  metrics,
  filterQuery = "",
}: {
  slot: "A" | "B";
  agents: AgentRegistryItem[];
  value: string;
  onChange: (id: string) => void;
  excludeId?: string;
  metrics: AgentCompareMetrics;
  filterQuery?: string;
}) {
  const filtered = filterCompareAgentOptions(
    agents.filter((a) => a.agent_id !== excludeId),
    filterQuery,
  );
  const selected = agents.find((a) => a.agent_id === value);
  const options =
    selected && !filtered.some((a) => a.agent_id === value)
      ? [selected, ...filtered.filter((a) => a.agent_id !== value)]
      : filtered.length > 0
        ? filtered
        : agents.filter((a) => a.agent_id !== excludeId);

  return (
    <div
      className={`fb-compare-agent fb-kpi-chrome fb-compare-agent--${slot.toLowerCase()}`}
    >
      <p className="fb-compare-agent-slot">Agent {slot}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="fb-compare-agent-select"
        aria-label={`Select agent ${slot}`}
      >
        {options.map((a) => (
          <option key={a.agent_id} value={a.agent_id}>
            {a.name}
          </option>
        ))}
      </select>
      <p className="fb-compare-agent-model">
        — {metrics.model} · {formatVendorLabel(metrics.vendor)}
      </p>
    </div>
  );
}

export function AgentCompareWinnerBanner({
  result,
}: {
  result: AgentCompareResult;
}) {
  if (!result.winnerId) {
    return (
      <div className="fb-compare-banner fb-kpi-chrome fb-compare-banner--tie">
        <p className="fb-compare-banner-kicker">Even match</p>
        <p className="fb-compare-banner-title">Tied overall</p>
        <p className="fb-compare-banner-sub">
          Each agent leads in {result.winsA} of 6 dimensions
        </p>
      </div>
    );
  }

  const wins =
    result.winnerId === result.agentA.agentId ? result.winsA : result.winsB;

  return (
    <div className="fb-compare-banner fb-kpi-chrome">
      <div className="fb-compare-banner-trophy">
        <IconTrophy />
        <span className="fb-compare-banner-kicker">Winner</span>
      </div>
      <p className="fb-compare-banner-title">{result.winnerName}</p>
      <p className="fb-compare-banner-sub">
        Outperforms in {wins} of 6 dimensions
      </p>
    </div>
  );
}

function metricWin(
  aVal: number,
  bVal: number,
  lowerBetter: boolean,
): { aWins: boolean; bWins: boolean } {
  if (aVal === bVal) return { aWins: false, bWins: false };
  if (lowerBetter) {
    return { aWins: aVal < bVal, bWins: bVal < aVal };
  }
  return { aWins: aVal > bVal, bWins: bVal > aVal };
}

function MetricCompareCard({
  id,
  label,
  aValue,
  bValue,
  aWins,
  bWins,
  lowerBetter = false,
}: {
  id: string;
  label: string;
  aValue: string;
  bValue: string;
  aWins: boolean;
  bWins: boolean;
  lowerBetter?: boolean;
}) {
  return (
    <article className="fb-compare-metric-card fb-kpi-chrome">
      <div className="fb-compare-metric-card-head">
        <span className="fb-compare-metric-card-label">{label}</span>
        {METRIC_ICONS[id]}
      </div>
      <div className="fb-compare-metric-card-body">
        <div className="fb-compare-metric-col">
          <span className="fb-compare-dot fb-compare-dot--a" aria-hidden />
          <span
            className={[
              "fb-compare-metric-value",
              aWins ? "fb-compare-metric-value--win-a" : "",
            ].join(" ")}
          >
            {aValue}
            {aWins && (
              <span className="fb-compare-star fb-compare-star--a">★</span>
            )}
          </span>
        </div>
        <div className="fb-compare-metric-col">
          <span className="fb-compare-dot fb-compare-dot--b" aria-hidden />
          <span
            className={[
              "fb-compare-metric-value",
              bWins ? "fb-compare-metric-value--win-b" : "",
            ].join(" ")}
          >
            {bValue}
            {bWins && (
              <span className="fb-compare-star fb-compare-star--b">★</span>
            )}
          </span>
        </div>
      </div>
      {lowerBetter && (
        <p className="fb-compare-metric-foot">lower is better</p>
      )}
    </article>
  );
}

export function AgentCompareMetricsGrid({
  result,
}: {
  result: AgentCompareResult;
}) {
  const { agentA: a, agentB: b } = result;
  const sigma = metricWin(a.sigma, b.sigma, false);
  const dpmo = metricWin(a.dpmo, b.dpmo, true);
  const success = metricWin(a.successPct, b.successPct, false);
  const cost = metricWin(a.costPerRunUsd, b.costPerRunUsd, true);
  const latency = metricWin(a.avgLatencyMs, b.avgLatencyMs, true);
  const runs = metricWin(a.totalRuns, b.totalRuns, false);

  return (
    <div className="fb-compare-metrics-grid">
      <MetricCompareCard
        id="sigma"
        label="Sigma"
        aValue={a.sigmaLabel}
        bValue={b.sigmaLabel}
        aWins={sigma.aWins}
        bWins={sigma.bWins}
      />
      <MetricCompareCard
        id="dpmo"
        label="DPMO"
        aValue={formatDpmo(a.dpmo)}
        bValue={formatDpmo(b.dpmo)}
        aWins={dpmo.aWins}
        bWins={dpmo.bWins}
        lowerBetter
      />
      <MetricCompareCard
        id="success"
        label="Success"
        aValue={`${a.successPct}%`}
        bValue={`${b.successPct}%`}
        aWins={success.aWins}
        bWins={success.bWins}
      />
      <MetricCompareCard
        id="cost"
        label="Cost / run"
        aValue={formatUsd(a.costPerRunUsd)}
        bValue={formatUsd(b.costPerRunUsd)}
        aWins={cost.aWins}
        bWins={cost.bWins}
        lowerBetter
      />
      <MetricCompareCard
        id="latency"
        label="Avg latency"
        aValue={`${a.avgLatencyMs}ms`}
        bValue={`${b.avgLatencyMs}ms`}
        aWins={latency.aWins}
        bWins={latency.bWins}
        lowerBetter
      />
      <MetricCompareCard
        id="runs"
        label="Total runs"
        aValue={String(a.totalRuns)}
        bValue={String(b.totalRuns)}
        aWins={runs.aWins}
        bWins={runs.bWins}
      />
      {/* MER (est.) and p90 latency hidden until v2 enrichment is reliable */}
    </div>
  );
}

export function AgentCompareRadarChart({
  result,
}: {
  result: AgentCompareResult;
}) {
  const { tickFill, gridStroke, textFill } = useChartTheme();
  const { mergeOptions } = useChartJsTheme();

  const labels = COMPARE_DIMENSIONS.map((d) => d.label);

  const data: ChartData<"radar"> = useMemo(
    () => ({
      labels,
      datasets: [
        {
          label: result.agentA.name,
          data: COMPARE_DIMENSIONS.map((d) => result.agentA.radar[d.id]),
          borderColor: AGENT_A_COLOR,
          backgroundColor: "rgba(59, 130, 246, 0.18)",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: AGENT_A_COLOR,
        },
        {
          label: result.agentB.name,
          data: COMPARE_DIMENSIONS.map((d) => result.agentB.radar[d.id]),
          borderColor: AGENT_B_COLOR,
          backgroundColor: "rgba(239, 68, 68, 0.14)",
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: AGENT_B_COLOR,
        },
      ],
    }),
    [labels, result],
  );

  const options = useMemo(
    () =>
      mergeOptions({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: {
              stepSize: 25,
              backdropColor: "transparent",
              color: tickFill,
              font: { size: 10 },
            },
            grid: { color: gridStroke },
            angleLines: { color: gridStroke },
            pointLabels: {
              color: textFill,
              font: { size: 11 },
            },
          },
        },
      }),
    [mergeOptions, gridStroke, textFill, tickFill],
  );

  return (
    <ChartBox height={300}>
      <Chart type="radar" data={data} options={options} />
    </ChartBox>
  );
}

function verdictPillClass(v: "a" | "b" | "tie"): string {
  if (v === "a") return "fb-compare-pill fb-compare-pill--a";
  if (v === "b") return "fb-compare-pill fb-compare-pill--b";
  return "fb-compare-pill fb-compare-pill--tie";
}

function verdictPillText(detail: string): string {
  return detail.toLowerCase() === "tied" ? "tied" : detail;
}

export function AgentCompareRadarSection({
  result,
}: {
  result: AgentCompareResult;
}) {
  const { agentA, agentB } = result;

  return (
    <section className="fb-compare-radar-card fb-kpi-chrome p-4 sm:p-6">
      <header className="fb-compare-radar-header">
        <p className="fb-compare-radar-eyebrow">Performance radar</p>
        <h3 className="fb-compare-radar-title">Six-axis comparison</h3>
      </header>
      <div className="fb-compare-radar-layout">
        <div className="fb-compare-radar-chart">
          <AgentCompareRadarChart result={result} />
        </div>
        <div className="fb-compare-radar-side">
          <div className="fb-compare-legend">
            <div className="fb-compare-legend-item">
              <span
                className="fb-compare-legend-swatch fb-compare-legend-swatch--a"
                aria-hidden
              />
              <div>
                <span className="fb-compare-legend-slot">Agent A</span>
                <span className="fb-compare-legend-name">{agentA.name}</span>
              </div>
            </div>
            <div className="fb-compare-legend-item">
              <span
                className="fb-compare-legend-swatch fb-compare-legend-swatch--b"
                aria-hidden
              />
              <div>
                <span className="fb-compare-legend-slot">Agent B</span>
                <span className="fb-compare-legend-name">{agentB.name}</span>
              </div>
            </div>
          </div>
          <ul className="fb-compare-dimension-list">
            {COMPARE_DIMENSIONS.map((dim) => {
              const v = result.dimensionVerdicts[dim.id];
              const meta = result.dimensionLabels[dim.id];
              return (
                <li key={dim.id} className="fb-compare-dimension-item">
                  <span className="fb-compare-dimension-name">{dim.label}</span>
                  <span className={verdictPillClass(v)}>
                    {verdictPillText(meta.detail)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function AgentCompareOverviewKpis({
  result,
  overview,
}: {
  result: AgentCompareResult;
  overview: CompareOverviewStats;
}) {
  const { agentA: a, agentB: b } = result;

  return (
    <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label={`${a.name} · sigma`}
        value={a.sigmaLabel}
        sub={
          a.totalRuns > 0
            ? `${a.successPct}% pass · ${a.totalRuns} runs`
            : "No runs in window"
        }
      />
      <KpiCard
        label={`${b.name} · sigma`}
        value={b.sigmaLabel}
        sub={
          b.totalRuns > 0
            ? `${b.successPct}% pass · ${b.totalRuns} runs`
            : "No runs in window"
        }
      />
      <KpiCard
        label="Dimension wins"
        value={`${overview.winsA} vs ${overview.winsB}`}
        sub={
          overview.ties > 0
            ? `${overview.ties} tied · Agent A vs B`
            : "Agent A vs B on radar axes"
        }
      />
      <KpiCard
        label="Overall"
        value={overview.leaderName ?? "Tied"}
        sub={overview.leaderDetail}
      />
    </KpiGrid>
  );
}

export function AgentCompareSelectorRow({
  agents,
  agentIdA,
  agentIdB,
  onChangeA,
  onChangeB,
  metricsById,
  result,
  filterQuery = "",
}: {
  agents: AgentRegistryItem[];
  agentIdA: string;
  agentIdB: string;
  onChangeA: (id: string) => void;
  onChangeB: (id: string) => void;
  metricsById: Map<string, AgentCompareMetrics>;
  result: AgentCompareResult | null;
  filterQuery?: string;
}) {
  const metricsA = metricsById.get(agentIdA);
  const metricsB = metricsById.get(agentIdB);

  if (!metricsA || !metricsB) {
    return (
      <p className="text-sm text-brand-muted">
        Select two different agents to compare.
      </p>
    );
  }

  return (
    <div className="fb-compare-selector-row">
      <AgentSelectorCard
        slot="A"
        agents={agents}
        value={agentIdA}
        onChange={onChangeA}
        excludeId={agentIdB}
        metrics={metricsA}
        filterQuery={filterQuery}
      />
      {result ? (
        <AgentCompareWinnerBanner result={result} />
      ) : (
        <div className="fb-compare-banner fb-kpi-chrome fb-compare-banner--tie">
          <p className="fb-compare-banner-kicker">Compare</p>
          <p className="fb-compare-banner-title">Pick two agents</p>
          <p className="fb-compare-banner-sub">Choose different agents in A and B</p>
        </div>
      )}
      <AgentSelectorCard
        slot="B"
        agents={agents}
        value={agentIdB}
        onChange={onChangeB}
        excludeId={agentIdA}
        metrics={metricsB}
        filterQuery={filterQuery}
      />
    </div>
  );
}

export function AgentCompareDashboard({
  agents,
  agentIdA,
  agentIdB,
  onChangeA,
  onChangeB,
  metricsById,
  result,
  filterQuery = "",
}: {
  agents: AgentRegistryItem[];
  agentIdA: string;
  agentIdB: string;
  onChangeA: (id: string) => void;
  onChangeB: (id: string) => void;
  metricsById: Map<string, AgentCompareMetrics>;
  result: AgentCompareResult | null;
  filterQuery?: string;
}) {
  return (
    <div className="fb-compare-stack">
      <AgentCompareSelectorRow
        agents={agents}
        agentIdA={agentIdA}
        agentIdB={agentIdB}
        onChangeA={onChangeA}
        onChangeB={onChangeB}
        metricsById={metricsById}
        result={result}
        filterQuery={filterQuery}
      />

      {!result ? null : (
        <div className="space-y-4">
          <AgentCompareMetricsGrid result={result} />
          <AgentCompareRadarSection result={result} />
        </div>
      )}
    </div>
  );
}

