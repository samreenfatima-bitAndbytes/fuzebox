"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import type { ChartData } from "chart.js";
import { Chart } from "react-chartjs-2";
import {
  ChartBox,
  formatAxisDate,
  useChartJsTheme,
} from "@/components/charts/ChartJsTheme";
import { useChartTheme } from "@/hooks/useChartTheme";
import {
  filterLiveMonitor,
  type LiveMonitorLivenessTone,
  type LiveMonitorSnapshot,
} from "@/lib/live-monitor";
import { useShellScrollChain } from "@/lib/scroll-chain";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";

const FEED_VISIBLE_ROWS = 12;

function IconShield() {
  return (
    <svg className="h-6 w-6 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l8 3v6c0 5.25-3.5 9.74-8 11-4.5-1.26-8-5.75-8-11V5l8-3z" />
    </svg>
  );
}

function IconPulse({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 12h-4l-3 9-4-18-3 9H2" />
    </svg>
  );
}

function IconBolt() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
    </svg>
  );
}

function LatencySparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const pts = values;

  const w = 120;
  const h = 36;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const coords = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="fb-lm-metric-spark w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline
        fill="none"
        stroke="var(--alert-warn-text)"
        strokeWidth="2"
        strokeLinejoin="round"
        points={coords}
      />
    </svg>
  );
}

function MonitorMetricCard({
  eyebrow,
  value,
  sub,
  icon,
  iconTone,
  sparkline,
}: {
  eyebrow: string;
  value: string;
  sub: string;
  icon: ReactNode;
  iconTone: "blue" | "green" | "amber";
  sparkline?: ReactNode;
}) {
  return (
    <div className="fb-lm-metric">
      <div className={`fb-lm-metric-icon fb-lm-metric-icon--${iconTone}`}>{icon}</div>
      <p className="fb-lm-metric-eyebrow">{eyebrow}</p>
      <p className="fb-lm-metric-value">{value}</p>
      <p className="fb-lm-metric-sub">{sub}</p>
      {sparkline}
    </div>
  );
}

function formatHealthPollTime(d: Date | null): string {
  if (!d) return "";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function LiveMonitorStatusBar({
  lastRefreshLabel,
  refreshSeconds,
  eventsPerMin,
  onConfigure,
  onEmergencyPause,
  deploymentPolling,
  deploymentActiveAgents,
  deploymentStatus,
  deploymentPollError,
  deploymentPolledAt,
}: {
  lastRefreshLabel: string;
  refreshSeconds: number;
  eventsPerMin: number;
  onConfigure: () => void;
  onEmergencyPause: () => void;
  deploymentPolling?: boolean;
  deploymentActiveAgents?: number | null;
  deploymentStatus?: string | null;
  deploymentPollError?: string | null;
  deploymentPolledAt?: Date | null;
}) {
  const refreshHint = ` · auto-refresh every ${refreshSeconds}s`;

  const healthHint =
    deploymentPolling && deploymentActiveAgents != null
      ? ` · deployment health · ${deploymentActiveAgents} live agent${deploymentActiveAgents === 1 ? "" : "s"} (${deploymentStatus ?? "ok"}) · polled ${formatHealthPollTime(deploymentPolledAt ?? null)}`
      : deploymentPolling && deploymentPollError
        ? ` · deployment health error`
        : "";

  return (
    <div className="fb-lm-status" role="status">
      <div>
        <div className="fb-lm-status-title">
          <IconShield />
          <div>
            <div>All Systems Operational</div>
            <p className="fb-lm-status-meta">
              Last refresh · {lastRefreshLabel}
              {refreshHint}
              {healthHint}
            </p>
            {deploymentPollError ? (
              <p className="mt-1 text-xs text-[var(--alert-error-text)]">
                {deploymentPollError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="fb-lm-status-actions">
        <span className="fb-lm-evt-pill">
          <span className="h-2 w-2 rounded-full bg-[var(--alert-success-text)]" aria-hidden />
          {eventsPerMin} evt/min
        </span>
        <button type="button" onClick={onConfigure} className="fb-lm-btn-configure">
          <span className="inline-flex items-center gap-1.5">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            Configure
          </span>
        </button>
        <button
          type="button"
          className="fb-lm-btn-emergency"
          data-testid="btn-pause-all"
          onClick={onEmergencyPause}
          title="Emergency pause is not wired to the orchestrator yet (AEOS parity UI)"
        >
          Emergency Pause All Agents
        </button>
      </div>
    </div>
  );
}

export function LiveMonitorKpiRow({ snapshot }: { snapshot: LiveMonitorSnapshot }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MonitorMetricCard
        eyebrow="Events observed"
        value={snapshot.eventsObserved.toLocaleString()}
        sub={snapshot.windowLabel}
        icon={<IconPulse />}
        iconTone="blue"
      />
      <MonitorMetricCard
        eyebrow="Success rate"
        value={`${snapshot.successRatePct}%`}
        sub={`${snapshot.successFraction} threshold pass`}
        icon={<IconBolt />}
        iconTone="green"
      />
      <MonitorMetricCard
        eyebrow="Avg latency"
        value={`${snapshot.avgLatencyMs.toLocaleString()} ms`}
        sub="wall-time per call"
        icon={<IconClock />}
        iconTone="amber"
        sparkline={
          snapshot.latencyTrend.length >= 2 ? (
            <LatencySparkline values={snapshot.latencyTrend} />
          ) : undefined
        }
      />
      <MonitorMetricCard
        eyebrow="Active agents"
        value={String(snapshot.activeAgents)}
        sub={`across ${snapshot.vendorCount} vendors`}
        icon={<IconActivity />}
        iconTone="amber"
      />
    </div>
  );
}

function formatTrendLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return formatAxisDate(iso);
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days >= 1) return `${days}d ago`;
    return formatAxisDate(iso);
  } catch {
    return formatAxisDate(iso);
  }
}

