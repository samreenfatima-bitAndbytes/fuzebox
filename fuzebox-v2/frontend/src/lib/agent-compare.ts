import {
  buildAgentMetricMap,
  estimateMer,
  lookupAgentMetrics,
} from "@/lib/agent-enrichment";
import { sigmaFromSuccessRate } from "@/lib/trust-tier";
import type {
  AgentEnrichedRow,
  AgentRegistryItem,
  CostByAgentRow,
  EconomicsSummary,
  LatencyAgentRow,
  LeaderboardRow,
  ObservationRegistryRow,
  PerformanceSummary,
} from "@/lib/types";

export const COMPARE_DIMENSIONS = [
  { id: "quality", label: "Quality", higherBetter: true },
  { id: "reliability", label: "Reliability", higherBetter: true },
  { id: "speed", label: "Speed", higherBetter: true },
  { id: "cost", label: "Cost Efficiency", higherBetter: true },
  { id: "volume", label: "Volume", higherBetter: true },
  { id: "consistency", label: "Consistency", higherBetter: true },
] as const;

export type CompareDimensionId = (typeof COMPARE_DIMENSIONS)[number]["id"];

export type AgentCompareMetrics = {
  agentId: string;
  name: string;
  model: string;
  vendor: string;
  sigma: number;
  sigmaLabel: string;
  dpmo: number;
  successPct: number;
  costPerRunUsd: number;
  avgLatencyMs: number;
  totalRuns: number;
  avgQuality: number;
  merEstimate: number | null;
  p90LatencyMs: number | null;
  radar: Record<CompareDimensionId, number>;
};

export type DimensionVerdict = "a" | "b" | "tie";

export type AgentCompareResult = {
  agentA: AgentCompareMetrics;
  agentB: AgentCompareMetrics;
  winnerId: string | null;
  winnerName: string | null;
  winsA: number;
  winsB: number;
  dimensionVerdicts: Record<CompareDimensionId, DimensionVerdict>;
  dimensionLabels: Record<
    CompareDimensionId,
    { label: string; detail: string }
  >;
};

function findLeaderboard(
  agent: AgentRegistryItem,
  rows: LeaderboardRow[],
): LeaderboardRow | undefined {
  return rows.find(
    (r) => r.agent === agent.name || r.agent === agent.agent_id,
  );
}

function findLatency(
  agent: AgentRegistryItem,
  rows: LatencyAgentRow[],
): LatencyAgentRow | undefined {
  return rows.find(
    (r) => r.agent === agent.name || r.agent === agent.agent_id,
  );
}

function findCost(
  agent: AgentRegistryItem,
  rows: CostByAgentRow[],
): CostByAgentRow | undefined {
  return rows.find(
    (r) => r.agent === agent.name || r.agent === agent.agent_id,
  );
}

function findObservation(
  agentId: string,
  rows: ObservationRegistryRow[],
): ObservationRegistryRow | undefined {
  return rows.find((r) => r.agentId === agentId);
}

function normalizeRate(rate: number): number {
  if (rate > 1) return rate / 100;
  return Math.max(0, Math.min(1, rate));
}

function buildRadarScores(
  successRate: number,
  avgQuality: number,
  avgLatencyMs: number,
  costPerRunUsd: number,
  totalRuns: number,
  fleet: {
    maxLatency: number;
    maxCost: number;
    maxRuns: number;
  },
): Record<CompareDimensionId, number> {
  const latCap = Math.max(fleet.maxLatency, 1, avgLatencyMs);
  const costCap = Math.max(fleet.maxCost, 0.0001, costPerRunUsd);
  const runCap = Math.max(fleet.maxRuns, 1, totalRuns);

  const speed = 100 * (1 - avgLatencyMs / latCap);
  const costEff = 100 * (1 - costPerRunUsd / costCap);
  const volume = 100 * (totalRuns / runCap);
  const consistency = successRate * avgQuality * 100;

  return {
    quality: Math.round(avgQuality * 1000) / 10,
    reliability: Math.round(successRate * 1000) / 10,
    speed: Math.round(Math.max(0, speed) * 10) / 10,
    cost: Math.round(Math.max(0, costEff) * 10) / 10,
    volume: Math.round(Math.max(0, volume) * 10) / 10,
    consistency: Math.round(Math.min(100, consistency) * 10) / 10,
  };
}

