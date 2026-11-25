"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { PageLoading } from "@/components/ui/PageLoading";
import {
  ApiError,
  decideGovernanceReview,
  fetchGovernancePerformance,
  fetchGovernanceReviews,
} from "@/lib/api";
import type { GovernancePerformance, GovernanceReview } from "@/lib/types";

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

function truncateAgent(agentId: string, max = 22): string {
  if (agentId.length <= max) return agentId;
  return `${agentId.slice(0, max - 1)}…`;
}

function aiScore(confidence: number): number {
  const n = confidence <= 1 ? confidence * 100 : confidence;
  return Math.round(n);
}

function decisionLabel(review: GovernanceReview): string {
  const hr = review.humanReview.toLowerCase();
  if (hr === "verified") return "Advance";
  if (hr === "rejected") return "Reject";
  return "Review";
}

function isAligned(review: GovernanceReview): boolean {
  return review.humanReview.toLowerCase() === "verified";
}

function isReviewPending(review: GovernanceReview): boolean {
  const hr = review.humanReview.toLowerCase();
  return hr === "queued" || hr === "pending";
}

function sortReviewsForQueue(reviews: GovernanceReview[]): GovernanceReview[] {
  const pending = reviews.filter(isReviewPending);
  const decided = reviews.filter((r) => !isReviewPending(r));
  return [...pending, ...decided];
}

function calibrationClass(calibration: string): string {
  const c = calibration.toLowerCase();
  if (c.includes("drift")) return "fb-qt-calibration--drift";
  return "fb-qt-calibration--ok";
}

const QUEUE_PAGE_SIZE = 10;

