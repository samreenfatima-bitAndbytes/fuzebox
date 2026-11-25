import {
  ApiError,
  fetchAgents,
  fetchObservationCoverage,
  fetchObservationEvents,
  fetchObservationSummary,
} from "@/lib/api";
import {
  buildAgentNameMap,
  formatVendorLabel,
  resolveAgentLabel,
} from "@/lib/agent-labels";
import { daysToTimeRangeLabel } from "@/lib/format";
import { computeEventsPerMin } from "@/lib/live-monitor";
import type {
  LiveEventRow,
  ObservationCoverageRow,
  ObservationEventRow,
  ObservationKpis,
  ObservationSummary,
  VendorBreakdownRow,
} from "@/lib/types";

export type ObservationPlaneTab =
  | "overview"
  | "events"
  | "coverage-audit";

export type ObservationPlaneMeta = {
  throughputPerHour: number;
  captureGaps: number;
  captureRatePct: number;
  eventCount: number;
};

export type ObservationPlaneAuditChain = {
  auditHash: string;
  prevEventHash: string;
  latestEventId: string;
};

export type ObservationPlaneSnapshot = {
  days: number;
  windowLabel: string;
  kpis: ObservationKpis;
  meta: ObservationPlaneMeta;
  byVendor: VendorBreakdownRow[];
  coverage: ObservationCoverageRow[];
  events: LiveEventRow[];
  audit: ObservationPlaneAuditChain;
  warnings: string[];
  /** Registry id → display name (for agent filter labels). */
  agentNames: Map<string, string>;
};

export type ObservationPlaneFiltered = {
  byVendor: VendorBreakdownRow[];
  coverage: ObservationCoverageRow[];
  events: LiveEventRow[];
};

function parseTimestamp(ts: string): number | null {
  const d = new Date(ts.includes("UTC") ? ts.replace(" UTC", "Z") : ts);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 8) || "—";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function observationEventTokens(
  ev: ObservationEventRow & {
    total_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  },
): number {
  if (typeof ev.totalTokens === "number" && ev.totalTokens > 0) {
    return ev.totalTokens;
  }
  if (typeof ev.total_tokens === "number" && ev.total_tokens > 0) {
    return ev.total_tokens;
  }
  const input =
    ev.inputTokens ?? ev.input_tokens ?? 0;
  const output =
    ev.outputTokens ?? ev.output_tokens ?? 0;
  return Number(input) + Number(output);
}

function normalizeLiveEventRow(
  row: LiveEventRow & {
    inputTokens?: number;
    outputTokens?: number;
    event_id?: string;
  },
): LiveEventRow {
  const input = row.input_tokens ?? row.inputTokens ?? 0;
  const output = row.output_tokens ?? row.outputTokens ?? 0;
  const eventId = row.eventId ?? row.event_id ?? undefined;
  return {
    ...row,
    eventId,
    input_tokens: input,
    output_tokens: output,
    tokens: row.tokens || input + output,
  };
}

export function observationEventToLiveRow(
  ev: ObservationEventRow,
  agentNames: Map<string, string> = new Map(),
): LiveEventRow {
  const agentId = ev.agentId || "—";
  return normalizeLiveEventRow({
    time: formatEventTime(ev.capturedAt),
    captured_at: ev.capturedAt,
    eventId: ev.eventId,
    agentId: agentId !== "—" ? agentId : undefined,
    vendor: formatVendorLabel(ev.hyperscaler || "unknown"),
    agent: resolveAgentLabel(agentId, agentNames),
    model: ev.model?.trim() || "—",
    input_tokens: ev.inputTokens ?? 0,
    output_tokens: ev.outputTokens ?? 0,
    tokens: observationEventTokens(ev),
    ms: ev.wallMs,
    cost: ev.vendorCostUsd,
    saved: Math.max(0, 0.25 - ev.vendorCostUsd),
    status: ev.passedThresholds ? "Captured" : "Escalated",
  });
}

function buildMeta(
  summary: ObservationSummary,
  events: LiveEventRow[],
): ObservationPlaneMeta {
  const timestamps = events
    .map((e) => parseTimestamp(e.captured_at ?? ""))
    .filter((t): t is number => t != null);
  const perMin = computeEventsPerMin(timestamps);
  const gaps = summary.by_vendor.filter(
    (v) => v.health.toLowerCase().includes("no coverage") || v.events === 0,
  ).length;
  const totalSurfaces = summary.by_vendor.length;
  const captureRatePct =
    totalSurfaces > 0
      ? Math.round(((totalSurfaces - gaps) / totalSurfaces) * 1000) / 10
      : summary.kpis.active_surfaces > 0
        ? 100
        : 0;

  return {
    throughputPerHour: Math.round(perMin * 60 * 10) / 10,
    captureGaps: gaps,
    captureRatePct,
    eventCount: Math.max(summary.kpis.total_events, events.length),
  };
}