export function buildAgentCompareMetrics(
  agent: AgentRegistryItem,
  performance: PerformanceSummary | null,
  registry: ObservationRegistryRow[],
  economics: EconomicsSummary | null,
  fleetCaps: { maxLatency: number; maxCost: number; maxRuns: number },
  slice?: ReturnType<typeof lookupAgentMetrics>,
): AgentCompareMetrics {
  const lb = performance
    ? findLeaderboard(agent, performance.leaderboard)
    : undefined;
  const lat = performance
    ? findLatency(agent, performance.latency_by_agent)
    : undefined;
  const cost = economics ? findCost(agent, economics.cost_by_agent) : undefined;
  const obs = findObservation(agent.agent_id, registry);

  const totalRuns =
    lb?.tasks ?? obs?.totalRuns ?? lat?.tasks ?? 0;
  const successRate = normalizeRate(
    lb?.success_rate ?? obs?.successRate ?? 0,
  );
  const avgQuality = lb?.avg_quality ?? 0;
  const avgLatencyMs = Math.round(
    lat?.mean_ms ?? lb?.avg_latency_ms ?? 0,
  );
  const costPerRunUsd =
    slice?.cuowUsd ??
    (totalRuns > 0 && lb
      ? lb.total_cost_usd / totalRuns
      : (cost?.avg_cost_per_task_usd ?? 0));

  const avgQualityResolved = slice?.avgQuality ?? avgQuality;
  const merEstimate =
    slice?.merEstimate ??
    estimateMer(successRate, avgQualityResolved, costPerRunUsd || null);
  const p90LatencyMs =
    slice?.p90LatencyMs ??
    (lat ? Math.round(lat.p90_ms) : null);

  const sigma = successRate * 4.1;
  const dpmo = Math.round((1 - successRate) * 1_000_000);

  return {
    agentId: agent.agent_id,
    name: agent.name,
    model: (agent.model_name || "unknown").trim() || "unknown",
    vendor: (agent.vendor || "unknown").trim() || "unknown",
    sigma,
    sigmaLabel: sigmaFromSuccessRate(successRate),
    dpmo,
    successPct: Math.round(successRate * 1000) / 10,
    costPerRunUsd,
    avgLatencyMs,
    totalRuns,
    avgQuality: avgQualityResolved,
    merEstimate,
    p90LatencyMs,
    radar: buildRadarScores(
      successRate,
      avgQualityResolved,
      avgLatencyMs,
      costPerRunUsd,
      totalRuns,
      fleetCaps,
    ),
  };
}

function fleetCapsFromMetrics(
  items: AgentCompareMetrics[],
): { maxLatency: number; maxCost: number; maxRuns: number } {
  return {
    maxLatency: Math.max(3000, ...items.map((m) => m.avgLatencyMs)),
    maxCost: Math.max(0.001, ...items.map((m) => m.costPerRunUsd)),
    maxRuns: Math.max(1, ...items.map((m) => m.totalRuns)),
  };
}

