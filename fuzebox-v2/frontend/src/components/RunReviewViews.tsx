"use client";

import Link from "next/link";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { formatRunStartedAt, tunedPillLabel } from "@/lib/format";
import type { AgentTelemetryRow, RunReviewRunRow } from "@/lib/types";

function outcomeColor(run: RunReviewRunRow): string {
  if (run.escalated) return "#DC2626";
  if (run.result === "success") return "#2DA44E";
  return "#F59E0B";
}

function barColor(rate: number, kind: "completion" | "escalation"): string {
  if (kind === "completion") {
    if (rate >= 0.8) return "#2DA44E";
    if (rate >= 0.6) return "#F59E0B";
    return "#DC2626";
  }
  if (rate > 0.2) return "#DC2626";
  if (rate > 0.05) return "#F59E0B";
  return "#2DA44E";
}

export function RunReviewTelemetryGrid({
  rows,
}: {
  rows: AgentTelemetryRow[];
}) {
  if (rows.length === 0) {
    return (
      <PageEmpty
        title="No telemetry yet"
        message="Agent task data appears after the pipeline processes requests."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((tel) => {
        const crColor = barColor(tel.completion_rate, "completion");
        const erColor = barColor(tel.escalation_rate, "escalation");
        return (
          <article key={tel.agent_id} className="fb-telemetry-card">
            <div>
              <h3 className="fb-section-title text-base">{tel.name}</h3>
              <span className="text-xs text-brand-muted">{tel.group}</span>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between text-xs">
                  <span>Task completion</span>
                  <span style={{ color: crColor }}>
                    {(tel.completion_rate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-2 fb-track">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, tel.completion_rate * 100)}%`,
                      backgroundColor: crColor,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span>Escalation load</span>
                  <span style={{ color: erColor }}>
                    {(tel.escalation_rate * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-2 fb-track">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.min(100, tel.escalation_rate * 100)}%`,
                      backgroundColor: erColor,
                    }}
                  />
                </div>
              </div>
            </div>
            <KpiGrid className="fb-kpi-grid-dense mt-4 grid-cols-3">
              <KpiCard
                compact
                label="Accuracy"
                value={`${(tel.accuracy * 100).toFixed(0)}%`}
              />
              <KpiCard
                compact
                label="Avg time"
                value={`${(tel.avg_latency_ms / 1000).toFixed(1)}s`}
              />
              <KpiCard compact label="AUoP" value={tel.avg_auop.toFixed(3)} />
            </KpiGrid>
          </article>
        );
      })}
    </div>
  );
}

export function RunReviewRunsList({
  runs,
  selectedId,
  statusFilter,
  searchQuery,
  onSelect,
}: {
  runs: RunReviewRunRow[];
  selectedId: string | null;
  statusFilter: string;
  searchQuery: string;
  onSelect: (id: string) => void;
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

  if (shown.length === 0) {
    return (
      <p className="text-sm text-brand-muted">No runs match your filters.</p>
    );
  }

  return (
    <div
      className="max-h-[480px] space-y-2 overflow-y-auto rounded-[14px] border border-brand-border bg-[var(--surface)] p-3 shadow-sm"
      role="region"
      aria-label="Pipeline runs list"
    >
        {shown.map((run) => {
          const selected = run.workflow_id === selectedId;
          const color = outcomeColor(run);
          return (
            <div
              key={run.workflow_id}
              className={[
                "fb-run-row",
                selected ? "fb-run-row-selected" : "",
              ].join(" ")}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs text-brand-muted">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span>{formatRunStartedAt(run.started_at)}</span>
                  <span
                    className={
                      run.is_v2_tuned ? "fb-badge-info" : "fb-badge-muted"
                    }
                  >
                    {tunedPillLabel(run.is_v2_tuned)}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm">{run.preview}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                <button
                  type="button"
                  onClick={() => onSelect(run.workflow_id)}
                  className={[
                    "fb-btn text-xs",
                    selected ? "fb-btn-primary" : "",
                  ].join(" ")}
                >
                  Open
                </button>
                <Link
                  href={`/v2-mission-control?wf=${encodeURIComponent(run.workflow_id)}`}
                  className="fb-btn text-center text-xs text-brand-primary"
                >
                  Operator view
                </Link>
              </div>
            </div>
          );
        })}
      <p className="pt-2 text-xs text-brand-muted">
        {shown.length} shown (max 60)
      </p>
    </div>
  );
}
