"use client";

import { useEffect } from "react";
import { ChartPanel } from "@/components/ui/ChartPanel";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import {
  formatCapabilityLabel,
  formatCoverageStatus,
  formatVendorLabel,
} from "@/lib/agent-labels";
import type {
  LiveEventRow,
  ObservationCoverageRow,
  VendorBreakdownRow,
} from "@/lib/types";

function eventInputTokens(row: {
  input_tokens?: number;
  inputTokens?: number;
}): number {
  return row.input_tokens ?? row.inputTokens ?? 0;
}

function eventOutputTokens(row: {
  output_tokens?: number;
  outputTokens?: number;
}): number {
  return row.output_tokens ?? row.outputTokens ?? 0;
}

function eventTotalTokens(row: {
  tokens?: number;
  input_tokens?: number;
  inputTokens?: number;
  output_tokens?: number;
  outputTokens?: number;
}): number {
  if (typeof row.tokens === "number" && row.tokens > 0) {
    return row.tokens;
  }
  return eventInputTokens(row) + eventOutputTokens(row);
}

export function VendorBreakdownTable({ rows }: { rows: VendorBreakdownRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ChartPanel
      title="Capture distribution by vendor"
      subtitle="Event mix, tokens, latency, and economic routing metrics."
    >
      <DataTable className="shadow-none">
        <DataTableHead>
          <tr>
            <th className="fb-data-table-cell">Vendor</th>
            <th className="fb-data-table-cell text-right">Events</th>
            <th className="fb-data-table-cell text-right">% mix</th>
            <th className="fb-data-table-cell text-right">Input tokens</th>
            <th className="fb-data-table-cell text-right">Output tokens</th>
            <th className="fb-data-table-cell text-right">Tokens</th>
            <th className="fb-data-table-cell text-right">Avg ms</th>
            <th className="fb-data-table-cell text-right">Spend</th>
            <th className="fb-data-table-cell text-right">Saved</th>
            <th className="fb-data-table-cell text-right">MER</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.vendor}>
              <DataTableCell className="font-medium">
                {formatVendorLabel(r.vendor)}
              </DataTableCell>
              <DataTableCell align="right">{r.events}</DataTableCell>
              <DataTableCell align="right">{r.mix_pct}%</DataTableCell>
              <DataTableCell align="right">
                {eventInputTokens(r).toLocaleString()}
              </DataTableCell>
              <DataTableCell align="right">
                {eventOutputTokens(r).toLocaleString()}
              </DataTableCell>
              <DataTableCell align="right">
                {eventTotalTokens(r).toLocaleString()}
              </DataTableCell>
              <DataTableCell align="right">{r.avg_ms}</DataTableCell>
              <DataTableCell align="right">${r.spend.toFixed(4)}</DataTableCell>
              <DataTableCell align="right">${r.saved.toFixed(4)}</DataTableCell>
              <DataTableCell align="right">{r.mer}</DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </ChartPanel>
  );
}