export function buildAgentCompareMetricsFromEnriched(
  agent: AgentEnrichedRow,
  fleetCaps: { maxLatency: number; maxCost: number; maxRuns: number },
): AgentCompareMetrics {
  const successRate = Math.max(0, Math.min(1, agent.success / 100));
  const avgLatencyMs = Math.round(agent.avgWallMs ?? 0);
  const costPerRunUsd = agent.costPerRun ?? agent.cuow ?? 0;
  const totalRuns = agent.runs ?? 0;
  const avgQuality = successRate;
  const merEstimate = agent.mer ?? estimateMer(successRate, avgQuality, costPerRunUsd || null);
  const sigma = agent.sigma ?? successRate * 4.1;
  const dpmo = Math.round((1 - successRate) * 1_000_000);

  return {
    agentId: agent.agentId,
    name: agent.name,
    model: (agent.model || "unknown").trim() || "unknown",
    vendor: (agent.vendor || agent.hyperscaler || "unknown").trim() || "unknown",
    sigma,
    sigmaLabel: sigmaFromSuccessRate(successRate, totalRuns),
    dpmo,
    successPct: agent.success,
    costPerRunUsd,
    avgLatencyMs,
    totalRuns,
    avgQuality,
    merEstimate,
    p90LatencyMs: agent.p95Latency ?? null,
    radar: buildRadarScores(
      successRate,
      avgQuality,
      avgLatencyMs,
      costPerRunUsd,
      totalRuns,
      fleetCaps,
    ),
  };
}

export function buildAllCompareMetricsFromEnriched(
  enriched: AgentEnrichedRow[],
): AgentCompareMetrics[] {
  const preliminary = enriched.map((a) =>
    buildAgentCompareMetricsFromEnriched(a, {
      maxLatency: 30000,
      maxCost: 1,
      maxRuns: 1,
    }),
  );
  const caps = fleetCapsFromMetrics(preliminary);
  return enriched.map((a) => buildAgentCompareMetricsFromEnriched(a, caps));
}

