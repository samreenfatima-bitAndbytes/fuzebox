"use client";

import { Select } from "@/components/ui/Select";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { OUTCOME_FILTER_OPTIONS } from "@/lib/constants";
import { formatRunStartedAt, tunedPillLabel } from "@/lib/format";
import type { RunReviewRunRow } from "@/lib/types";

function outcomeColor(run: RunReviewRunRow): string {
  if (run.escalated) return "#DC2626";
  if (run.result === "success") return "#2DA44E";
  return "#F59E0B";
}

export function MissionControlRunsSummary({ runs }: { runs: RunReviewRunRow[] }) {
  const total = runs.length;
  const completed = runs.filter((r) => r.result === "success").length;
  const escalated = runs.filter((r) => r.escalated).length;
  const handleRate = total ? Math.round((completed / total) * 100) : 0;

  return (
    <section className="mb-6">
      <h3 className="fb-section-title mb-3">Runs summary</h3>
      <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total runs" value={String(total)} />
        <KpiCard label="Completed" value={String(completed)} />
        <KpiCard label="Escalated" value={String(escalated)} />
        <KpiCard label="Agent handle rate" value={`${handleRate}%`} />
      </KpiGrid>
    </section>
  );
}

export function MissionControlInbox({
  runs,
  selectedId,
  statusFilter,
  searchQuery,
  onStatusFilter,
  onSearch,
  onSelect,
  onRefresh,
}: {
  runs: RunReviewRunRow[];
  selectedId: string | null;
  statusFilter: string;
  searchQuery: string;
  onStatusFilter: (v: string) => void;
  onSearch: (v: string) => void;
  onSelect: (id: string) => void;
  onRefresh: () => void;
}) {
  let filtered = runs;
  if (statusFilter === "escalated") {
    filtered = runs.filter((w) => w.escalated);
  } else if (statusFilter !== "All") {
    filtered = runs.filter((w) => w.result === statusFilter);
  }
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((w) => w.input_text.toLowerCase().includes(q));
  }
  const shown = filtered.slice(0, 60);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="fb-section-title">Runs</h3>
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs font-medium text-brand-primary hover:underline"
        >
          Refresh
        </button>
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={statusFilter}
          onChange={onStatusFilter}
          options={[...OUTCOME_FILTER_OPTIONS]}
          className="w-full min-w-0 sm:w-36 sm:shrink-0"
          aria-label="Filter runs"
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search input text…"
          className="fb-input w-full min-w-0 flex-1"
          aria-label="Search runs"
        />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
        {shown.length === 0 ? (
          <p className="text-sm text-brand-muted">No runs match your filters.</p>
        ) : (
          shown.map((run) => {
            const selected = run.workflow_id === selectedId;
            const dot = outcomeColor(run);
            return (
              <button
                key={run.workflow_id}
                type="button"
                onClick={() => onSelect(run.workflow_id)}
                className={[
                  "fb-run-row fb-run-row-stack w-full gap-2.5",
                  selected ? "fb-run-row-selected" : "",
                ].join(" ")}
              >
                <span
                  className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: dot }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-brand-muted">
                    {formatRunStartedAt(run.started_at)} ·{" "}
                    {tunedPillLabel(run.is_v2_tuned)}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-brand-ink">
                    {run.preview}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
