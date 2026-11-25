import { fetchTaskScorecards } from "./api";
import type { AccuracyByTypeRow, ScorecardRow, TaskScorecardsSummary } from "./types";

export async function loadTaskScorecardsData(
  days: number,
  group: string,
): Promise<TaskScorecardsSummary> {
  return fetchTaskScorecards(days, group);
}

export function filterScorecardRows(
  rows: ScorecardRow[],
  search: string,
): ScorecardRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.agent.toLowerCase().includes(q) ||
      r.group.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q) ||
      r.issues.toLowerCase().includes(q),
  );
}

export function filterAccuracyRows(
  rows: AccuracyByTypeRow[],
  search: string,
): AccuracyByTypeRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.task_type.toLowerCase().includes(q));
}

export function scorecardOverviewStats(data: TaskScorecardsSummary) {
  const pass = data.rows.filter((r) => r.status === "PASS").length;
  const fail = data.rows.filter((r) => r.status === "FAIL").length;
  const avgSuccess =
    data.rows.length > 0
      ? data.rows.reduce((s, r) => s + r.success_rate, 0) / data.rows.length
      : 0;
  return {
    totalAgents: data.rows.length,
    pass,
    fail,
    avgSuccessPct: avgSuccess * 100,
    typeCount: data.accuracy_by_type.length,
  };
}
