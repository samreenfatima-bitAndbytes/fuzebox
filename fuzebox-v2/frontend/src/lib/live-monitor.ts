import {
  ApiError,
  fetchEnrichedAgents,
  fetchObservationEvents,
  fetchObservationSummary,
  fetchOverviewSummary,
  fetchPerformanceSummary,
  fetchQualitySummary,
} from "./api";
import type {
  AgentEnrichedRow,
  AgentRegistryItem,
  LiveEventRow,
  ObservationEventRow,
  ObservationSummary,
  OverviewSummary,
  PerformanceSummary,
  QualitySummary,
  ThroughputPoint,
} from "./types";
import { formatVendorLabel } from "./agent-labels";
import { daysToTimeRangeLabel } from "./format";

const EMPTY_OBSERVATION_KPIS: ObservationSummary["kpis"] = {
  total_events: 0,
  active_surfaces: 0,
  pass_rate_pct: 0,
  passed_count: 0,
  total_spend: 0,
  total_saved: 0,
  total_tokens: 0,
  avg_latency_ms: 0,
  p50_latency_ms: 0,
  avg_tokens: 0,
  avg_cost: 0,
  human_review_queued: 0,
};

const EMPTY_OVERVIEW_KPIS: OverviewSummary["kpis"] = {
  total_tasks: 0,
  successful_tasks: 0,
  success_rate: 0,
  total_cost: 0,
  avg_cost_per_task: 0,
  avg_latency_ms: 0,
  p90_latency_ms: 0,
  avg_quality: 0,
  total_workflows: 0,
  workflow_success_rate: 0,
  active_agents: 0,
};

export function emptyObservationSummary(days: number): ObservationSummary {
  return {
    days,
    kpis: { ...EMPTY_OBSERVATION_KPIS },
    by_vendor: [],
    live_stream: [],
    audit_hash: "—",
  };
}

export function emptyOverviewSummary(days: number): OverviewSummary {
  return {
    days,
    time_range_label: daysToTimeRangeLabel(days),
    kpis: { ...EMPTY_OVERVIEW_KPIS },
    cost_time_series: [],
    throughput: [],
    leaderboard: [],
  };
}

export type LiveMonitorLoadResult = {
  observation: ObservationSummary;
  overview: OverviewSummary;
  quality: QualitySummary | null;
  agents: AgentRegistryItem[];
  enrichedAgents: AgentEnrichedRow[];
  observationEvents: ObservationEventRow[];
  performance: PerformanceSummary | null;
  warnings: string[];
  days: number;
};

function enrichedToRegistry(agent: AgentEnrichedRow): AgentRegistryItem {
  return {
    agent_id: agent.agentId,
    name: agent.name,
    description: "",
    group: "default",
    status: agent.status,
    model_name: agent.model,
    vendor: agent.vendor || agent.hyperscaler,
    skills_count: 0,
    permissions_count: 0,
    cost_per_1k_input: 0,
    cost_per_1k_output: 0,
    trust_level: agent.trust_level ?? 0,
    registered_at: agent.createdAt,
  };
}

function observationEventsToLiveStream(
  events: ObservationEventRow[],
): LiveEventRow[] {
  return events.map((e) => ({
    time: e.capturedAt,
    captured_at: e.capturedAt,
    vendor: e.hyperscaler,
    agent: e.agentId,
    model: e.model ?? "",
    tokens:
      e.totalTokens ??
      (e as { total_tokens?: number }).total_tokens ??
      0,
    ms: e.wallMs,
    cost: e.vendorCostUsd,
    saved: 0,
    status: e.passedThresholds ? "captured" : "failed",
  }));
}

function mergeObservationWithEvents(
  summary: ObservationSummary,
  events: ObservationEventRow[],
): ObservationSummary {
  if (!events.length) return summary;
  const stream = observationEventsToLiveStream(events);
  const passed = events.filter((e) => e.passedThresholds).length;
  const totalMs = events.reduce((s, e) => s + e.wallMs, 0);
  const totalCost = events.reduce((s, e) => s + e.vendorCostUsd, 0);
  return {
    ...summary,
    kpis: {
      ...summary.kpis,
      total_events: events.length,
      passed_count: passed,
      pass_rate_pct:
        events.length > 0
          ? Math.round((passed / events.length) * 1000) / 10
          : 0,
      avg_latency_ms: events.length > 0 ? totalMs / events.length : 0,
      avg_cost: events.length > 0 ? totalCost / events.length : 0,
      total_spend: totalCost,
    },
    live_stream: stream,
  };
}

