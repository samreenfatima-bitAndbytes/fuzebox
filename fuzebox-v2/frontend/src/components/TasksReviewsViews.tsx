"use client";

import { useCallback, useMemo, useState } from "react";
import { QualityKpiGrid } from "@/components/QualityKpiGrid";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { FilterChipGroup } from "@/components/ui/FilterChipGroup";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { useShellScrollChain } from "@/lib/scroll-chain";
import {
  ADVANCE_MIN,
  HITL_HI,
  HITL_LO,
  TASK_STATUS_FILTERS,
  aiScoreDisplay,
  buildTasksReviewsStats,
  isHitlBand,
  isReviewPending,
  reviewDecisionLabel,
  sortReviewsForQueue,
  submitReviewDecision,
  type TaskStatusFilter,
  type TasksReviewsData,
} from "@/lib/tasks-reviews";
import type { GovernanceReview, QualityTaskRow } from "@/lib/types";

const TR_TABS = [
  { id: "overview" as const, label: "Overview" },
  { id: "tasks" as const, label: "Tasks" },
  { id: "screening" as const, label: "Screening" },
  { id: "reviews" as const, label: "Reviews" },
];

function TaskStatusBadge({ status }: { status: string }) {
  const styles =
    status === "Completed"
      ? "text-[var(--alert-success-text)]"
      : status === "Failed"
        ? "text-[var(--alert-error-text)]"
        : "text-[var(--alert-warning-text)]";
  return <span className={`text-xs font-medium ${styles}`}>{status}</span>;
}

function ReviewDecisionBadge({ review }: { review: GovernanceReview }) {
  const label = reviewDecisionLabel(review);
  const className =
    label === "Advance"
      ? "text-[var(--alert-success-text)]"
      : label === "Reject"
        ? "text-[var(--alert-error-text)]"
        : label === "Hold" || label === "Queued"
          ? "text-[var(--alert-warning-text)]"
          : "text-brand-muted";
  return <span className={`text-xs font-medium ${className}`}>{label}</span>;
}

function formatCapturedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TaskTable({
  tasks,
  total,
}: {
  tasks: QualityTaskRow[];
  total: number;
}) {
  const scrollRef = useShellScrollChain();

  if (tasks.length === 0) {
    return (
      <ChartPanel title="Task log" subtitle="Operational outcomes in range.">
        <p className="text-sm text-brand-muted">No tasks match your filters.</p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel
      title="Task log"
      subtitle={`${tasks.length} of ${total} tasks shown`}
    >
      <div ref={scrollRef} className="fb-cov-table-scroll">
        <DataTable className="shadow-none">
          <DataTableHead>
            <tr>
              <th className="fb-data-table-cell">Agent</th>
              <th className="fb-data-table-cell">Task</th>
              <th className="fb-data-table-cell">Status</th>
              <th className="fb-data-table-cell">Duration</th>
              <th className="fb-data-table-cell text-right">Time saved (m)</th>
              <th className="fb-data-table-cell">Timestamp</th>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {tasks.map((t, i) => (
              <DataTableRow key={`${t.agent}-${t.timestamp}-${i}`}>
                <DataTableCell className="font-mono text-xs">{t.agent}</DataTableCell>
                <DataTableCell className="max-w-xs truncate" title={t.task}>
                  {t.task}
                </DataTableCell>
                <DataTableCell>
                  <TaskStatusBadge status={t.status} />
                </DataTableCell>
                <DataTableCell className="text-brand-muted">{t.duration}</DataTableCell>
                <DataTableCell align="right">{t.time_saved_m}</DataTableCell>
                <DataTableCell className="whitespace-nowrap text-xs text-brand-muted">
                  {t.timestamp}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </div>
    </ChartPanel>
  );
}

type TasksReviewsDashboardProps = {
  data: TasksReviewsData;
  filteredTasks: QualityTaskRow[];
  filteredReviews: GovernanceReview[];
  statusFilter: TaskStatusFilter;
  onStatusFilterChange: (value: TaskStatusFilter) => void;
  onRefresh: () => void;
};

export function TasksReviewsDashboard({
  data,
  filteredTasks,
  filteredReviews,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
}: TasksReviewsDashboardProps) {
  const [tab, setTab] = useState<(typeof TR_TABS)[number]["id"]>("overview");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  const stats = useMemo(
    () =>
      buildTasksReviewsStats(
        data.quality,
        data.screening,
        data.reviews,
      ),
    [data],
  );

  const queue = useMemo(
    () => sortReviewsForQueue(filteredReviews),
    [filteredReviews],
  );

  const maxBin = useMemo(
    () => Math.max(1, ...data.screening.histogram.map((b) => b.count)),
    [data.screening.histogram],
  );

  const maxSkill = useMemo(
    () => Math.max(1, ...data.screening.skills.map((s) => s.count)),
    [data.screening.skills],
  );

  const handleDecide = useCallback(
    async (taskId: string, decision: "Advance" | "Reject") => {
      setDecidingId(taskId);
      setDecideError(null);
      try {
        await submitReviewDecision(taskId, decision);
        onRefresh();
      } catch (err) {
        setDecideError(
          err instanceof Error ? err.message : "Decision failed.",
        );
      } finally {
        setDecidingId(null);
      }
    },
    [onRefresh],
  );

  return (
    <div className="space-y-6">
      <PageTabs tabs={TR_TABS} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <PageTabPanel id="panel-tr-overview" labelledBy="tab-overview">
          <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Tasks"
              value={String(stats.totalTasks)}
              sub={`${stats.completedPct.toFixed(1)}% completed`}
              tone="positive"
            />
            <KpiCard
              label="HITL awaiting"
              value={String(stats.hitlAwaiting)}
              sub={`${HITL_LO}–${HITL_HI} score band`}
              tone="caution"
            />
            <KpiCard
              label="Review queue"
              value={String(stats.pendingReviews)}
              sub={`${stats.decidedReviews} decided`}
            />
            <KpiCard
              label="Reviewer alignment"
              value={`${stats.alignmentPct.toFixed(1)}%`}
              sub="screening window"
              tone="neutral"
            />
          </KpiGrid>

          <div className="mt-6 fb-card-accent-top px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
            <QualityKpiGrid kpis={data.quality.kpis} days={data.days} />
          </div>

          <div className="mt-6">
            <TaskTable
              tasks={filteredTasks.slice(0, 12)}
              total={data.quality.kpis.total}
            />
          </div>
        </PageTabPanel>
      )}

      {tab === "tasks" && (
        <PageTabPanel id="panel-tr-tasks" labelledBy="tab-tasks">
          <FilterChipGroup
            options={TASK_STATUS_FILTERS}
            value={statusFilter}
            onChange={onStatusFilterChange}
            ariaLabel="Task status"
          />
          <div className="mt-4">
            <TaskTable
              tasks={filteredTasks}
              total={data.quality.kpis.total}
            />
          </div>
        </PageTabPanel>
      )}

      {tab === "screening" && (
        <PageTabPanel id="panel-tr-screening" labelledBy="tab-screening">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ChartPanel
              title="Score histogram"
              subtitle={`${data.screening.totalCandidates} candidates in window`}
            >
              <ul className="flex items-end gap-1.5" role="img" aria-label="Screening histogram">
                {data.screening.histogram.map((bin) => {
                  const hitl = isHitlBand(bin.bin);
                  const heightPct = (bin.count / maxBin) * 100;
                  return (
                    <li
                      key={bin.bin}
                      className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    >
                      <span className="text-[10px] text-brand-muted">{bin.count}</span>
                      <div className="flex h-28 w-full items-end justify-center rounded bg-[var(--surface-muted)]">
                        {bin.count > 0 ? (
                          <div
                            className={`w-full max-w-[2rem] rounded-t ${
                              hitl ? "bg-[var(--alert-warning-text)]" : "bg-brand-primary"
                            }`}
                            style={{ height: `${heightPct}%` }}
                          />
                        ) : null}
                      </div>
                      <span className="text-[10px] text-brand-muted">
                        {bin.bin.replace(/–/g, "-")}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-brand-muted">
                Advance ≥ {ADVANCE_MIN} · HITL gate {HITL_LO}–{HITL_HI}
              </p>
            </ChartPanel>

            <ChartPanel
              title="HITL gate"
              subtitle="Candidates awaiting human review"
            >
              <p className="text-3xl font-semibold text-brand-ink">
                {data.screening.hitlAwaiting}
              </p>
              <p className="mt-1 text-sm text-brand-muted">
                Reviewer alignment {(data.screening.reviewerAlignment * 100).toFixed(1)}%
              </p>
            </ChartPanel>
          </div>

          <div className="mt-5">
            <ChartPanel
              title="Skill coverage"
              subtitle="Top skills in qualified pool"
            >
              {data.screening.skills.length === 0 ? (
                <p className="text-sm text-brand-muted">
                  No qualified candidates (score ≥ {ADVANCE_MIN}) in this window.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.screening.skills.map((row) => (
                    <li key={row.skill} className="flex items-center gap-3 text-sm">
                      <span className="w-28 shrink-0 truncate">{row.skill}</span>
                      <div className="h-2 min-w-0 flex-1 rounded bg-[var(--surface-muted)]">
                        <div
                          className="h-2 rounded bg-brand-primary"
                          style={{ width: `${(row.count / maxSkill) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-brand-muted">{row.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ChartPanel>
          </div>
        </PageTabPanel>
      )}

      {tab === "reviews" && (
        <PageTabPanel id="panel-tr-reviews" labelledBy="tab-reviews">
          {decideError ? (
            <p className="mb-3 text-xs text-[var(--alert-error-text)]" role="alert">
              {decideError}
            </p>
          ) : null}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ChartPanel
                title="Review queue"
                subtitle="Escalated and blocked tasks awaiting human decision"
              >
                {queue.length === 0 ? (
                  <p className="text-sm text-brand-muted">
                    No review items in this window — queue is clear.
                  </p>
                ) : (
                  <div className="fb-cov-table-scroll">
                    <DataTable className="shadow-none">
                      <DataTableHead>
                        <tr>
                          <th className="fb-data-table-cell">Context</th>
                          <th className="fb-data-table-cell">Skill</th>
                          <th className="fb-data-table-cell text-right">AI score</th>
                          <th className="fb-data-table-cell">Reviewer</th>
                          <th className="fb-data-table-cell">Decision</th>
                          <th className="fb-data-table-cell text-right">Actions</th>
                        </tr>
                      </DataTableHead>
                      <DataTableBody>
                        {queue.map((row) => {
                          const pending = isReviewPending(row);
                          const busy = decidingId === row.eventId;
                          return (
                            <DataTableRow key={row.eventId}>
                              <DataTableCell
                                className="font-mono text-xs"
                                title={row.agentId}
                              >
                                {row.agentId.length > 22
                                  ? `${row.agentId.slice(0, 21)}…`
                                  : row.agentId}
                              </DataTableCell>
                              <DataTableCell className="text-sm">{row.skill}</DataTableCell>
                              <DataTableCell align="right" className="font-semibold">
                                {aiScoreDisplay(row.confidence)}
                              </DataTableCell>
                              <DataTableCell className="text-sm">
                                {pending ? "—" : row.reviewerName}
                              </DataTableCell>
                              <DataTableCell>
                                <ReviewDecisionBadge review={row} />
                              </DataTableCell>
                              <DataTableCell align="right">
                                {pending ? (
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className="fb-btn text-xs"
                                      disabled={busy}
                                      onClick={() =>
                                        void handleDecide(row.eventId, "Advance")
                                      }
                                    >
                                      Advance
                                    </button>
                                    <button
                                      type="button"
                                      className="fb-btn text-xs text-[var(--alert-error-text)]"
                                      disabled={busy}
                                      onClick={() =>
                                        void handleDecide(row.eventId, "Reject")
                                      }
                                    >
                                      Reject
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-brand-muted">
                                    {formatCapturedAt(row.capturedAt)}
                                  </span>
                                )}
                              </DataTableCell>
                            </DataTableRow>
                          );
                        })}
                      </DataTableBody>
                    </DataTable>
                  </div>
                )}
              </ChartPanel>
            </div>

            <ChartPanel
              title="Reviewer performance"
              subtitle="Alignment with AI recommendation"
            >
              {data.performance.length === 0 ? (
                <p className="text-sm text-brand-muted">No reviewer stats yet.</p>
              ) : (
                <ul className="space-y-3">
                  {data.performance.map((p) => (
                    <li
                      key={p.name}
                      className="rounded-lg border border-[var(--border-subtle)] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{p.name}</span>
                        <span className="text-xs text-brand-muted">
                          {p.calibration}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-brand-muted">
                        {p.reviewed} reviewed · {(p.advanceRate * 100).toFixed(1)}% advance
                      </p>
                      <div className="mt-2 h-1.5 rounded bg-[var(--surface-muted)]">
                        <div
                          className="h-1.5 rounded bg-brand-primary"
                          style={{
                            width: `${Math.min(100, p.advanceRate * 100)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ChartPanel>
          </div>
        </PageTabPanel>
      )}
    </div>
  );
}
