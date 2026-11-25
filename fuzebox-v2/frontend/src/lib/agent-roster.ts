import {
  buildAgentMetricMap,
  formatCuow,
  formatMer,
  lookupAgentMetrics,
} from "@/lib/agent-enrichment";
import type {
  AgentEnrichedRow,
  AgentRegistryItem,
  EconomicsSummary,
  ObservationRegistryRow,
  PerformanceSummary,
} from "@/lib/types";
import {
  normalizeTrustLevel,
  rosterHealthFromAgent,
  rosterStatusLabel,
  sigmaFromSuccessRate,
  formatTrustTierFromApi,
  trustTierDisplay,
  type RosterHealth,
} from "@/lib/trust-tier";
import { formatVendorLabel } from "@/lib/agent-labels";

export type AgentRosterRow = {
  agentId: string;
  name: string;
  vendor: string;
  model: string;
  trustLevel: number;
  trustTierLabel: string;
  registryStatus: string;
  sigma: string;
  health: RosterHealth;
  healthLabel: string;
  totalRuns: number;
  successRatePct: number | null;
  /** CUoW proxy from economics cost_by_agent */
  cuowLabel: string;
  /** MER estimate (success × quality / CUoW) — not equation_snapshots */
  merLabel: string;
  p90LatencyMs: number | null;
  meanLatencyMs: number | null;
};

export type AgentRosterSummary = {
  registered: number;
  green: number;
  amber: number;
  red: number;
  noRuns: number;
  passing: number;
  watch: number;
  failing: number;
  inactive: number;
  trustedT3Plus: number;
  supervisedT2: number;
  observedT0T1: number;
  byTier: Record<number, number>;
};

export type AgentRosterData = {
  rows: AgentRosterRow[];
  summary: AgentRosterSummary;
};

function observationByAgent(
  registry: ObservationRegistryRow[],
): Map<string, ObservationRegistryRow> {
  const m = new Map<string, ObservationRegistryRow>();
  for (const r of registry) {
    m.set(r.agentId, r);
    if (r.name) m.set(r.name, r);
  }
  return m;
}

function isInactiveRegistryStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "inactive" || s === "disabled" || s === "error";
}

function rosterOutcomeCounts(rows: AgentRosterRow[]) {
  const counts = {
    noRuns: 0,
    passing: 0,
    watch: 0,
    failing: 0,
    inactive: 0,
  };
  for (const r of rows) {
    if (isInactiveRegistryStatus(r.registryStatus)) {
      counts.inactive += 1;
      continue;
    }
    if (r.totalRuns <= 0) {
      counts.noRuns += 1;
      continue;
    }
    const pct = r.successRatePct ?? 0;
    if (pct >= 90) counts.passing += 1;
    else if (pct >= 70) counts.watch += 1;
    else counts.failing += 1;
  }
  return counts;
}

function buildSummary(rows: AgentRosterRow[]): AgentRosterSummary {
  const healthCounts = { green: 0, amber: 0, red: 0 };
  const byTier: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  let trustedT3Plus = 0;
  let supervisedT2 = 0;
  let observedT0T1 = 0;

  for (const r of rows) {
    healthCounts[r.health] += 1;
    byTier[r.trustLevel] = (byTier[r.trustLevel] ?? 0) + 1;
    if (r.trustLevel >= 3) trustedT3Plus += 1;
    else if (r.trustLevel === 2) supervisedT2 += 1;
    else observedT0T1 += 1;
  }

  const outcome = rosterOutcomeCounts(rows);

  return {
    registered: rows.length,
    green: healthCounts.green,
    amber: healthCounts.amber,
    red: healthCounts.red,
    ...outcome,
    trustedT3Plus,
    supervisedT2,
    observedT0T1,
    byTier,
  };
}

