import { fetchObservationCoverage } from "@/lib/api";
import { daysToTimeRangeLabel } from "@/lib/format";
import type { ObservationCoverageRow } from "@/lib/types";

export type CoverageStatusFilter = "all" | "covered" | "degraded" | "gap";

export type CoverageManifestSummary = {
  registered: number;
  covered: number;
  degraded: number;
  gaps: number;
  vendorCount: number;
  captureRatePct: number;
};

export type CoverageVendorGroup = {
  hyperscaler: string;
  surfaces: { surface: string; status: string }[];
};

export type CoverageManifestData = {
  days: number;
  windowLabel: string;
  rows: ObservationCoverageRow[];
  summary: CoverageManifestSummary;
  vendors: CoverageVendorGroup[];
};

export function buildCoverageSummary(
  rows: ObservationCoverageRow[],
): CoverageManifestSummary {
  const covered = rows.filter((r) => r.status === "covered").length;
  const degraded = rows.filter((r) => r.status === "degraded").length;
  const gaps = rows.filter((r) => r.status === "gap").length;
  const vendorCount = new Set(rows.map((r) => r.hyperscaler)).size;
  const captureRatePct =
    rows.length > 0
      ? Math.round(((covered + degraded) / rows.length) * 1000) / 10
      : 0;

  return {
    registered: rows.length,
    covered,
    degraded,
    gaps,
    vendorCount,
    captureRatePct,
  };
}

export function buildVendorGroups(
  rows: ObservationCoverageRow[],
): CoverageVendorGroup[] {
  const map = new Map<string, { surface: string; status: string }[]>();
  for (const row of rows) {
    const list = map.get(row.hyperscaler) ?? [];
    list.push({ surface: row.surface, status: row.status });
    map.set(row.hyperscaler, list);
  }
  return [...map.entries()]
    .map(([hyperscaler, surfaces]) => ({
      hyperscaler,
      surfaces: surfaces.sort((a, b) => a.surface.localeCompare(b.surface)),
    }))
    .sort((a, b) => a.hyperscaler.localeCompare(b.hyperscaler));
}

export async function loadCoverageManifestData(
  days: number,
): Promise<CoverageManifestData> {
  const rows = await fetchObservationCoverage(days);
  return {
    days,
    windowLabel: daysToTimeRangeLabel(days),
    rows,
    summary: buildCoverageSummary(rows),
    vendors: buildVendorGroups(rows),
  };
}

export function filterCoverageManifest(
  data: CoverageManifestData,
  query: string,
  status: CoverageStatusFilter,
): {
  rows: ObservationCoverageRow[];
  vendors: CoverageVendorGroup[];
} {
  let rows = data.rows;

  if (status !== "all") {
    rows = rows.filter((r) => r.status === status);
  }

  const q = query.trim().toLowerCase();
  if (q) {
    rows = rows.filter((r) => {
      const hay = [
        r.hyperscaler,
        r.surface,
        r.status,
        r.signature ?? "",
        r.lastTelemetryAt ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const vendors = buildVendorGroups(rows);
  return { rows, vendors };
}

export function statusTone(
  status: string,
): "ok" | "warn" | "fail" | "muted" {
  if (status === "covered") return "ok";
  if (status === "degraded") return "warn";
  if (status === "gap") return "fail";
  return "muted";
}