export async function loadLiveMonitorSources(
  days: number,
): Promise<LiveMonitorLoadResult> {
  const warnings: string[] = [];

  const [obs, eventsRes, enrichedRes, perf] = await Promise.allSettled([
    fetchObservationSummary(days, 100),
    fetchObservationEvents(days, 200),
    fetchEnrichedAgents(days),
    fetchPerformanceSummary(days),
  ]);

  let observation =
    obs.status === "fulfilled"
      ? obs.value
      : (warnings.push(
          obs.reason instanceof ApiError
            ? `Observation: ${obs.reason.message}`
            : "Observation data unavailable",
        ),
        emptyObservationSummary(days));

  const observationEvents =
    eventsRes.status === "fulfilled"
      ? eventsRes.value
      : (warnings.push(
          eventsRes.reason instanceof ApiError
            ? `Events: ${eventsRes.reason.message}`
            : "Observation events unavailable",
        ),
        []);

  observation = mergeObservationWithEvents(observation, observationEvents);

  const enrichedAgents =
    enrichedRes.status === "fulfilled"
      ? enrichedRes.value
      : (warnings.push("Enriched agent metrics unavailable"), []);

  const agents =
    enrichedAgents.length > 0
      ? enrichedAgents.map(enrichedToRegistry)
      : [];

  const performance =
    perf.status === "fulfilled" ? perf.value : null;

  const hasObservationEvents =
    observation.kpis.total_events > 0 || observationEvents.length > 0;

  let overview = emptyOverviewSummary(days);
  if (hasObservationEvents) {
    const ov = await Promise.allSettled([fetchOverviewSummary(days)]);
    if (ov[0].status === "fulfilled") {
      overview = ov[0].value;
    } else {
      warnings.push("Trend and cost charts unavailable");
    }
  }

  let quality: QualitySummary | null = null;
  if (!hasObservationEvents) {
    const qual = await Promise.allSettled([fetchQualitySummary(days)]);
    if (qual[0].status === "fulfilled") {
      quality = qual[0].value;
    } else {
      warnings.push(
        qual[0].reason instanceof ApiError
          ? `Tasks: ${qual[0].reason.message}`
          : "Task log unavailable",
      );
    }
  }

  const hasTasks = (quality?.kpis.total ?? 0) > 0;
  if (!hasObservationEvents && !hasTasks) {
    throw new ApiError(
      warnings.length
        ? warnings.join(" · ")
        : "No events or tasks in this window. Load demo data or run the pipeline.",
      404,
    );
  }

  if (!hasObservationEvents && hasTasks) {
    warnings.push("Showing task runs — no canonical observation events yet.");
  }

  return {
    observation,
    overview,
    quality,
    agents,
    enrichedAgents,
    observationEvents,
    performance,
    warnings,
    days,
  };
}

export type LiveMonitorFeedRow = {
  id: string;
  whenLabel: string;
  whenMs: number | null;
  statusLabel: string;
  statusTone: "ok" | "fail" | "warn";
  agent: string;
  ms: number | null;
  cost: number | null;
};

export type LiveMonitorLivenessTone = "ok" | "warn" | "fail" | "muted";

export type LiveMonitorAgentHealth = {
  agentId: string;
  name: string;
  model: string;
  vendor: string;
  events: number;
  avgMs: number;
  passPct: number | null;
  lastLabel: string;
  sigma: number;
  livenessTone: LiveMonitorLivenessTone;
  livenessLabel: string;
  livenessDetail: string;
};

export type LiveMonitorAgentEventCount = {
  agentId: string;
  agent: string;
  label: string;
  count: number;
};

export type DeploymentLivenessInput = {
  deploymentPolling?: boolean;
  deploymentPollError?: string | null;
  deploymentPolledAt?: Date | null;
  deploymentActiveAgents?: number | null;
  deploymentStatus?: string | null;
};

