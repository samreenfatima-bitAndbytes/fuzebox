/**
 * fmeaCapture.ts — Automatic FMEA risk register population
 *
 * Completely decoupled from routes and cognition. Each exported function
 * is a self-contained trigger that writes one row into fmea_items when a
 * specific system event fires. Call sites import only what they need.
 *
 * Trigger map
 * ───────────
 *  captureOnTrustDemotion      → fired by cognition.ts after GOV_AUTO_DEMOTION
 *  captureOnHighVariance       → fired by cognition.ts after reconcileSoR when techVarianceSigma > threshold
 *  captureOnPolicyBlock        → fired by cognition.ts when policyOutcome === "blocked"
 *  captureOnCoverageGap        → fired by routes.ts when coverage_manifest surface status === "gap"
 *
 * Each function is idempotent: it checks for an existing row with the same
 * deterministic ID before inserting, so double-fires are harmless.
 *
 * RPN scoring guide used here:
 *   Severity (S) — business impact of the failure if it occurs
 *   Occurrence (O) — how often this class of failure happens
 *   Detection (D) — how hard it is to catch before impact (10 = nearly impossible)
 */

import { db } from "./storage";
import { fmeaItems } from "@shared/schema";
import { eq } from "drizzle-orm";

/* ─── Shared helpers ──────────────────────────────────────────────────────── */

async function upsertFmeaRow(input: typeof fmeaItems.$inferInsert): Promise<void> {
  let row = input;

  // fmea_items.id is a global primary key, but the deterministic IDs built below are not
  // tenant-scoped. If another tenant already holds this ID, fall back to a tenant-suffixed one.
  for (const id of [input.id, `${input.id}-${input.tenantId.slice(0, 8)}`]) {
    const [existing] = await db
      .select({ tenantId: fmeaItems.tenantId })
      .from(fmeaItems)
      .where(eq(fmeaItems.id, id))
      .limit(1);

    if (existing?.tenantId === input.tenantId) return; // already captured — idempotent
    row = { ...input, id };
    if (!existing) break;
  }

  await db.insert(fmeaItems).values(row);
  console.log(`[fmeaCapture] Auto-created FMEA item ${row.id} for tenant ${row.tenantId}`);
}

/* ─── Trigger 1: Trust demotion ───────────────────────────────────────────── */

/**
 * Call this immediately after writing a GOV_AUTO_DEMOTION governance decision.
 *
 * Example call site in cognition.ts (inside the demotion block):
 *   await captureOnTrustDemotion({ tenantId, agentId, agentName, prevTier, newTier, decisionId });
 */
export async function captureOnTrustDemotion(opts: {
  tenantId: string;
  agentId: string;
  agentName: string;
  prevTier: string;
  newTier: string;
  decisionId: string;
  agentRegistryId?: number;
}): Promise<void> {
  // Deterministic ID: one row per agent per demotion event so replay is safe
  const id = `FMEA-DEMOTE-${opts.decisionId.slice(-10).toUpperCase()}`;

  await upsertFmeaRow({
    id,
    tenantId: opts.tenantId,
    agentRegistryId: opts.agentRegistryId ?? null,
    processScope: opts.agentName,
    failureMode: "Autonomous trust demotion",
    effect: `Agent demoted from ${opts.prevTier} to ${opts.newTier}. Elevated human oversight required until quality gates pass.`,
    rootCause: `Quality regression detected: confidence or passedThresholds below policy thresholds for agent ${opts.agentId}.`,
    mitigation: "Review recent canonical events for this agent. Investigate prompt quality and data freshness. Monitor for 7 consecutive days before requesting promotion.",
    severity: 7,
    occurrence: 5,
    detection: 4,
    status: "OPEN",
    owner: "AI Governance",
  });
}

/* ─── Trigger 2: High-variance reconciliation ─────────────────────────────── */

/**
 * Call this after reconcileSoR when techVarianceSigma exceeds 0.5
 * (the same threshold the promotions engine uses).
 *
 * Example call site in cognition.ts (inside reconcileSoR return path):
 *   if (techVariance > 0.5) {
 *     await captureOnHighVariance({ tenantId, agentId, decisionId, techVarianceSigma, econCostDelta });
 *   }
 */
