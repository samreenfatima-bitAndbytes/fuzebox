"use client";

import type { ReactNode } from "react";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import type { TaskStepRow } from "@/lib/types";

export function StudioWorkflowMeta({
  workflowIdShort,
  scenarioId,
  startedLabel,
}: {
  workflowIdShort: string;
  scenarioId: string | null;
  startedLabel: string;
}) {
  return (
    <div className="fb-surface-panel mb-4 flex flex-wrap gap-4 px-3 py-2.5 text-xs">
      <span>
        <span className="text-brand-muted">Workflow </span>
        <code className="font-mono text-brand-ink">{workflowIdShort}</code>
      </span>
      <span>
        <span className="text-brand-muted">Scenario </span>
        <code className="font-mono text-brand-ink">{scenarioId ?? "—"}</code>
      </span>
      <span>
        <span className="text-brand-muted">Started </span>
        {startedLabel}
      </span>
    </div>
  );
}

export function StudioTabBar<T extends string>({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={["border-b border-brand-border pb-3", className].join(" ")}>
      <PageTabs tabs={tabs} active={active} onChange={onChange} />
    </div>
  );
}

export function StudioTabPanel({
  id,
  labelledBy,
  children,
}: {
  id: string;
  labelledBy: string;
  children: ReactNode;
}) {
  return (
    <PageTabPanel id={id} labelledBy={labelledBy} className="mt-4">
      {children}
    </PageTabPanel>
  );
}

export function StudioBaselineKpis({
  totalLatencyMs,
  totalTokens,
  totalCostUsd,
  avgConfidence,
}: {
  totalLatencyMs: number;
  totalTokens: number;
  totalCostUsd: number;
  avgConfidence: number | null;
}) {
  return (
    <KpiGrid className="mt-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Total latency"
        value={`${totalLatencyMs.toFixed(0)} ms`}
        sub="Time from first to last step"
      />
      <KpiCard
        label="Tokens used"
        value={totalTokens.toLocaleString()}
        sub="All model calls combined"
      />
      <KpiCard
        label="Est. cost"
        value={`$${totalCostUsd.toFixed(5)}`}
        sub="From usage + pricing"
      />
      <KpiCard
        label="Confidence"
        value={
          avgConfidence != null
            ? `${(avgConfidence * 100).toFixed(0)}%`
            : "—"
        }
        sub="Classifier score when recorded"
      />
    </KpiGrid>
  );
}

export function StudioStepsOverviewTable({
  rows,
}: {
  rows: TaskStepRow[];
}) {
  if (rows.length === 0) return null;

  return (
    <DataTable className="mt-3 shadow-none">
      <DataTableHead>
        <tr>
          <th className="fb-data-table-cell">Step #</th>
          <th className="fb-data-table-cell">Stage</th>
          <th className="fb-data-table-cell">Agent</th>
          <th className="fb-data-table-cell">Result</th>
          <th className="fb-data-table-cell text-right">Time (ms)</th>
          <th className="fb-data-table-cell text-right">Tokens</th>
          <th className="fb-data-table-cell text-right">Cost ($)</th>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((s, i) => (
          <DataTableRow key={i}>
            <DataTableCell>{s.step_number ?? "—"}</DataTableCell>
            <DataTableCell>{s.step_name}</DataTableCell>
            <DataTableCell className="font-mono text-xs">{s.agent_id}</DataTableCell>
            <DataTableCell>{s.result}</DataTableCell>
            <DataTableCell align="right">{s.latency_ms}</DataTableCell>
            <DataTableCell align="right">{s.total_tokens}</DataTableCell>
            <DataTableCell align="right">{s.cost_usd.toFixed(5)}</DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}

export function StudioRequestPanel({ text }: { text: string }) {
  return (
    <div
      className="fb-panel rounded-lg p-4 text-sm text-brand-ink"
      role="region"
      aria-label="Original request text"
    >
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
        Incoming message
      </span>
      {text || "_not captured_"}
    </div>
  );
}