/** Tenant-level deployment health probe — applied to each agent row (AEOS parity). */
export function deriveTenantLiveness(
  input: DeploymentLivenessInput,
  now = new Date(),
): Pick<LiveMonitorAgentHealth, "livenessTone" | "livenessLabel" | "livenessDetail"> {
  if (!input.deploymentPolling) {
    return { livenessTone: "muted", livenessLabel: "Not configured", livenessDetail: "" };
  }
  if (input.deploymentPollError) {
    return {
      livenessTone: "fail",
      livenessLabel: "Unreachable",
      livenessDetail: input.deploymentPollError,
    };
  }
  if (!input.deploymentPolledAt) {
    return {
      livenessTone: "warn",
      livenessLabel: "Pending",
      livenessDetail: "first check pending",
    };
  }
  const detail = formatRelativeTime(input.deploymentPolledAt, now);
  if ((input.deploymentActiveAgents ?? 0) === 0) {
    return {
      livenessTone: "warn",
      livenessLabel: "0 agents running",
      livenessDetail: detail,
    };
  }
  const status = (input.deploymentStatus ?? "").toLowerCase();
  if (status === "ok" || status === "healthy" || status === "up") {
    return { livenessTone: "ok", livenessLabel: "Live", livenessDetail: detail };
  }
  return { livenessTone: "fail", livenessLabel: "Unreachable", livenessDetail: detail };
}

function sigmaFromEnriched(
  agentId: string,
  enrichedMap: Map<string, AgentEnrichedRow>,
  registryStatus: string,
): number {
  const row = enrichedMap.get(agentId);
  if (row?.sigma != null && row.sigma > 0) return row.sigma;
  const s = registryStatus.toLowerCase();
  if (s === "red" || s === "error") return 2.7;
  if (s === "amber" || s === "warn" || s === "warning") return 3.2;
  return 4.1;
}

export type LiveMonitorSnapshot = {
  windowLabel: string;
  eventsObserved: number;
  successRatePct: number;
  successFraction: string;
  avgLatencyMs: number;
  activeAgents: number;
  vendorCount: number;
  eventsPerMin: number;
  systemOperational: boolean;
  feed: LiveMonitorFeedRow[];
  agentHealth: LiveMonitorAgentHealth[];
  eventsPerAgent: LiveMonitorAgentEventCount[];
  throughput: ThroughputPoint[];
  costTimeSeries: OverviewSummary["cost_time_series"];
  latencyTrend: number[];
};

