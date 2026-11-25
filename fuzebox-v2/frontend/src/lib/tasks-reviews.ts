import {
  decideGovernanceReview,
  fetchGovernancePerformance,
  fetchGovernanceReviews,
  fetchQualitySummary,
  fetchScreeningSummary,
} from "./api";
import type {
  GovernancePerformance,
  GovernanceReview,
  QualitySummary,
  QualityTaskRow,
  ScreeningSummary,
} from "./types";

export type TaskStatusFilter = "all" | "Completed" | "Failed" | "Running";

export type TasksReviewsData = {
  days: number;
  quality: QualitySummary;
  screening: ScreeningSummary;
  reviews: GovernanceReview[];
  performance: GovernancePerformance[];
};

export const QUALITY_TAB_IDS = [
  "task",
  "ai",
  "team",
  "history",
  "agents",
  "outreach",
] as const;

export type QualityTabId = (typeof QUALITY_TAB_IDS)[number];

export function parseQualityTab(raw: string | null): QualityTabId {
  if (raw && (QUALITY_TAB_IDS as readonly string[]).includes(raw)) {
    return raw as QualityTabId;
  }
  return "task";
}

export type TasksReviewsStats = {
  totalTasks: number;
  completedPct: number;
  hitlAwaiting: number;
  pendingReviews: number;
  decidedReviews: number;
  alignmentPct: number;
};

export const TASK_STATUS_FILTERS: { id: TaskStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Completed", label: "Completed" },
  { id: "Failed", label: "Failed" },
  { id: "Running", label: "Running" },
];

export const ADVANCE_MIN = 70;
export const HITL_LO = 60;
export const HITL_HI = 70;

export function isReviewPending(review: GovernanceReview): boolean {
  const hr = review.humanReview.toLowerCase();
  return hr === "queued" || hr === "pending";
}

export function reviewDecisionLabel(review: GovernanceReview): string {
  const hr = review.humanReview.toLowerCase();
  if (hr === "verified") return "Advance";
  if (hr === "rejected") return "Reject";
  if (hr === "pending") return "Hold";
  return "Queued";
}

export function aiScoreDisplay(confidence: number): string {
  const n = confidence <= 1 ? confidence * 100 : confidence;
  return String(Math.round(n));
}

export function buildTasksReviewsStats(
  quality: QualitySummary,
  screening: ScreeningSummary,
  reviews: GovernanceReview[],
): TasksReviewsStats {
  const pending = reviews.filter(isReviewPending).length;
  const decided = reviews.length - pending;
  return {
    totalTasks: quality.kpis.total,
    completedPct: quality.kpis.completed_pct,
    hitlAwaiting: screening.hitlAwaiting,
    pendingReviews: pending,
    decidedReviews: decided,
    alignmentPct: screening.reviewerAlignment * 100,
  };
}

export async function loadTasksReviewsData(
  days: number,
): Promise<TasksReviewsData> {
  const [quality, screening, reviews, performance] = await Promise.all([
    fetchQualitySummary(days),
    fetchScreeningSummary(days),
    fetchGovernanceReviews(days),
    fetchGovernancePerformance(days),
  ]);
  return {
    days,
    quality,
    screening,
    reviews,
    performance,
  };
}

export function filterTasks(
  tasks: QualityTaskRow[],
  search: string,
  status: TaskStatusFilter,
): QualityTaskRow[] {
  let rows = tasks;
  if (status !== "all") {
    rows = rows.filter((t) => t.status === status);
  }
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (t) =>
      t.agent.toLowerCase().includes(q) ||
      t.task.toLowerCase().includes(q) ||
      t.task_type.toLowerCase().includes(q) ||
      t.status.toLowerCase().includes(q),
  );
}

export function filterReviews(
  reviews: GovernanceReview[],
  search: string,
): GovernanceReview[] {
  const q = search.trim().toLowerCase();
  if (!q) return reviews;
  return reviews.filter(
    (r) =>
      r.agentId.toLowerCase().includes(q) ||
      r.skill.toLowerCase().includes(q) ||
      r.reviewerName.toLowerCase().includes(q) ||
      r.humanReview.toLowerCase().includes(q) ||
      r.eventId.toLowerCase().includes(q),
  );
}

export function sortReviewsForQueue(
  reviews: GovernanceReview[],
): GovernanceReview[] {
  const pending = reviews.filter(isReviewPending);
  const decided = reviews.filter((r) => !isReviewPending(r));
  return [...pending, ...decided];
}

export async function submitReviewDecision(
  taskId: string,
  decision: "Advance" | "Reject" | "Hold",
) {
  return decideGovernanceReview(taskId, decision);
}

export function binStart(bin: string): number {
  const m = /^(\d+)/.exec(bin);
  return m ? parseInt(m[1], 10) : 0;
}

export function isHitlBand(bin: string): boolean {
  return binStart(bin) === HITL_LO;
}
