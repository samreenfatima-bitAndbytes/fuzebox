import { storage } from "./storage";

/** One workflow (or untagged bucket) for "Add an Agent" scenario inputs. */
export type ScenariosProcess = {
  id: string;
  /** Human-readable label (UoP name, humanized workflow_id, or bucket title). */
  name: string;
  /** Raw workflow_id from telemetry when tagged; null for untagged / synthetic buckets. */
  workflowId: string | null;
  /** Most-seen agent in this workflow (registry name when available). */
  suggestedAgentName: string | null;
  baseCoverage: number;
  baseRoi: number;
  eventCount: number;
};

/** Tenant-level headcount / ROI anchors from telemetry + ledger. */
export type ScenariosHeadcount = {
  baseHeadcount: number;
  weeklySalary: number;
  baseRoi: number;
  humanReviewQueued: number;
  observationDays: number;
};

/** Per-agent volume scenario inputs from registry + events. */
export type ScenariosAgentVolume = {
  id: string;
  name: string;
  baseCost: number;
  baseRuns: number;
  weeklyRoi: number;
  setup: number;
};

export type ScenariosBaseline = {
  tenantId: string;
  processes: ScenariosProcess[];
  headcount: ScenariosHeadcount;
  agents: ScenariosAgentVolume[];
  meta: {
    eventCount: number;
    weeklyNetUsd: number;
    eventQualityPassRate: number;
    surfaceCoverageRatio: number | null;
    source: "database";
  };
};