export function LiveMonitorTrendSection({
  snapshot,
}: {
  snapshot: LiveMonitorSnapshot;
}) {
  const { colors } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();
  const points = snapshot.throughput;
  return (
    <div className="fb-lm-trend-card">
      <p className="fb-lm-panel-eyebrow">Trend</p>
      <h2 className="fb-lm-panel-title mb-3">Success / Fail Trend</h2>
      <div className="fb-lm-trend-inner">
        <div className="min-w-0">
          {!points.length ? (
            <EmptyState message="No trend data for this period." size="chart" />
          ) : (
            (() => {
              const labels = points.map((p) => formatTrendLabel(p.date));
              const passRates = points.map((p) =>
                p.success_rate <= 1 ? p.success_rate * 100 : p.success_rate,
              );
              const failRates = passRates.map((p) => Math.max(0, 100 - p));

              const data: ChartData<"line"> = {
                labels,
                datasets: [
                  {
                    label: "Pass rate",
                    data: passRates,
                    borderColor: "transparent",
                    backgroundColor:
                      colors.success === "#059669"
                        ? "rgba(5, 150, 105, 0.22)"
                        : "rgba(52, 211, 153, 0.22)",
                    fill: true,
                    tension: 0.35,
                    pointRadius: 0,
                    borderWidth: 0,
                    order: 2,
                  },
                  {
                    label: "Pass",
                    data: passRates,
                    borderColor: colors.success,
                    backgroundColor: "transparent",
                    fill: false,
                    tension: 0.35,
                    pointRadius: 0,
                    borderWidth: 2.5,
                    order: 1,
                  },
                  {
                    label: "Fail",
                    data: failRates,
                    borderColor: colors.danger,
                    backgroundColor: "transparent",
                    fill: false,
                    tension: 0.35,
                    pointRadius: 0,
                    borderWidth: 2,
                    order: 0,
                  },
                ],
              };

              const options = mergeOptions({
                plugins: { legend: { display: false } },
                scales: {
                  x: {
                    ...categoryX,
                    grid: { display: false },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 },
                  },
                  y: {
                    ...linearY,
                    min: 0,
                    max: 100,
                    display: false,
                  },
                },
              });

              return (
                <ChartBox height={220}>
                  <Chart type="line" data={data} options={options} />
                </ChartBox>
              );
            })()
          )}
        </div>
        <div
          className="fb-lm-pass-ring"
          style={{ "--lm-pass": snapshot.successRatePct } as CSSProperties}
          aria-label={`${snapshot.successRatePct}% pass rate`}
        >
          <strong>{snapshot.successRatePct}%</strong>
          <span>pass rate</span>
        </div>
      </div>
    </div>
  );
}

