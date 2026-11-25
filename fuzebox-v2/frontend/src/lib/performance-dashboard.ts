import { fetchPerformanceSummary } from "./api";
import type {
  CompletionRateRow,
  LatencyAgentRow,
  LeaderboardRow,
  PerformanceSummary,
} from "./types";

export async function loadPerformanceData(
  days: number,
  granularity: string,
): Promise<PerformanceSummary> {
  return fetchPerformanceSummary(days, granularity);
}

function matchesAgentSearch(agent: string, group: string, q: string): boolean {
  return (
    agent.toLowerCase().includes(q) || group.toLowerCase().includes(q)
  );
}

export function filterLeaderboard(
  rows: LeaderboardRow[],
  search: string,
): LeaderboardRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => matchesAgentSearch(r.agent, r.group, q));
}

export function filterCompletionRates(
  rows: CompletionRateRow[],
  search: string,
): CompletionRateRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => matchesAgentSearch(r.agent, r.group, q));
}

export function filterLatencyByAgent(
  rows: LatencyAgentRow[],
  search: string,
): LatencyAgentRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.agent.toLowerCase().includes(q));
}

export function performanceOverviewStats(data: PerformanceSummary) {
  const rates = data.completion_rates;
  const avgCompletion =
    rates.length > 0
      ? rates.reduce((s, r) => s + r.completion_rate, 0) / rates.length
      : 0;
  const top = data.leaderboard[0];
  const stats = data.latency_histogram.stats;
  return {
    agentCount: rates.length,
    avgCompletionPct: avgCompletion * 100,
    topAgent: top?.agent ?? "—",
    topScore: top?.score ?? 0,
    throughputPoints: data.throughput.length,
    p50Ms: stats.p50_ms ?? 0,
    p90Ms: stats.p90_ms ?? 0,
  };
}
