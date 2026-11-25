"use client";

import { useMemo, useState } from "react";
import { FilterChipGroup } from "@/components/ui/FilterChipGroup";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { ChartPanel } from "@/components/ui/ChartPanel";
import type {
  CoverageManifestData,
  CoverageStatusFilter,
} from "@/lib/coverage-manifest";
import {
  formatCapabilityLabel,
  formatCoverageStatus,
  formatVendorLabel,
} from "@/lib/agent-labels";
import { filterCoverageManifest, statusTone } from "@/lib/coverage-manifest";
import { useShellScrollChain } from "@/lib/scroll-chain";
import type { ObservationCoverageRow } from "@/lib/types";

const STATUS_FILTERS: { id: CoverageStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "covered", label: "Covered" },
  { id: "degraded", label: "Degraded" },
  { id: "gap", label: "Gaps" },
];

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  const className =
    tone === "ok"
      ? "text-[var(--alert-success-text)]"
      : tone === "warn"
        ? "text-[var(--alert-warning-text)]"
        : tone === "fail"
          ? "text-[var(--alert-error-text)]"
          : "text-brand-muted";
  return <span className={className}>{formatCoverageStatus(status)}</span>;
}

function formatTelemetry(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function ManifestTable({ rows }: { rows: ObservationCoverageRow[] }) {
  const scrollRef = useShellScrollChain();

  if (rows.length === 0) {
    return (
      <ChartPanel
        title="Per-surface health"
        subtitle="Signed capture surfaces and last telemetry in range."
      >
        <p className="text-sm text-brand-muted">No surfaces match your filters.</p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel
      title="Per-surface health"
      subtitle={`${rows.length} registered surface${rows.length === 1 ? "" : "s"}`}
    >
      <div ref={scrollRef} className="fb-cov-table-scroll">
        <DataTable className="shadow-none">
          <DataTableHead>
            <tr>
              <th className="fb-data-table-cell">Hyperscaler</th>
              <th className="fb-data-table-cell">Surface</th>
              <th className="fb-data-table-cell">Status</th>
              <th className="fb-data-table-cell">Activated</th>
              <th className="fb-data-table-cell">Last telemetry</th>
              <th className="fb-data-table-cell">Signature</th>
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
                  <StatusBadge status={r.status} />
                </DataTableCell>
                <DataTableCell className="text-xs text-brand-muted">
                  {formatTelemetry(r.activatedAt)}
                </DataTableCell>
                <DataTableCell className="text-xs text-brand-muted">
                  {formatTelemetry(r.lastTelemetryAt)}
                </DataTableCell>
                <DataTableCell className="font-mono text-[10px] text-brand-muted">
                  {r.signature ? `${r.signature.slice(0, 14)}…` : "—"}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      </div>
    </ChartPanel>
  );
}

function VendorGrid({
  vendors,
}: {
  vendors: CoverageManifestData["vendors"];
}) {
  if (vendors.length === 0) {
    return (
      <p className="text-sm text-brand-muted">No vendor groups in this filter.</p>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {vendors.map((v) => (
        <div
          key={v.hyperscaler}
          className="rounded-lg border border-brand-border bg-brand-card p-4"
        >
          <p className="text-sm font-semibold text-brand-ink">
            {formatVendorLabel(v.hyperscaler)}
          </p>
          <ul className="mt-2 space-y-1.5">
            {v.surfaces.map((s) => (
              <li
                key={s.surface}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-brand-ink">
                  {formatCapabilityLabel(s.surface)}
                </span>
                <StatusBadge status={s.status} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function CoverageManifestDashboard({
  data,
}: {
  data: CoverageManifestData;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CoverageStatusFilter>("all");
  const { summary } = data;

  const filtered = useMemo(
    () => filterCoverageManifest(data, search, statusFilter),
    [data, search, statusFilter],
  );

  return (
    <div className="space-y-4">
      <div className="fb-card-accent-top px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
        <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Registered surfaces"
            value={String(summary.registered)}
            sub={`across ${summary.vendorCount} vendor${summary.vendorCount === 1 ? "" : "s"}`}
            size="lg"
          />
          <KpiCard
            label="Fully covered"
            value={String(summary.covered)}
            sub="active telemetry in window"
            size="lg"
          />
          <KpiCard
            label="Degraded"
            value={String(summary.degraded)}
            sub="stale or partial signal"
            size="lg"
          />
          <KpiCard
            label="Gaps"
            value={String(summary.gaps)}
            sub="no events on surface"
            size="lg"
          />
        </KpiGrid>
        <p className="mt-4 text-sm text-brand-muted">
          {summary.captureRatePct}% of registered surfaces reported telemetry in{" "}
          {data.windowLabel.toLowerCase()}. Rows come from the signed coverage manifest
          merged with live canonical events.
        </p>
      </div>

      <div>
        <label className="sr-only" htmlFor="cov-search">
          Search coverage manifest
        </label>
        <input
          id="cov-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search vendor, surface, status…"
          className="fb-input mb-3 w-full max-w-sm text-sm"
        />
        <FilterChipGroup
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={setStatusFilter}
          className="mb-4"
        />
        <ManifestTable rows={filtered.rows} />
      </div>

      <ChartPanel
        title="Hyperscaler coverage map"
        subtitle="Capture mechanisms grouped by vendor."
      >
        <VendorGrid vendors={filtered.vendors} />
      </ChartPanel>
    </div>
  );
}