export function CumulativeCostChart({
  points,
}: {
  points: LiveMonitorSnapshot["costTimeSeries"];
}) {
  const { colors, areaPrimary } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();

  if (!points.length) {
    return <EmptyState message="No cost data for this period." size="chart" />;
  }

  const labels = points.map((p) => formatAxisDate(p.date));
  const data: ChartData<"line"> = {
    labels,
    datasets: [
      {
        label: "Cumulative",
        data: points.map((p) => p.cumulative_cost_usd),
        borderColor: colors.primary,
        backgroundColor: areaPrimary,
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0,
      },
    ],
  };

  const options = mergeOptions({
    plugins: { legend: { display: false } },
    scales: {
      x: { ...categoryX, grid: { display: false } },
      y: { ...linearY, display: false },
    },
  });

  return (
    <ChartBox height={200}>
      <Chart type="line" data={data} options={options} />
    </ChartBox>
  );
}

function livenessDotClass(tone: LiveMonitorLivenessTone): string {
  if (tone === "ok") return "bg-[var(--alert-success-text)]";
  if (tone === "fail") return "bg-[var(--alert-error-text)]";
  if (tone === "warn") return "bg-[var(--alert-warning-text)]";
  return "bg-brand-muted/50";
}

function livenessTextClass(tone: LiveMonitorLivenessTone): string {
  if (tone === "ok") return "text-[var(--alert-success-text)]";
  if (tone === "fail") return "text-[var(--alert-error-text)]";
  if (tone === "warn") return "text-[var(--alert-warning-text)]";
  return "text-brand-muted";
}

function sigmaChipClass(value: number): string {
  if (value >= 4) return "fb-lm-sigma--healthy";
  if (value >= 3) return "fb-lm-sigma--watch";
  return "fb-lm-sigma--risk";
}

function SigmaBadge({ value }: { value: number }) {
  return (
    <span
      className={`fb-lm-sigma ${sigmaChipClass(value)}`}
      title="Sigma level"
    >
      {value.toFixed(1)}σ
    </span>
  );
}

export function EventsPerAgentChart({
  rows,
  onAgentClick,
}: {
  rows: LiveMonitorSnapshot["eventsPerAgent"];
  onAgentClick?: (agentId: string) => void;
}) {
  const { barSuccess } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();

  if (!rows.length) {
    return <EmptyState message="No per-agent events yet." size="chart" />;
  }

  const labels = rows.map((r) => {
    const short = r.label.replace(/^Agent\s+/i, "").trim();
    return short.length > 12 ? `${short.slice(0, 10)}…` : short;
  });

  const data: ChartData<"bar"> = {
    labels,
    datasets: [
      {
        label: "Events",
        data: rows.map((r) => r.count),
        backgroundColor: barSuccess,
        borderRadius: 6,
        maxBarThickness: 48,
      },
    ],
  };

  const options = mergeOptions({
    plugins: { legend: { display: false } },
    onClick: (_event, elements) => {
      if (!onAgentClick || elements.length === 0) return;
      const idx = elements[0].index;
      const row = rows[idx];
      if (row) onAgentClick(row.agentId);
    },
    scales: {
      x: {
        ...categoryX,
        ticks: { maxRotation: 45, minRotation: 45 },
        grid: { display: false },
      },
      y: { ...linearY, display: false },
    },
  });

  return (
    <ChartBox height={200}>
      <Chart type="bar" data={data} options={options} />
    </ChartBox>
  );
}

export function LiveMonitorPulseCard({
  eventsPerMin,
  lastRefreshLabel,
}: {
  eventsPerMin: number;
  lastRefreshLabel: string;
}) {
  return (
    <div className="fb-lm-panel">
      <p className="fb-lm-panel-eyebrow">Live</p>
      <h3 className="fb-lm-panel-title">Live Pulse</h3>
      <div className="fb-lm-pulse">
        <div className="fb-lm-pulse-icon">
          <IconPulse className="h-6 w-6" />
        </div>
        <p className="fb-lm-pulse-value">{eventsPerMin}</p>
        <p className="text-sm text-brand-muted">events / min</p>
        <p className="mt-4 text-xs text-brand-muted">
          Last refresh
          <br />
          {lastRefreshLabel}
        </p>
      </div>
    </div>
  );
}