export function QualityTeamReviews({
  days,
  highlightEventId = "",
  filterAgentId = "",
}: {
  days: number;
  highlightEventId?: string;
  filterAgentId?: string;
}) {
  const [reviews, setReviews] = useState<GovernanceReview[]>([]);
  const [performance, setPerformance] = useState<GovernancePerformance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rev, perf] = await Promise.all([
        fetchGovernanceReviews(days),
        fetchGovernancePerformance(days),
      ]);
      setReviews(rev);
      setPerformance(perf);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load team reviews",
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const queue = useMemo(() => {
    const sorted = sortReviewsForQueue(reviews);
    if (!filterAgentId) return sorted;
    return sorted.filter((row) => row.agentId === filterAgentId);
  }, [reviews, filterAgentId]);

  const totalPages = Math.max(1, Math.ceil(queue.length / QUEUE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = queue.slice(
    safePage * QUEUE_PAGE_SIZE,
    (safePage + 1) * QUEUE_PAGE_SIZE,
  );

  useEffect(() => {
    setPage(0);
  }, [filterAgentId, days]);

  useEffect(() => {
    if (!highlightEventId || queue.length === 0) return;
    const idx = queue.findIndex((r) => r.eventId === highlightEventId);
    if (idx >= 0) setPage(Math.floor(idx / QUEUE_PAGE_SIZE));
  }, [highlightEventId, queue]);

  useEffect(() => {
    if (!highlightEventId) return;
    const el = document.getElementById(`review-row-${highlightEventId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightEventId, pageRows, safePage]);

  const handleDecide = async (
    taskId: string,
    decision: "Advance" | "Reject",
  ) => {
    setDecidingId(taskId);
    setDecideError(null);
    try {
      await decideGovernanceReview(taskId, decision);
      await load();
    } catch (err) {
      setDecideError(
        err instanceof ApiError ? err.message : "Decision failed.",
      );
    } finally {
      setDecidingId(null);
    }
  };

  if (loading) {
    return <PageLoading message="Loading team reviews…" />;
  }

  if (error) {
    return (
      <Alert variant="error" role="alert">
        {error}
      </Alert>
    );
  }

  return (
    <div className="fb-qt-layout min-w-0">
      {decideError ? (
        <Alert variant="error" role="alert" className="mb-4 xl:col-span-2">
          {decideError}
        </Alert>
      ) : null}
      <section className="fb-qt-card fb-surface-panel fb-qt-queue min-w-0">
        <header className="fb-qt-card-head fb-qt-card-head--stack">
          <span className="fb-qt-eyebrow">Review queue</span>
          <h3 className="fb-qt-title">
            Escalated &amp; blocked tasks awaiting human decision
          </h3>
        </header>

        {filterAgentId ? (
          <p className="mb-3 text-xs text-brand-muted">
            Showing reviews for{" "}
            <span className="font-mono text-brand-ink">{filterAgentId}</span>
            {highlightEventId ? (
              <>
                {" "}
                · highlighting event{" "}
                <span className="font-mono text-brand-ink">{highlightEventId}</span>
              </>
            ) : null}
          </p>
        ) : null}

        {queue.length === 0 ? (
          <p className="fb-qt-empty text-sm text-brand-muted">
            {filterAgentId
              ? "No team review items for this agent in the selected window."
              : "No reviewed events in this window. Set "}
            {!filterAgentId ? (
              <>
                <code className="text-xs">ECL_API_URL</code> to pull from governance
                or ingest events with human review metadata.
              </>
            ) : null}
          </p>
        ) : (
          <div className="fb-table-scroll min-w-0 max-w-full">
            <DataTable className="fb-qt-table min-w-[52rem] shadow-none">
              <DataTableHead>
                <tr>
                  <th className="fb-data-table-cell">Candidate / context</th>
                  <th className="fb-data-table-cell">Role</th>
                  <th className="fb-data-table-cell text-right">AI score</th>
                  <th className="fb-data-table-cell">Reviewer</th>
                  <th className="fb-data-table-cell">Decision</th>
                  <th className="fb-data-table-cell">Aligned</th>
                  <th className="fb-data-table-cell text-right">Actions</th>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {pageRows.map((row) => {
                  const pending = isReviewPending(row);
                  const busy = decidingId === row.eventId;
                  const highlighted =
                    Boolean(highlightEventId) && row.eventId === highlightEventId;
                  return (
                  <DataTableRow
                    key={row.eventId}
                    id={highlighted ? `review-row-${row.eventId}` : undefined}
                    className={
                      highlighted
                        ? "bg-[var(--alert-warning-bg)] ring-1 ring-[var(--alert-warning-border)]"
                        : ""
                    }
                  >
                    <DataTableCell
                      className="font-mono text-xs"
                      title={row.agentId}
                    >
                      {truncateAgent(row.agentId)}
                    </DataTableCell>
                    <DataTableCell className="text-sm">{row.skill}</DataTableCell>
                    <DataTableCell align="right" className="font-semibold">
                      {aiScore(row.confidence)}
                    </DataTableCell>
                    <DataTableCell>
                      {pending ? "—" : row.reviewerName}
                    </DataTableCell>
                    <DataTableCell>
                      <span className="fb-qt-pill fb-qt-pill--advance">
                        {pending ? "Queued" : decisionLabel(row)}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      {pending ? (
                        <span className="fb-qt-pill fb-qt-pill--muted">—</span>
                      ) : (
                        <span
                          className={
                            isAligned(row)
                              ? "fb-qt-pill fb-qt-pill--aligned"
                              : "fb-qt-pill fb-qt-pill--muted"
                          }
                        >
                          {isAligned(row) ? "Yes" : "No"}
                        </span>
                      )}
                    </DataTableCell>
                    <DataTableCell align="right">
                      {pending ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="fb-btn text-xs"
                            disabled={busy}
                            onClick={() => void handleDecide(row.eventId, "Advance")}
                          >
                            Advance
                          </button>
                          <button
                            type="button"
                            className="fb-btn text-xs text-[var(--alert-error-text)]"
                            disabled={busy}
                            onClick={() => void handleDecide(row.eventId, "Reject")}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="whitespace-nowrap text-xs text-brand-muted">
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

        {queue.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-brand-muted">
            <span>
              Showing{" "}
              {queue.length === 0
                ? 0
                : `${safePage * QUEUE_PAGE_SIZE + 1}–${Math.min((safePage + 1) * QUEUE_PAGE_SIZE, queue.length)}`}{" "}
              of {queue.length}
            </span>
            {queue.length > QUEUE_PAGE_SIZE ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="fb-btn text-xs"
                  disabled={safePage === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span className="self-center tabular-nums">
                  Page {safePage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  className="fb-btn text-xs"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="fb-qt-side">
        <section className="fb-qt-card fb-surface-panel">
          <header className="fb-qt-card-head fb-qt-card-head--stack">
            <span className="fb-qt-eyebrow">Reviewer performance</span>
            <h3 className="fb-qt-title">Alignment with AI recommendation</h3>
          </header>

          {performance.length === 0 ? (
            <p className="fb-qt-empty text-sm text-brand-muted">
              No reviewer stats yet.
            </p>
          ) : (
            <ul className="fb-qt-perf-list">
              {performance.map((p) => (
                <li key={p.name} className="fb-qt-perf-card">
                  <div className="fb-qt-perf-head">
                    <span className="fb-qt-perf-name">{p.name}</span>
                    <span
                      className={`fb-qt-calibration ${calibrationClass(p.calibration)}`}
                      title={`Calibration · ${p.calibration}`}
                    >
                      {p.calibration}
                    </span>
                  </div>
                  <dl className="fb-qt-perf-stats">
                    <div>
                      <dt>Reviewed</dt>
                      <dd>{p.reviewed}</dd>
                    </div>
                    <div>
                      <dt>Advance rate</dt>
                      <dd>{(p.advanceRate * 100).toFixed(1)}%</dd>
                    </div>
                  </dl>
                  <div className="fb-qt-perf-bar-track">
                    <div
                      className="fb-qt-perf-bar-fill"
                      style={{ width: `${Math.min(100, p.advanceRate * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
