/**
 * Client-side agent metrics composed from existing v2 APIs (no enriched GET /api/agents).
 * CUoW / MER are estimates; ABT / CTR / TV need equation_snapshots (not in v2 DB yet).
 */

import type {
  AgentRegistryItem,
  CostByAgentRow,
  EconomicsSummary,
  LatencyAgentRow,
  LeaderboardRow,
  ObservationRegistryRow,
  PerformanceSummary,
} from "@/lib/types";

export type AgentMetricSlice = {
  totalRuns: number;
  successRate: number | null;
  avgQuality: number | null;
  meanLatencyMs: number | null;
  p90LatencyMs: number | null;
  cuowUsd: number | null;
  merEstimate: number | null;
};

function matchAgentRow<T extends { agent: string }>(
  agent: AgentRegistryItem,
  rows: T[],
): T | undefined {
  return rows.find(
    (r) => r.agent === agent.agent_id || r.agent === agent.name,
  );
}

export function estimateMer(
  successRate: number | null,
  avgQuality: number | null,
  cuowUsd: number | null,
): number | null {
  if (cuowUsd == null || cuowUsd <= 0) return null;
  const conf = successRate ?? 0;
  const quality = avgQuality ?? 0;
  if (conf <= 0 && quality <= 0) return null;
  const signal = conf * (quality > 0 ? quality : 1);
  return Math.round((signal / cuowUsd) * 10) / 10;
}

export function buildAgentMetricMap(
  agents: AgentRegistryItem[],
  registry: ObservationRegistryRow[],
  performance: PerformanceSummary | null,
  economics: EconomicsSummary | null,
): Map<string, AgentMetricSlice> {
  const regById = new Map(registry.map((r) => [r.agentId, r]));
  const regByName = new Map(registry.map((r) => [r.name, r]));
  const leaderboard = performance?.leaderboard ?? [];
  const latency = performance?.latency_by_agent ?? [];
  const costs = economics?.cost_by_agent ?? [];

  const map = new Map<string, AgentMetricSlice>();

  for (const agent of agents) {
    const reg =
      regById.get(agent.agent_id) ?? regByName.get(agent.name);
    const lb = matchAgentRow(agent, leaderboard);
    const lat = matchAgentRow(agent, latency);
    const cost = matchAgentRow(agent, costs);

    const totalRuns = reg?.totalRuns ?? lb?.tasks ?? lat?.tasks ?? cost?.tasks ?? 0;
    let successRate: number | null = reg?.successRate ?? lb?.success_rate ?? null;
    if (successRate != null && successRate > 1) successRate = successRate / 100;

    const avgQuality = lb?.avg_quality ?? null;
    const cuowUsd = cost?.avg_cost_per_task_usd ?? null;
    const meanLatencyMs = lat?.mean_ms ?? lb?.avg_latency_ms ?? null;
    const p90LatencyMs = lat?.p90_ms ?? null;

    map.set(agent.agent_id, {
      totalRuns,
      successRate,
      avgQuality,
      meanLatencyMs: meanLatencyMs != null ? Math.round(meanLatencyMs) : null,
      p90LatencyMs: p90LatencyMs != null ? Math.round(p90LatencyMs) : null,
      cuowUsd,
      merEstimate: estimateMer(successRate, avgQuality, cuowUsd),
    });
  }

  return map;
}

export function lookupAgentMetrics(
  map: Map<string, AgentMetricSlice>,
  agentId: string,
): AgentMetricSlice | undefined {
  return map.get(agentId);
}

export function formatCuow(usd: number | null | undefined): string {
  if (usd == null || usd <= 0) return "—";
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

export function formatMer(mer: number | null | undefined): string {
  if (mer == null || mer <= 0) return "—";
  return mer.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