export function enrichedToRegistryItem(agent: AgentEnrichedRow): AgentRegistryItem {
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

export function buildAllCompareMetrics(
  agents: AgentRegistryItem[],
  performance: PerformanceSummary | null,
  registry: ObservationRegistryRow[],
  economics: EconomicsSummary | null,
): AgentCompareMetrics[] {
  const metricMap = buildAgentMetricMap(
    agents,
    registry,
    performance,
    economics,
  );
  const preliminary = agents.map((a) =>
    buildAgentCompareMetrics(a, performance, registry, economics, {
      maxLatency: 30000,
      maxCost: 1,
      maxRuns: 1,
    }, metricMap.get(a.agent_id)),
  );
  const caps = fleetCapsFromMetrics(preliminary);
  return agents.map((a) =>
    buildAgentCompareMetrics(
      a,
      performance,
      registry,
      economics,
      caps,
      metricMap.get(a.agent_id),
    ),
  );
}

const TIE_EPS = 1.5;

function compareHigher(
  aVal: number,
  bVal: number,
): DimensionVerdict {
  if (Math.abs(aVal - bVal) <= TIE_EPS) return "tie";
  return aVal > bVal ? "a" : "b";
}

function formatVerdictDetail(
  id: CompareDimensionId,
  verdict: DimensionVerdict,
  a: AgentCompareMetrics,
  b: AgentCompareMetrics,
): string {
  if (verdict === "tie") return "tied";

  const winner = verdict === "a" ? a : b;
  const loser = verdict === "a" ? b : a;

  if (id === "speed") {
    if (loser.avgLatencyMs <= 0) return `${verdict.toUpperCase()} wins`;
    const pct = Math.round(
      ((loser.avgLatencyMs - winner.avgLatencyMs) / loser.avgLatencyMs) * 100,
    );
    return `${verdict.toUpperCase()} +${Math.max(0, pct)}%`;
  }
  if (id === "cost") {
    if (loser.costPerRunUsd <= 0) return `${verdict.toUpperCase()} wins`;
    const pct = Math.round(
      ((loser.costPerRunUsd - winner.costPerRunUsd) / loser.costPerRunUsd) *
        100,
    );
    return `${verdict.toUpperCase()} +${Math.max(0, pct)}%`;
  }
  if (id === "volume") {
    const diff = winner.totalRuns - loser.totalRuns;
    return `${verdict.toUpperCase()} +${diff}`;
  }

  const w = winner.radar[id];
  const l = loser.radar[id];
  if (l <= 0) return `${verdict.toUpperCase()} wins`;
  const pct = Math.round(((w - l) / l) * 100);
  return `${verdict.toUpperCase()} +${Math.max(0, pct)}%`;
}

export function compareAgents(
  agentA: AgentCompareMetrics,
  agentB: AgentCompareMetrics,
): AgentCompareResult {
  const dimensionVerdicts = {} as Record<CompareDimensionId, DimensionVerdict>;
  let winsA = 0;
  let winsB = 0;

  for (const dim of COMPARE_DIMENSIONS) {
    const v = compareHigher(agentA.radar[dim.id], agentB.radar[dim.id]);
    dimensionVerdicts[dim.id] = v;
    if (v === "a") winsA += 1;
    else if (v === "b") winsB += 1;
  }

  const dimensionLabels = {} as AgentCompareResult["dimensionLabels"];
  for (const dim of COMPARE_DIMENSIONS) {
    dimensionLabels[dim.id] = {
      label: dim.label,
      detail: formatVerdictDetail(
        dim.id,
        dimensionVerdicts[dim.id],
        agentA,
        agentB,
      ),
    };
  }

  let winnerId: string | null = null;
  let winnerName: string | null = null;
  if (winsA > winsB) {
    winnerId = agentA.agentId;
    winnerName = agentA.name;
  } else if (winsB > winsA) {
    winnerId = agentB.agentId;
    winnerName = agentB.name;
  }

  return {
    agentA,
    agentB,
    winnerId,
    winnerName,
    winsA,
    winsB,
    dimensionVerdicts,
    dimensionLabels,
  };
}

export function formatUsd(value: number): string {
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

export function formatDpmo(value: number): string {
  return value.toLocaleString("en-US");
}

export function pickComparePair(
  agents: AgentRegistryItem[],
  paramA: string | null,
  paramB: string | null,
): [string, string] {
  const ids = new Set(agents.map((a) => a.agent_id));
  const fallback =
    agents.length < 2
      ? [agents[0]?.agent_id ?? "", agents[0]?.agent_id ?? ""]
      : [agents[0].agent_id, agents[1].agent_id];

  let a = paramA && ids.has(paramA) ? paramA : fallback[0];
  let b = paramB && ids.has(paramB) ? paramB : fallback[1];
  if (a === b) {
    const other = agents.find((x) => x.agent_id !== a);
    b = other?.agent_id ?? b;
  }
  return [a, b];
}

export function filterCompareAgentOptions(
  agents: AgentRegistryItem[],
  query: string,
): AgentRegistryItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter(
    (a) =>
      a.name.toLowerCase().includes(q) ||
      a.agent_id.toLowerCase().includes(q) ||
      (a.model_name || "").toLowerCase().includes(q) ||
      (a.vendor || "").toLowerCase().includes(q),
  );
}

export type CompareOverviewStats = {
  winsA: number;
  winsB: number;
  ties: number;
  leaderName: string | null;
  leaderDetail: string;
};

export function buildCompareOverview(
  result: AgentCompareResult | null,
): CompareOverviewStats | null {
  if (!result) return null;
  const ties = COMPARE_DIMENSIONS.filter(
    (d) => result.dimensionVerdicts[d.id] === "tie",
  ).length;
  let leaderName: string | null = null;
  let leaderDetail = "Even on radar dimensions";
  if (result.winnerId) {
    leaderName = result.winnerName;
    const wins =
      result.winnerId === result.agentA.agentId ? result.winsA : result.winsB;
    leaderDetail = `Leads ${wins} of 6 dimensions`;
  }
  return {
    winsA: result.winsA,
    winsB: result.winsB,
    ties,
    leaderName,
    leaderDetail,
  };
}
