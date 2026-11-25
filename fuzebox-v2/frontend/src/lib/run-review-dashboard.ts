import { fetchRunReviewSummary } from "./api";
import type { RunReviewSummary } from "./types";

export async function loadRunReviewData(): Promise<RunReviewSummary> {
  return fetchRunReviewSummary();
}

export function runReviewStats(data: RunReviewSummary) {
  const success = data.runs.filter((r) => r.result === "success").length;
  const escalated = data.runs.filter((r) => r.escalated).length;
  return {
    totalRuns: data.runs.length,
    success,
    escalated,
    telemetryAgents: data.telemetry.length,
  };
}