export async function captureOnHighVariance(opts: {
  tenantId: string;
  agentId: string;
  decisionId: string;
  techVarianceSigma: number;
  econCostDelta: number;
  agentRegistryId?: number;
}): Promise<void> {
  const id = `FMEA-VARIANCE-${opts.decisionId.slice(-10).toUpperCase()}`;

  // Severity scales with how far over the 0.5 threshold the variance is (capped at 9)
  const severity = Math.min(9, Math.round(4 + opts.techVarianceSigma * 4));
  // Occurrence: high variance in a single row is a moderate signal
  const occurrence = 5;
  // Detection: variance only surfaces after SoR reconciliation — moderately hard to detect in time
  const detection = 6;

  await upsertFmeaRow({
    id,
    tenantId: opts.tenantId,
    agentRegistryId: opts.agentRegistryId ?? null,
    processScope: opts.agentId,
    failureMode: "High PEL variance after SoR reconciliation",
    effect: `Technical variance σ=${opts.techVarianceSigma.toFixed(3)} exceeds 0.5 threshold. Economic cost delta: $${opts.econCostDelta.toFixed(2)}.`,
    rootCause: `Predicted vs. actual outcome divergence on decision ${opts.decisionId}. Root attribution likely in prompt, data, or agent boundary.`,
    mitigation: "Run variance attribution analysis on the affected decision. Apply prompt_patch or routing_patch as indicated by attributionBucket. Re-close ledger row after correction.",
    severity,
    occurrence,
    detection,
    status: "OPEN",
    owner: "AI Ops",
  });
}

/* ─── Trigger 3: Policy BLOCK ─────────────────────────────────────────────── */

/**
 * Call this when policyOutcome is "blocked" during ingest.
 * A blocked call is a realised failure — the agent tried something that breached a hard limit.
 *
 * Example call site in cognition.ts (after the policyOutcome assignment):
 *   if (policyOutcome === "blocked") {
 *     await captureOnPolicyBlock({ tenantId, agentId, decisionId, rationale, policyId });
 *   }
 */
export async function captureOnPolicyBlock(opts: {
  tenantId: string;
  agentId: string;
  decisionId: string;
  rationale: string;
  policyId: string;
  amortizedCostUsd?: number;
  agentRegistryId?: number;
}): Promise<void> {
  // Deterministic ID per (agent, policy) — one live FMEA row per failure mode, not per event
  const id = `FMEA-BLOCK-${opts.agentId.slice(-8).toUpperCase()}-${opts.policyId.replace(/[^A-Z0-9]/gi, "").slice(0, 12).toUpperCase()}`;

  await upsertFmeaRow({
    id,
    tenantId: opts.tenantId,
    agentRegistryId: opts.agentRegistryId ?? null,
    processScope: opts.agentId,
    failureMode: "Policy hard-block at execution boundary",
    effect: `Agent call blocked by policy ${opts.policyId}. Decision ${opts.decisionId} was not executed. Downstream workflows waiting on this result are stalled.`,
    rootCause: opts.rationale,
    mitigation: `Review policy ${opts.policyId} configuration. Check amortized cost ceiling and agent trust tier. If block is a false positive, adjust policy threshold and re-submit decision.`,
    severity: 8,
    occurrence: 4,
    // Budget blocks are detectable at ingest time — detection is easy (low score)
    detection: 2,
    status: "OPEN",
    owner: "AI Governance",
  });
}

/* ─── Trigger 4: Coverage gap ─────────────────────────────────────────────── */

/**
 * Call this when coverage_manifest is upserted with status === "gap".
 * An unmonitored surface = off-ledger spend and compliance exposure.
 *
 * Example call site in routes.ts (inside POST /api/coverage or upsertCoverage):
 *   if (coverageEntry.status === "gap") {
 *     await captureOnCoverageGap({ tenantId, hyperscaler, surface });
 *   }
 */
export async function captureOnCoverageGap(opts: {
  tenantId: string;
  hyperscaler: string;
  surface: string;
}): Promise<void> {
  // Deterministic ID per (tenant, hyperscaler, surface) — one live item per gap
  const id = `FMEA-GAP-${opts.hyperscaler.toUpperCase()}-${opts.surface.toUpperCase()}`.slice(0, 40);

  await upsertFmeaRow({
    id,
    tenantId: opts.tenantId,
    agentRegistryId: null,
    processScope: `${opts.hyperscaler} / ${opts.surface}`,
    failureMode: "Telemetry coverage gap — surface unmonitored",
    effect: `${opts.hyperscaler} ${opts.surface} surface not captured. Spend on this surface is off-ledger and invisible to RoP/TUoP equations and the compliance audit chain.`,
    rootCause: `No active capture adapter or vendor webhook configured for ${opts.hyperscaler} ${opts.surface}. Coverage manifest status is "gap".`,
    mitigation: `Activate ${opts.hyperscaler} ${opts.surface} capture via vendor webhook or proxy integration. Update coverage manifest to "covered" once telemetry is flowing. Verify HMAC chain continuity.`,
    // Compliance exposure on an unmonitored surface is high severity
    severity: 7,
    // Gaps persist until actively closed — moderately likely to recur
    occurrence: 6,
    // Off-ledger spend is hard to detect without this system
    detection: 8,
    status: "OPEN",
    owner: "Platform Engineering",
  });
}