function humanizeWorkflowKey(key: string, rawIdForDisplay: string): string {
  if (key === "_untagged") return "Untagged workflows";
  if (key === "_empty") return "No telemetry yet";
  const s = rawIdForDisplay.replace(/[-_]+/g, " ").trim();
  if (!s) return key;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function topAgentIdInWorkflow(
  events: { workflowId: string | null; agentId: string }[],
  wfKey: string,
): string | undefined {
  const counts = new Map<string, number>();
  for (const e of events) {
    const raw = (e.workflowId ?? "").trim();
    const key = raw.length > 0 ? raw : "_untagged";
    if (key !== wfKey) continue;
    counts.set(e.agentId, (counts.get(e.agentId) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestN = 0;
  for (const [aid, n] of Array.from(counts.entries())) {
    if (n > bestN) {
      bestN = n;
      best = aid;
    }
  }
  return best;
}

function observationSpanDays(capturedAts: string[]): number {
  if (capturedAts.length === 0) return 1;
  const ms = capturedAts.map((s) => new Date(s).getTime()).filter((n) => !Number.isNaN(n));
  if (ms.length === 0) return 1;
  const span = (Math.max(...ms) - Math.min(...ms)) / 86400000;
  return Math.max(1, Math.min(365, span || 1));
}

/**
 * Baseline numbers for the What-If Scenarios page — derived from canonical events,
 * agent registry, and coverage (no hardcoded demo catalogs).
 */
export async function getScenariosBaseline(tenantId: string): Promise<ScenariosBaseline> {
  const [events, agents, coverage, uops] = await Promise.all([
    storage.listCanonicalEvents(tenantId, 8000),
    storage.listAgents(tenantId),
    storage.listCoverage(tenantId),
    storage.listUoPLibrary(tenantId),
  ]);

  const wfToUopName = new Map<string, string>();
  for (const u of uops) {
    const w = u.workflowId?.trim();
    if (!w || wfToUopName.has(w)) continue;
    wfToUopName.set(w, u.name);
  }

  const registryAgentName = new Map(agents.map((a) => [a.agentId, (a.name || "").trim() || a.agentId]));

  const days = observationSpanDays(events.map((e) => e.capturedAt));
  const weekScale = 7 / days;

  const totalSaved = events.reduce((s, e) => s + (e.laborValueSavedUsd ?? 0), 0);
  const totalCost = events.reduce((s, e) => s + (e.amortizedCostUsd ?? 0), 0);
  const netAll = totalSaved - totalCost;
  const weeklyNetUsd = netAll * weekScale;

  const passed = events.filter((e) => e.passedThresholds).length;
  const coveragePassRate = events.length ? passed / events.length : 0;

  const queued = events.filter((e) => e.humanReview === "queued").length;

  // --- Processes: group by workflow_id (string from events)
  const byWf = new Map<
    string,
    { saved: number; cost: number; n: number; passed: number; label: string }
  >();
  for (const e of events) {
    const raw = (e.workflowId ?? "").trim();
    const key = raw.length > 0 ? raw : "_untagged";
    const label = raw.length > 0 ? raw : "Untagged workflow_id";
    const cur = byWf.get(key) ?? { saved: 0, cost: 0, n: 0, passed: 0, label };
    cur.saved += e.laborValueSavedUsd ?? 0;
    cur.cost += e.amortizedCostUsd ?? 0;
    cur.n += 1;
    if (e.passedThresholds) cur.passed += 1;
    cur.label = label;
    byWf.set(key, cur);
  }

  let processes: ScenariosProcess[] = Array.from(byWf.entries())
    .map(([id, g]) => {
      const passRate = g.n ? g.passed / g.n : coveragePassRate;
      const baseCoverage = Math.min(0.98, Math.max(0.08, passRate));
      const net = g.saved - g.cost;
      const baseRoi = Math.max(0, net * weekScale);
      const rawWf = id === "_untagged" ? "" : g.label;
      const uopTitle = rawWf ? wfToUopName.get(rawWf) : undefined;
      const name = uopTitle ?? humanizeWorkflowKey(id, rawWf || id);
      const topAid = topAgentIdInWorkflow(events, id);
      const suggestedAgentName = topAid
        ? registryAgentName.get(topAid) ?? humanizeWorkflowKey(topAid, topAid)
        : null;
      return {
        id,
        name,
        workflowId: rawWf.length > 0 ? rawWf : null,
        suggestedAgentName,
        baseCoverage,
        baseRoi,
        eventCount: g.n,
      };
    })
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 24);

  if (processes.length === 0) {
    processes = [
      {
        id: "_empty",
        name: "No canonical events yet",
        workflowId: null,
        suggestedAgentName: null,
        baseCoverage: 0.35,
        baseRoi: 0,
        eventCount: 0,
      },
    ];
  }

  // --- Headcount: staffing proxy from review queue + registry size
  const nAgents = agents.length;
  const baseHeadcount = Math.max(
    6,
    Math.min(80, Math.ceil(queued * 2.5 + nAgents * 3 + 8)),
  );

  const hourlySamples = events
    .map((e) => e.manualHourlyCostUsd)
    .filter((x): x is number => typeof x === "number" && x > 0);
  const avgHourly =
    hourlySamples.length > 0
      ? hourlySamples.reduce((a, b) => a + b, 0) / hourlySamples.length
      : 42;
  const weeklySalary = Math.round(avgHourly * 40);

  const baseRoi = Math.max(0, weeklyNetUsd);

  // --- Agents for volume scenario: registry + per-agent net from events
  const byAgentEvents = new Map<string, { saved: number; cost: number; n: number }>();
  for (const e of events) {
    const cur = byAgentEvents.get(e.agentId) ?? { saved: 0, cost: 0, n: 0 };
    cur.saved += e.laborValueSavedUsd ?? 0;
    cur.cost += e.amortizedCostUsd ?? 0;
    cur.n += 1;
    byAgentEvents.set(e.agentId, cur);
  }

  const coverageCovered = coverage.filter((c) => c.status === "covered").length;
  const coverageTotal = Math.max(1, coverage.length);
  const surfaceCoverageRatio = coverageCovered / coverageTotal;

  const fromRegistry: ScenariosAgentVolume[] = agents.map((a) => {
    const ev = byAgentEvents.get(a.agentId);
    const net = ev ? ev.saved - ev.cost : 0;
    const weeklyRoi = Math.max(0, net * weekScale);
    const rawRuns = a.runs || ev?.n || 1;
    const baseRuns = Math.max(1, Math.round(rawRuns * weekScale));
    const baseCost = a.costPerRun > 0 ? a.costPerRun : 0.02;
    const setup = Math.round(300 + baseRuns * 3 + (a.sigma ?? 0) * 50);
    return {
      id: a.agentId,
      name: a.name || a.agentId,
      baseCost,
      baseRuns,
      weeklyRoi,
      setup,
    };
  });

  const seen = new Set(fromRegistry.map((a) => a.id));
  const fromEventsOnly: ScenariosAgentVolume[] = [];
  for (const [agentId, g] of Array.from(byAgentEvents.entries())) {
    if (seen.has(agentId)) continue;
    const net = g.saved - g.cost;
    const weeklyRoi = Math.max(0, net * weekScale);
    const baseRuns = Math.max(1, Math.round(g.n * weekScale));
    const baseCost = Math.max(0.005, (g.cost || 0.01) / Math.max(1, g.n));
    fromEventsOnly.push({
      id: agentId,
      name: agentId,
      baseCost,
      baseRuns,
      weeklyRoi,
      setup: Math.round(280 + baseRuns * 2),
    });
  }

  const agentVolumes = [...fromRegistry, ...fromEventsOnly].sort(
    (x, y) => y.baseRuns - x.baseRuns,
  );

  return {
    tenantId,
    processes,
    headcount: {
      baseHeadcount,
      weeklySalary,
      baseRoi,
      humanReviewQueued: queued,
      observationDays: days,
    },
    agents: agentVolumes,
    meta: {
      eventCount: events.length,
      weeklyNetUsd,
      eventQualityPassRate: coveragePassRate,
      surfaceCoverageRatio: coverage.length ? surfaceCoverageRatio : null,
      source: "database",
    },
  };
}
