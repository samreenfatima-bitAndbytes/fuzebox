"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { ChartPanel } from "@/components/ui/ChartPanel";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { PageLoading } from "@/components/ui/PageLoading";
import { ApiError, fetchGovernanceHistory } from "@/lib/api";
import type { GovernanceReview } from "@/lib/types";

const PAGE_SIZE = 15;

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

function aiScore(confidence: number): string {
  const n = confidence <= 1 ? confidence * 100 : confidence;
  return String(Math.round(n));
}

function decisionLabel(review: GovernanceReview): string {
  const hr = review.humanReview.toLowerCase();
  if (hr === "verified") return "Advance";
  if (hr === "rejected") return "Reject";
  return review.humanReview;
}

function decisionClass(review: GovernanceReview): string {
  const hr = review.humanReview.toLowerCase();
  if (hr === "verified") return "text-[var(--alert-success-text)]";
  if (hr === "rejected") return "text-[var(--alert-error-text)]";
  return "text-brand-muted";
}

function SummaryBadge({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: ReactNode;
}) {
  const className =
    tone === "success"
      ? "bg-[var(--badge-success-bg)] text-[var(--badge-success-text)] border-[color-mix(in_srgb,#22c55e_35%,transparent)]"
      : "bg-[var(--alert-error-bg)] text-[var(--alert-error-text)] border-[var(--alert-error-border)]";
  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export function QualityAuditHistory({ days }: { days: number }) {
  const [rows, setRows] = useState<GovernanceReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchGovernanceHistory(days));
      setPage(0);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load audit history",
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.eventId.toLowerCase().includes(q) ||
        r.skill.toLowerCase().includes(q) ||
        r.agentId.toLowerCase().includes(q) ||
        r.reviewerName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const advanceCount = rows.filter(
    (r) => r.humanReview.toLowerCase() === "verified",
  ).length;
  const rejectCount = rows.filter(
    (r) => r.humanReview.toLowerCase() === "rejected",
  ).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  if (loading) {
    return <PageLoading message="Loading audit history…" />;
  }

  if (error) {
    return (
      <Alert variant="error" role="alert">
        {error}
      </Alert>
    );
  }

  return (
    <ChartPanel
      title="Completed review decisions"
      subtitle="Advance and reject actions recorded in the selected window."
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label className="sr-only" htmlFor="audit-history-search">
            Search audit history
          </label>
          <input
            id="audit-history-search"
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search event, skill, reviewer…"
            className="fb-input w-44 shrink-0 text-sm sm:w-56"
          />
          <SummaryBadge tone="success">{advanceCount} advanced</SummaryBadge>
          <SummaryBadge tone="error">{rejectCount} rejected</SummaryBadge>
        </div>
      }
    >
      {filtered.length === 0 ? (
        <p className="text-sm text-brand-muted">
          No completed decisions yet — advance or reject items from Team Reviews
          to see them here.
        </p>
      ) : (
        <>
          <div className="fb-cov-table-scroll">
            <DataTable className="shadow-none">
              <DataTableHead>
                <tr>
                  <th className="fb-data-table-cell">Event ID</th>
                  <th className="fb-data-table-cell">Skill</th>
                  <th className="fb-data-table-cell">Reviewer</th>
                  <th className="fb-data-table-cell text-right">AI score</th>
                  <th className="fb-data-table-cell">Decision</th>
                  <th className="fb-data-table-cell text-right">Date</th>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {pageRows.map((row) => (
                  <DataTableRow key={row.eventId}>
                    <DataTableCell className="font-mono text-xs">
                      {row.eventId}
                    </DataTableCell>
                    <DataTableCell className="text-sm">{row.skill}</DataTableCell>
                    <DataTableCell className="text-sm">
                      {row.reviewerName || "system"}
                    </DataTableCell>
                    <DataTableCell align="right" className="font-semibold">
                      {aiScore(row.confidence)}
                    </DataTableCell>
                    <DataTableCell>
                      <span
                        className={`text-xs font-medium ${decisionClass(row)}`}
                      >
                        {decisionLabel(row)}
                      </span>
                    </DataTableCell>
                    <DataTableCell
                      align="right"
                      className="text-xs text-brand-muted"
                    >
                      {formatCapturedAt(row.capturedAt)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-brand-muted">
            <span>
              Showing{" "}
              {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
              {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of{" "}
              {filtered.length}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                className="fb-btn text-xs"
                disabled={safePage === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="fb-btn text-xs"
                disabled={safePage >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </ChartPanel>
  );
}