export function LiveEventStreamTable({
  rows,
  subtitle = "Most recent canonical events across capture surfaces.",
  highlightEventId = "",
}: {
  rows: LiveEventRow[];
  subtitle?: string;
  highlightEventId?: string;
}) {
  useEffect(() => {
    if (!highlightEventId) return;
    const el = document.getElementById(`op-event-${highlightEventId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightEventId, rows]);

  if (rows.length === 0) {
    return (
      <ChartPanel
        title="Live event stream"
        subtitle={subtitle}
      >
        <DataTable
          className="shadow-none"
          empty={{
            title: "No events",
            message: "No events in the live stream for this range.",
          }}
        >
          <tbody />
        </DataTable>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel
      title="Live event stream"
      subtitle={subtitle}
    >
      <DataTable className="shadow-none">
        <DataTableHead>
          <tr>
            <th className="fb-data-table-cell">Time</th>
            <th className="fb-data-table-cell">Vendor</th>
            <th className="fb-data-table-cell">Agent ID</th>
            <th className="fb-data-table-cell">Model</th>
            <th className="fb-data-table-cell text-right">Input tokens</th>
            <th className="fb-data-table-cell text-right">Output tokens</th>
            <th className="fb-data-table-cell text-right">Tokens</th>
            <th className="fb-data-table-cell text-right">Ms</th>
            <th className="fb-data-table-cell text-right">Cost</th>
            <th className="fb-data-table-cell text-right">Saved</th>
            <th className="fb-data-table-cell">Status</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r, i) => {
            const highlighted =
              Boolean(highlightEventId) && r.eventId === highlightEventId;
            return (
            <DataTableRow
              key={r.eventId ?? `${r.time}-${r.agent}-${i}`}
              id={highlighted ? `op-event-${r.eventId}` : undefined}
              className={
                highlighted
                  ? "bg-[var(--alert-warning-bg)] ring-1 ring-[var(--alert-warning-border)]"
                  : ""
              }
            >
              <DataTableCell className="font-mono text-xs">{r.time}</DataTableCell>
              <DataTableCell>{formatVendorLabel(r.vendor)}</DataTableCell>
              <DataTableCell className="font-mono text-xs">
                {r.agentId ?? r.agent}
              </DataTableCell>
              <DataTableCell className="font-mono text-xs">{r.model}</DataTableCell>
              <DataTableCell align="right">
                {eventInputTokens(r).toLocaleString()}
              </DataTableCell>
              <DataTableCell align="right">
                {eventOutputTokens(r).toLocaleString()}
              </DataTableCell>
              <DataTableCell align="right">
                {eventTotalTokens(r).toLocaleString()}
              </DataTableCell>
              <DataTableCell align="right">{r.ms}</DataTableCell>
              <DataTableCell align="right">${r.cost.toFixed(4)}</DataTableCell>
              <DataTableCell align="right">${r.saved.toFixed(4)}</DataTableCell>
              <DataTableCell>
                <span
                  className={
                    r.status === "Escalated"
                      ? "text-[var(--alert-error-text)]"
                      : "text-[var(--alert-success-text)]"
                  }
                >
                  {r.status}
                </span>
              </DataTableCell>
            </DataTableRow>
            );
          })}
        </DataTableBody>
      </DataTable>
    </ChartPanel>
  );
}

export function CoverageManifestTable({ rows }: { rows: VendorBreakdownRow[] }) {
  return (
    <ChartPanel
      title="Coverage manifest"
      subtitle="Health of each capture surface in the observation plane."
    >
      <DataTable className="shadow-none">
        <DataTableHead>
          <tr>
            <th className="fb-data-table-cell">Capture surface</th>
            <th className="fb-data-table-cell text-right">Events</th>
            <th className="fb-data-table-cell">Health</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={r.vendor}>
              <DataTableCell className="font-medium">
                {formatVendorLabel(r.vendor)}
              </DataTableCell>
              <DataTableCell align="right">{r.events}</DataTableCell>
              <DataTableCell className="text-brand-muted">{r.health}</DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </ChartPanel>
  );
}

function truncateHash(value: string, head = 24): string {
  const v = value.trim();
  if (!v) return "genesis";
  if (v.length <= head) return v;
  return `${v.slice(0, head)}…`;
}

export function AuditChainProof({
  auditHash,
  prevEventHash,
  latestEventId,
}: {
  auditHash: string;
  prevEventHash?: string;
  latestEventId?: string;
}) {
  const prevLabel = truncateHash(prevEventHash ?? "");
  const hasChain = Boolean(auditHash && auditHash !== "—");

  return (
    <div className="fb-card-accent-top min-w-0 p-4 sm:p-6">
      <ChartPanel
        title="Audit chain proof"
        subtitle="HMAC-SHA256 signatures link each canonical event to the previous one."
      >
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <div className="min-w-0 rounded-lg border border-brand-border bg-[var(--surface-muted)] p-4">
            <p className="fb-text-caption mb-2 uppercase tracking-wide">
              Most recent audit hash
            </p>
            <pre className="fb-code max-w-full overflow-x-auto whitespace-pre-wrap break-all px-4 py-3 font-mono text-xs">
              {auditHash || "—"}
            </pre>
            <p className="mt-2 text-xs text-brand-muted">
              Previous link ·{" "}
              <span className="break-all font-mono">{prevLabel}</span>
            </p>
            {latestEventId ? (
              <p className="mt-1 text-xs text-brand-muted">
                Canonical event ·{" "}
                <span className="break-all font-mono">{latestEventId}</span>
              </p>
            ) : null}
          </div>
          <div className="min-w-0 rounded-lg border border-brand-border bg-[var(--surface-muted)] p-4">
            <p className="fb-text-caption mb-2 uppercase tracking-wide">
              Chain properties
            </p>
            <ul className="space-y-1.5 text-sm text-brand-muted">
              <li>Each event is signed with HMAC-SHA256 over the canonical payload.</li>
              <li>Retroactive edits break downstream hashes in the chain.</li>
              <li>
                {hasChain
                  ? "Hash shown is the latest event in your selected window — not an agent or user ID."
                  : "Run tasks to populate the audit chain."}
              </li>
            </ul>
          </div>
        </div>
      </ChartPanel>
    </div>
  );
}

export function ObservationCoverageTable({
  rows,
}: {
  rows: ObservationCoverageRow[];
}) {
  if (rows.length === 0) {
    return (
      <ChartPanel
        title="Coverage manifest"
        subtitle="Capture surface health per hyperscaler and transport."
      >
        <p className="text-sm text-brand-muted">
          No capture surfaces reported in this window.
        </p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel
      title="Coverage manifest"
      subtitle="Capture surface health per hyperscaler and transport."
    >
      <DataTable className="shadow-none">
        <DataTableHead>
          <tr>
            <th className="fb-data-table-cell">Hyperscaler</th>
            <th className="fb-data-table-cell">Surface</th>
            <th className="fb-data-table-cell">Status</th>
            <th className="fb-data-table-cell">Activated</th>
            <th className="fb-data-table-cell">Last telemetry</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow key={`${r.hyperscaler}-${r.surface}`}>
              <DataTableCell className="text-sm">
                {formatVendorLabel(r.hyperscaler)}
              </DataTableCell>
              <DataTableCell className="text-sm">
                {formatCapabilityLabel(r.surface)}
              </DataTableCell>
              <DataTableCell>
                <span
                  className={
                    r.status === "covered"
                      ? "text-[var(--alert-success-text)]"
                      : r.status === "degraded"
                        ? "text-[var(--alert-warning-text)]"
                        : "text-[var(--alert-error-text)]"
                  }
                >
                  {formatCoverageStatus(r.status)}
                </span>
              </DataTableCell>
              <DataTableCell className="font-mono text-xs text-brand-muted">
                {r.activatedAt
                  ? new Date(r.activatedAt).toLocaleString()
                  : "—"}
              </DataTableCell>
              <DataTableCell className="font-mono text-xs text-brand-muted">
                {r.lastTelemetryAt
                  ? new Date(r.lastTelemetryAt).toLocaleString()
                  : "—"}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </ChartPanel>
  );
}