/** AEOS enriched GET /api/agents?enriched=1 */
export function buildAgentRosterDataFromEnriched(
  enriched: AgentEnrichedRow[],
): AgentRosterData {
  const rows: AgentRosterRow[] = enriched.map((a) => {
    const trustLevel = normalizeTrustLevel(a.trust_level ?? 0);
    const totalRuns = a.runs ?? 0;
    const successRate = totalRuns > 0 ? a.success / 100 : undefined;
    const health = rosterHealthFromAgent(a.status, successRate, totalRuns);
    return {
      agentId: a.agentId,
      name: a.name,
      vendor: formatVendorLabel(
        (a.vendor || a.hyperscaler || "—").trim() || "—",
      ),
      model: (a.model || "—").trim() || "—",
      trustLevel,
      trustTierLabel: formatTrustTierFromApi(a.trustTier, trustLevel),
      registryStatus: a.status,
      sigma: totalRuns > 0 ? String(a.sigma) : sigmaFromSuccessRate(successRate, totalRuns),
      health,
      healthLabel: rosterStatusLabel(
        a.status,
        totalRuns,
        totalRuns > 0 ? a.success : null,
      ),
      totalRuns,
      successRatePct: totalRuns > 0 ? a.success : null,
      cuowLabel: formatCuow(a.cuow ?? undefined),
      merLabel: formatMer(a.mer ?? undefined),
      p90LatencyMs: a.p95Latency ?? null,
      meanLatencyMs: a.avgWallMs ?? null,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows,
    summary: buildSummary(rows),
  };
}

export function buildAgentRosterData(
  agents: AgentRegistryItem[],
  registry: ObservationRegistryRow[],
  performance: PerformanceSummary | null = null,
  economics: EconomicsSummary | null = null,
): AgentRosterData {
  const obs = observationByAgent(registry);
  const metrics = buildAgentMetricMap(agents, registry, performance, economics);
  const rows: AgentRosterRow[] = agents.map((a) => {
    const reg = obs.get(a.agent_id) ?? obs.get(a.name);
    const slice = lookupAgentMetrics(metrics, a.agent_id);
    const successRate = reg?.successRate ?? slice?.successRate ?? null;
    const totalRuns = reg?.totalRuns ?? slice?.totalRuns ?? 0;
    const health = rosterHealthFromAgent(
      a.status,
      successRate ?? undefined,
      totalRuns,
    );
    const model = (a.model_name || "—").trim() || "—";
    const ratePct =
      totalRuns > 0 && successRate != null
        ? Math.round(
            (successRate > 1 ? successRate : successRate * 100) * 10,
          ) / 10
        : null;
    return {
      agentId: a.agent_id,
      name: a.name,
      vendor: (a.vendor || "—").trim() || "—",
      model,
      trustLevel: normalizeTrustLevel(a.trust_level),
      trustTierLabel: trustTierDisplay(a.trust_level),
      registryStatus: a.status,
      sigma: sigmaFromSuccessRate(successRate ?? undefined, totalRuns),
      health,
      healthLabel: rosterStatusLabel(a.status, totalRuns, ratePct),
      totalRuns,
      successRatePct: ratePct,
      cuowLabel: formatCuow(slice?.cuowUsd),
      merLabel: formatMer(slice?.merEstimate),
      p90LatencyMs: slice?.p90LatencyMs ?? null,
      meanLatencyMs: slice?.meanLatencyMs ?? null,
    };
  });

  rows.sort((a, b) => a.name.localeCompare(b.name));

  return {
    rows,
    summary: buildSummary(rows),
  };
}

export type RosterTierFilter = "all" | "0" | "1" | "2" | "3" | "4";

/** @deprecated Use RosterTierFilter */
export type RosterHealthFilter = "all" | RosterHealth;

export function filterAgentRoster(
  data: AgentRosterData,
  query: string,
  tierFilter: RosterTierFilter = "all",
): AgentRosterData {
  const q = query.trim().toLowerCase();
  let rows = data.rows;

  if (tierFilter !== "all") {
    const tier = Number(tierFilter);
    rows = rows.filter((r) => r.trustLevel === tier);
  }
  if (q) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.agentId.toLowerCase().includes(q) ||
        r.vendor.toLowerCase().includes(q) ||
        r.model.toLowerCase().includes(q) ||
        r.trustTierLabel.toLowerCase().includes(q) ||
        r.registryStatus.toLowerCase().includes(q),
    );
  }

  return { rows, summary: data.summary };
}