function parseTimestamp(ts: string): Date | null {
  const normalized = ts.includes("UTC") ? ts.replace(" UTC", "Z") : ts;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatRelativeTime(from: Date, now = new Date()): string {
  const diffMs = now.getTime() - from.getTime();
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return from.toLocaleDateString();
}

function mapObservationStatus(status: string): {
  label: string;
  tone: LiveMonitorFeedRow["statusTone"];
} {
  const s = status.toLowerCase();
  if (s.includes("escalat") || s.includes("fail")) {
    return { label: "FAIL", tone: "fail" };
  }
  if (s.includes("captur") || s.includes("ok") || s.includes("success")) {
    return { label: "OK", tone: "ok" };
  }
  return { label: status.slice(0, 8).toUpperCase(), tone: "warn" };
}

function mapTaskStatus(status: string): {
  label: string;
  tone: LiveMonitorFeedRow["statusTone"];
} {
  if (status === "Completed") return { label: "OK", tone: "ok" };
  if (status === "Failed") return { label: "FAIL", tone: "fail" };
  return { label: "RUN", tone: "warn" };
}

function agentNameMap(agents: AgentRegistryItem[]): Map<string, AgentRegistryItem> {
  const m = new Map<string, AgentRegistryItem>();
  for (const a of agents) {
    m.set(a.agent_id, a);
    m.set(a.name, a);
  }
  return m;
}

function displayAgentLabel(agentId: string, agents: Map<string, AgentRegistryItem>): string {
  const row = agents.get(agentId);
  return row?.name ?? agentId;
}

/** Recent-event rate — same formula as Fuzebox-aeos Live Monitor. */
export function computeEventsPerMin(timestampsMs: number[]): number {
  const times = timestampsMs.filter((t) => t > 0);
  if (times.length < 2) return 0;
  const spanMs = Math.max(...times) - Math.min(...times);
  return spanMs > 0 ? Math.round(times.length / (spanMs / 60_000)) : 0;
}

/** Live Monitor page refresh interval (matches AEOS observation poll). */
export const LIVE_MONITOR_REFRESH_SEC = 5;

function feedFromObservation(
  stream: LiveEventRow[],
  now: Date,
  agentMap: Map<string, AgentRegistryItem>,
): LiveMonitorFeedRow[] {
  return stream.map((r, i) => {
    const at = r.captured_at ? parseTimestamp(r.captured_at) : null;
    const st = mapObservationStatus(r.status);
    return {
      id: `obs-${i}-${r.agent}`,
      whenLabel: at ? formatRelativeTime(at, now) : r.time || "—",
      whenMs: at?.getTime() ?? null,
      statusLabel: st.label,
      statusTone: st.tone,
      agent: displayAgentLabel(r.agent, agentMap),
      ms: r.ms,
      cost: r.cost,
    };
  });
}

function feedFromQuality(
  quality: QualitySummary,
  latencyByAgent: Map<string, number>,
  now: Date,
  agentMap: Map<string, AgentRegistryItem>,
): LiveMonitorFeedRow[] {
  return [...(quality.tasks ?? [])]
    .sort((a, b) => {
      const da = parseTimestamp(a.timestamp)?.getTime() ?? 0;
      const db = parseTimestamp(b.timestamp)?.getTime() ?? 0;
      return db - da;
    })
    .slice(0, 30)
    .map((t, i) => {
      const at = parseTimestamp(t.timestamp);
      const st = mapTaskStatus(t.status);
      return {
        id: `task-${i}-${t.agent}`,
        whenLabel: at ? formatRelativeTime(at, now) : t.timestamp,
        whenMs: at?.getTime() ?? null,
        statusLabel: st.label,
        statusTone: st.tone,
        agent: displayAgentLabel(t.agent, agentMap),
        ms: latencyByAgent.get(t.agent) ?? null,
        cost: null,
      };
    });
}

export function buildLiveMonitorSnapshot(
  observation: ObservationSummary,
  overview: OverviewSummary,
  quality: QualitySummary | null,
  agents: AgentRegistryItem[],
  performance: PerformanceSummary | null,
  days: number,
  enrichedAgents: AgentEnrichedRow[] = [],
  deploymentLiveness: DeploymentLivenessInput = {},
  now = new Date(),
): LiveMonitorSnapshot {
  const agentMap = agentNameMap(agents);
  const enrichedMap = new Map(enrichedAgents.map((a) => [a.agentId, a]));
  const tenantLiveness = deriveTenantLiveness(deploymentLiveness, now);
  const latencyByAgent = new Map(
    (performance?.latency_by_agent ?? []).map((r) => [r.agent, r.mean_ms]),
  );

  const useObservation = observation.kpis.total_events > 0;
  const passed = useObservation
    ? observation.kpis.passed_count
    : (quality?.kpis.completed ?? 0);
  const total = useObservation
    ? observation.kpis.total_events
    : (quality?.kpis.total ?? 0);
  const successRatePct = useObservation
    ? observation.kpis.pass_rate_pct
    : (quality?.kpis.completed_pct ?? 0);

  const avgLatencyMs = useObservation
    ? Math.round(observation.kpis.avg_latency_ms)
    : Math.round(overview.kpis.avg_latency_ms);

  const feedFromObs = feedFromObservation(
    observation.live_stream ?? [],
    now,
    agentMap,
  );
  const feedFromTasks = quality
    ? feedFromQuality(quality, latencyByAgent, now, agentMap)
    : [];
  const feedSource = feedFromObs.length > 0 ? feedFromObs : feedFromTasks;

  const seen = new Set<string>();
  const feed: LiveMonitorFeedRow[] = [];
  for (const row of feedSource) {
    const key = `${row.agent}-${row.whenMs ?? row.whenLabel}-${row.statusLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    feed.push(row);
    if (feed.length >= 30) break;
  }

  const eventsPerMin = computeEventsPerMin(
    feed.map((r) => r.whenMs).filter((t): t is number => t != null),
  );

  const eventCounts = new Map<string, { ok: number; total: number; lastMs: number }>();
  for (const row of feed) {
    const cur = eventCounts.get(row.agent) ?? { ok: 0, total: 0, lastMs: 0 };
    cur.total += 1;
    if (row.statusTone === "ok") cur.ok += 1;
    if (row.whenMs && row.whenMs > cur.lastMs) cur.lastMs = row.whenMs;
    eventCounts.set(row.agent, cur);
  }

  if (quality?.tasks) {
    for (const t of quality.tasks) {
      const cur = eventCounts.get(t.agent) ?? { ok: 0, total: 0, lastMs: 0 };
      cur.total += 1;
      if (t.status === "Completed") cur.ok += 1;
      const at = parseTimestamp(t.timestamp);
      if (at && at.getTime() > cur.lastMs) cur.lastMs = at.getTime();
      eventCounts.set(t.agent, cur);
    }
  }

  const agentHealth: LiveMonitorAgentHealth[] = agents
    .filter((a) => a.status === "active")
    .map((a) => {
      const stats = eventCounts.get(a.agent_id) ?? eventCounts.get(a.name) ?? {
        ok: 0,
        total: 0,
        lastMs: 0,
      };
      const passPct =
        stats.total > 0
          ? Math.round((stats.ok / stats.total) * 1000) / 10
          : null;
      const lastLabel =
        stats.lastMs > 0
          ? formatRelativeTime(new Date(stats.lastMs), now)
          : "no recent activity";
      const avgMs =
        latencyByAgent.get(a.agent_id) ??
        latencyByAgent.get(a.name) ??
        0;
      return {
        agentId: a.agent_id,
        name: a.name,
        model: a.model_name || "—",
        vendor: formatVendorLabel(a.vendor || "—"),
        events: stats.total,
        avgMs: Math.round(avgMs),
        passPct,
        lastLabel,
        sigma: sigmaFromEnriched(a.agent_id, enrichedMap, a.status),
        ...tenantLiveness,
      };
    })
    .sort((a, b) => b.events - a.events);

  const resolveAgentId = (key: string): string => {
    const byId = agentMap.get(key);
    if (byId) return byId.agent_id;
    for (const a of agents) {
      if (a.name === key) return a.agent_id;
    }
    return key;
  };

  const eventsPerAgent: LiveMonitorAgentEventCount[] = [...eventCounts.entries()]
    .map(([agent, stats]) => ({
      agentId: resolveAgentId(agent),
      agent,
      label: displayAgentLabel(agent, agentMap),
      count: stats.total,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const vendorCount =
    observation.by_vendor.length > 0
      ? observation.by_vendor.length
      : new Set(agents.map((a) => a.vendor).filter(Boolean)).size;

  const failedTasks = quality?.kpis.failed ?? 0;
  const systemOperational =
    failedTasks === 0 &&
    observation.kpis.human_review_queued === 0 &&
    successRatePct >= 95;

  const latencyTrend = (overview.throughput ?? [])
    .map((p) => p.avg_latency_ms)
    .filter((v) => v > 0);

  return {
    windowLabel: daysToTimeRangeLabel(days),
    eventsObserved: total,
    successRatePct,
    successFraction: `${passed} / ${total}`,
    avgLatencyMs,
    activeAgents:
      agents.filter((a) => a.status === "active").length ||
      overview.kpis.active_agents,
    vendorCount,
    eventsPerMin,
    systemOperational,
    feed,
    agentHealth,
    eventsPerAgent,
    throughput: overview.throughput?.length
      ? overview.throughput
      : (performance?.throughput ?? []),
    costTimeSeries: overview.cost_time_series ?? [],
    latencyTrend,
  };
}

export function filterLiveMonitor(
  snapshot: LiveMonitorSnapshot,
  query: string,
): LiveMonitorSnapshot {
  const q = query.trim().toLowerCase();
  if (!q) return snapshot;
  return {
    ...snapshot,
    feed: snapshot.feed.filter(
      (r) =>
        r.agent.toLowerCase().includes(q) ||
        r.statusLabel.toLowerCase().includes(q),
    ),
    agentHealth: snapshot.agentHealth.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.agentId.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q),
    ),
  };
}