export function LiveMonitorAgentHealth({
  agents,
  onAgentClick,
}: {
  agents: LiveMonitorSnapshot["agentHealth"];
  onAgentClick?: (agentId: string) => void;
}) {
  if (agents.length === 0) {
    return <p className="text-sm text-brand-muted">No active agents in registry.</p>;
  }

  return (
    <ul className="mt-0.5">
      {agents.map((a) => {
        const passLabel =
          a.passPct != null ? `${a.passPct}%` : "—";
        const clickable = Boolean(onAgentClick);
        return (
          <li
            key={a.agentId}
            className={`fb-lm-agent-row ${clickable ? "cursor-pointer transition-colors hover:bg-[var(--surface-muted)]" : ""}`}
            onClick={clickable ? () => onAgentClick?.(a.agentId) : undefined}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onAgentClick?.(a.agentId);
                    }
                  }
                : undefined
            }
            role={clickable ? "link" : undefined}
            tabIndex={clickable ? 0 : undefined}
          >
            <span
              className={`fb-lm-agent-dot ${livenessDotClass(a.livenessTone)}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-brand-ink">{a.name}</span>
                <span
                  className={`text-[11px] font-semibold ${livenessTextClass(a.livenessTone)}`}
                >
                  {a.livenessLabel}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-brand-muted">
                <span className="font-mono">{a.model}</span>
                {a.events > 0 ? ` · ${a.events} events` : ""}
                {a.livenessDetail ? (
                  <span className="ml-1.5 opacity-70">· {a.livenessDetail}</span>
                ) : null}
              </p>
            </div>
            <div className="fb-lm-agent-stats">
              <span className="fb-lm-pass-pct">{passLabel}</span>
              <SigmaBadge value={a.sigma} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function LiveMonitorListHint({
  total,
  visibleRows = FEED_VISIBLE_ROWS,
}: {
  total: number;
  visibleRows?: number;
}) {
  return (
    <div className="fb-lm-list-hint-slot">
      {total > visibleRows ? (
        <p className="fb-lm-list-hint">
          Showing {visibleRows} of {total} in the list — keep scrolling to reach the page
        </p>
      ) : null}
    </div>
  );
}

export function LiveMonitorEventFeed({
  rows,
}: {
  rows: LiveMonitorSnapshot["feed"];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No recent events. Load demo data or run the pipeline.
      </p>
    );
  }

  return (
    <div className="fb-lm-feed" role="list">
      {rows.map((r) => (
        <div key={r.id} className="fb-lm-feed-row" role="listitem">
          <span className="text-brand-muted">{r.whenLabel}</span>
          <span
            className={
              r.statusTone === "ok"
                ? "fb-lm-feed-ok"
                : "font-bold text-[var(--alert-error-text)]"
            }
          >
            {r.statusLabel}
          </span>
          <span className="truncate text-sm text-brand-ink">{r.agent}</span>
          <span className="font-mono tabular-nums text-brand-muted">
            {r.ms != null ? `${r.ms.toLocaleString()}ms` : "—"}
          </span>
          <span className="font-mono tabular-nums text-brand-muted">
            {r.cost != null ? `$${r.cost.toFixed(4)}` : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

const LIVE_MONITOR_TABS = [
  { id: "overview" as const, label: "Overview" },
  { id: "agents" as const, label: "Agents" },
  { id: "events" as const, label: "Events" },
];

export function LiveMonitorDashboard({
  snapshot,
  lastRefreshLabel,
  refreshSeconds,
  onConfigure,
  onEmergencyPause,
  deploymentPolling,
  deploymentActiveAgents,
  deploymentStatus,
  deploymentPollError,
  deploymentPolledAt,
}: {
  snapshot: LiveMonitorSnapshot;
  lastRefreshLabel: string;
  refreshSeconds: number;
  onConfigure: () => void;
  onEmergencyPause: () => void;
  deploymentPolling?: boolean;
  deploymentActiveAgents?: number | null;
  deploymentStatus?: string | null;
  deploymentPollError?: string | null;
  deploymentPolledAt?: Date | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof LIVE_MONITOR_TABS)[number]["id"]>("overview");
  const [agentsSearch, setAgentsSearch] = useState("");
  const [eventsSearch, setEventsSearch] = useState("");
  const agentsScrollRef = useShellScrollChain();
  const eventsScrollRef = useShellScrollChain();

  const openObservation = useCallback(
    (agentId: string) => {
      router.push(`/observation-plane?agent=${encodeURIComponent(agentId)}`);
    },
    [router],
  );

  const filteredAgents = useMemo(
    () => filterLiveMonitor(snapshot, agentsSearch).agentHealth,
    [snapshot, agentsSearch],
  );
  const filteredFeed = useMemo(
    () => filterLiveMonitor(snapshot, eventsSearch).feed,
    [snapshot, eventsSearch],
  );

  return (
    <div className="fb-lm">
      <LiveMonitorStatusBar
        lastRefreshLabel={lastRefreshLabel}
        refreshSeconds={refreshSeconds}
        eventsPerMin={snapshot.eventsPerMin}
        onConfigure={onConfigure}
        onEmergencyPause={onEmergencyPause}
        deploymentPolling={deploymentPolling}
        deploymentActiveAgents={deploymentActiveAgents}
        deploymentStatus={deploymentStatus}
        deploymentPollError={deploymentPollError}
        deploymentPolledAt={deploymentPolledAt}
      />

      <PageTabs tabs={LIVE_MONITOR_TABS} active={tab} onChange={setTab} className="mb-4" />

      {tab === "overview" && (
        <PageTabPanel id="panel-overview" labelledBy="tab-overview">
          <div className="space-y-4">
            <LiveMonitorKpiRow snapshot={snapshot} />
            <LiveMonitorTrendSection snapshot={snapshot} />
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="fb-lm-panel">
                <p className="fb-lm-panel-eyebrow">Cost</p>
                <h3 className="fb-lm-panel-title">Cumulative spend</h3>
                <CumulativeCostChart points={snapshot.costTimeSeries} />
              </div>
              <div className="fb-lm-panel">
                <p className="fb-lm-panel-eyebrow">Volume</p>
                <h3 className="fb-lm-panel-title">Events per agent</h3>
                <EventsPerAgentChart
                  rows={snapshot.eventsPerAgent}
                  onAgentClick={openObservation}
                />
              </div>
            </div>
            <LiveMonitorPulseCard
              eventsPerMin={snapshot.eventsPerMin}
              lastRefreshLabel={lastRefreshLabel}
            />
          </div>
        </PageTabPanel>
      )}

      {tab === "agents" && (
        <PageTabPanel
          id="panel-agents"
          labelledBy="tab-agents"
          className="fb-lm-tab-panel"
        >
          <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="fb-lm-panel-eyebrow">Fleet</p>
              <h3 className="fb-lm-panel-title">Agent health</h3>
              <p className="mt-1 text-sm text-brand-muted">
                Active registry agents with recent pass rate and last activity in the selected window.
              </p>
            </div>
            <div className="w-full shrink-0 sm:w-56">
              <label className="sr-only" htmlFor="live-monitor-agents-search">
                Search agents
              </label>
              <input
                id="live-monitor-agents-search"
                type="search"
                value={agentsSearch}
                onChange={(e) => setAgentsSearch(e.target.value)}
                placeholder="Search agents…"
                className="fb-input w-full text-sm"
              />
            </div>
          </header>
          <LiveMonitorListHint total={filteredAgents.length} visibleRows={14} />
          <div
            ref={agentsScrollRef}
            className="fb-lm-list-scroll fb-lm-list-scroll--tall"
          >
            <LiveMonitorAgentHealth
              agents={filteredAgents}
              onAgentClick={openObservation}
            />
          </div>
        </PageTabPanel>
      )}

      {tab === "events" && (
        <PageTabPanel
          id="panel-events"
          labelledBy="tab-events"
          className="fb-lm-tab-panel"
        >
          <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="fb-lm-panel-eyebrow">Stream</p>
              <h3 className="fb-lm-panel-title">Recent events</h3>
              <p className="mt-1 text-sm text-brand-muted">
                Latest canonical events or task runs, newest first (up to 30).
              </p>
            </div>
            <div className="w-full shrink-0 sm:w-72">
              <label className="sr-only" htmlFor="live-monitor-events-search">
                Search events
              </label>
              <input
                id="live-monitor-events-search"
                type="search"
                value={eventsSearch}
                onChange={(e) => setEventsSearch(e.target.value)}
                placeholder="Search events by agent or status…"
                className="fb-input w-full text-sm"
              />
            </div>
          </header>
          <LiveMonitorListHint total={filteredFeed.length} visibleRows={14} />
          <div
            ref={eventsScrollRef}
            className="fb-lm-list-scroll fb-lm-list-scroll--tall"
          >
            <LiveMonitorEventFeed rows={filteredFeed} />
          </div>
        </PageTabPanel>
      )}
    </div>
  );
}