export async function loadObservationPlaneSnapshot(
  days: number,
): Promise<ObservationPlaneSnapshot> {
  const warnings: string[] = [];

  const [summaryRes, eventsRes, coverageRes, agentsRes] = await Promise.allSettled([
    fetchObservationSummary(days, 100),
    fetchObservationEvents(days, 500),
    fetchObservationCoverage(days),
    fetchAgents(),
  ]);

  const agentNames =
    agentsRes.status === "fulfilled"
      ? buildAgentNameMap(agentsRes.value)
      : new Map<string, string>();

  if (summaryRes.status !== "fulfilled") {
    throw new ApiError(
      summaryRes.reason instanceof ApiError
        ? summaryRes.reason.message
        : "Failed to load observation summary",
      500,
    );
  }

  const summary = summaryRes.value;

  let apiEvents: ObservationEventRow[] = [];
  if (eventsRes.status === "fulfilled") {
    apiEvents = eventsRes.value;
  } else {
    warnings.push(
      eventsRes.reason instanceof ApiError
        ? eventsRes.reason.message
        : "Full event ledger unavailable — showing summary stream",
    );
  }

  const eventsFromApi = apiEvents.map((e) =>
    observationEventToLiveRow(e, agentNames),
  );
  const events =
    eventsFromApi.length > 0
      ? eventsFromApi.sort((a, b) => {
          const ta = parseTimestamp(a.captured_at ?? "") ?? 0;
          const tb = parseTimestamp(b.captured_at ?? "") ?? 0;
          return tb - ta;
        })
      : summary.live_stream.map(normalizeLiveEventRow);

  let coverage: ObservationCoverageRow[] = [];
  if (coverageRes.status === "fulfilled") {
    coverage = coverageRes.value;
  } else {
    warnings.push(
      coverageRes.reason instanceof ApiError
        ? coverageRes.reason.message
        : "Coverage manifest unavailable — using vendor summary",
    );
    coverage = summary.by_vendor.map((v) => ({
      hyperscaler: v.vendor,
      surface: "task_completion",
      status: v.events > 0 ? "covered" : "gap",
      activatedAt: null,
      lastTelemetryAt: null,
      signedAt: null,
      signature: null,
    }));
  }

  const meta = buildMeta(summary, events);

  return {
    days: summary.days,
    windowLabel: daysToTimeRangeLabel(days),
    kpis: summary.kpis,
    meta,
    byVendor: summary.by_vendor,
    coverage,
    events,
    audit: {
      auditHash: summary.audit_hash,
      prevEventHash: summary.prev_event_hash ?? "",
      latestEventId: summary.latest_event_id ?? "",
    },
    warnings,
    agentNames,
  };
}

export function filterEventsByAgent(
  events: LiveEventRow[],
  agentId: string,
): LiveEventRow[] {
  const q = agentId.trim().toLowerCase();
  if (!q) return events;
  return events.filter((e) => {
    const id = (e.agentId ?? "").toLowerCase();
    const label = e.agent.toLowerCase();
    return id === q || label === q || id.includes(q) || label.includes(q);
  });
}

export function filterObservationPlane(
  snapshot: ObservationPlaneSnapshot,
  query: string,
): ObservationPlaneFiltered {
  const q = query.trim().toLowerCase();
  if (!q) {
    return {
      byVendor: snapshot.byVendor,
      coverage: snapshot.coverage,
      events: snapshot.events,
    };
  }

  const byVendor = snapshot.byVendor.filter((v) =>
    v.vendor.toLowerCase().includes(q),
  );

  const coverage = snapshot.coverage.filter((c) => {
    const hay = [c.hyperscaler, c.surface, c.status]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  const events = snapshot.events.filter((e) => {
    const hay = [
      e.agent,
      e.agentId ?? "",
      e.eventId ?? "",
      e.vendor,
      e.model,
      e.status,
      e.time,
      e.captured_at ?? "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return { byVendor, coverage, events };
}
