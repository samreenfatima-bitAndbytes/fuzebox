import { fetchOverviewSummary } from "./api";
import type { LeaderboardRow, OverviewSummary } from "./types";

export async function loadOverviewData(days: number): Promise<OverviewSummary> {
  return fetchOverviewSummary(days);
}

export function filterLeaderboard(
  rows: LeaderboardRow[],
  search: string,
): LeaderboardRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.agent.toLowerCase().includes(q) ||
      r.group.toLowerCase().includes(q) ||
      r.model.toLowerCase().includes(q),
  );
}
