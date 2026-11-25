"use client";

import { downloadCsv } from "@/lib/csv";
import { ChartPanel } from "@/components/ui/ChartPanel";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { DownloadCsvButton } from "@/components/ui/DownloadCsvButton";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import type { TraceDetail, TraceSpanRow } from "@/lib/types";

const AGENT_COLORS = [
  "#2196F3",
  "#4CAF50",
  "#FF9800",
  "#9C27B0",
  "#F44336",
  "#00BCD4",
  "#795548",
  "#607D8B",
];

function agentColorMap(spans: TraceSpanRow[]): Map<string, string> {
  const ids = [...new Set(spans.map((s) => s.agent_id))].sort();
  const map = new Map<string, string>();
  ids.forEach((id, i) => map.set(id, AGENT_COLORS[i % AGENT_COLORS.length]));
  return map;
}

export function TraceKpiGrid({ detail }: { detail: TraceDetail }) {
  return (
    <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Spans" value={String(detail.span_count)} />
      <KpiCard label="Agents" value={String(detail.agent_count)} />
      <KpiCard
        label="Root duration"
        value={`${detail.root_duration_ms.toLocaleString()} ms`}
      />
      <KpiCard
        label="Errors"
        value={String(detail.error_count)}
      />
    </KpiGrid>
  );
}

export function TraceTimeline({ detail }: { detail: TraceDetail }) {
  const maxMs = detail.timeline_max_ms || 1;
  const colors = agentColorMap(detail.spans);
  const legend = [...colors.entries()];

  return (
    <ChartPanel
      title="Trace timeline"
      subtitle="Span execution by time; ideal for presentations and debugging."
    >
      <div className="space-y-1">
        {detail.spans.map((span) => {
          const leftPct = (span.start_offset_ms / maxMs) * 100;
          const widthPct = Math.max(
            (span.duration_ms / maxMs) * 100,
            span.duration_ms > 0 ? 0.4 : 0,
          );
          const color = colors.get(span.agent_id) ?? "#999";
          const isError = span.status === "ERROR";

          return (
            <div key={span.span_id} className="flex items-center gap-2 text-xs">
              <div
                className="w-56 shrink-0 truncate font-mono text-brand-ink/90"
                style={{ paddingLeft: `${span.depth * 12}px` }}
                title={span.label}
              >
                {span.label}
              </div>
              <div className="relative h-5 flex-1 fb-track">
                <div
                  className="absolute top-0 h-full rounded"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: color,
                    opacity: isError ? 0.5 : 1,
                    outline: isError ? "2px solid #ef4444" : undefined,
                  }}
                  title={`${span.duration_ms} ms @ +${span.start_offset_ms} ms`}
                />
              </div>
              <span className="w-16 shrink-0 text-right tabular-nums text-brand-muted">
                {span.duration_ms}ms
              </span>
            </div>
          );
        })}
      </div>

      {legend.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {legend.map(([agentId, color]) => {
            const name =
              detail.spans.find((s) => s.agent_id === agentId)?.agent_name ??
              agentId;
            return (
              <span key={agentId} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                {name}
              </span>
            );
          })}
        </div>
      )}
    </ChartPanel>
  );
}

export function TraceSpansTable({ detail }: { detail: TraceDetail }) {
  const rows = detail.spans.map((s) => ({
    Operation: s.operation,
    Agent: s.agent_name,
    "Duration (ms)": s.duration_ms,
    Status: s.status,
    Attributes: s.attributes_json,
  }));

  return (
    <ChartPanel
      title="Span details"
      subtitle="Search, filter, and export span evidence."
      action={
        <DownloadCsvButton
          label="Download CSV"
          onClick={() =>
            downloadCsv(`trace_${detail.trace_id}_spans.csv`, rows)
          }
        />
      }
    >
      <DataTable className="shadow-none">
        <DataTableHead>
          <tr>
            <th className="fb-data-table-cell">Operation</th>
            <th className="fb-data-table-cell">Agent</th>
            <th className="fb-data-table-cell text-right">Duration (ms)</th>
            <th className="fb-data-table-cell">Status</th>
            <th className="fb-data-table-cell">Attributes</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {detail.spans.map((s) => (
            <DataTableRow key={s.span_id}>
              <DataTableCell className="font-mono text-xs">
                {s.operation}
              </DataTableCell>
              <DataTableCell>{s.agent_name}</DataTableCell>
              <DataTableCell align="right">{s.duration_ms}</DataTableCell>
              <DataTableCell>
                <span
                  className={
                    s.status === "ERROR"
                      ? "text-[var(--alert-error-text)]"
                      : s.status === "OK"
                        ? "text-[var(--alert-success-text)]"
                        : ""
                  }
                >
                  {s.status}
                </span>
              </DataTableCell>
              <DataTableCell
                className="max-w-xs truncate font-mono text-xs text-brand-muted"
                title={s.attributes_json}
              >
                {s.attributes_json || "—"}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </ChartPanel>
  );
}
