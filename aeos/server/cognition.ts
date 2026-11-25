/**
 * FuzeBox AEOS — Cognition + Governance Engine
 *
 * This module implements:
 *   1. Vendor adapters that translate raw vendor payloads into the
 *      FuzeBox Canonical Event v1 (Patent Family 6 — boundary observation).
 *   2. The HMAC-chained append-only ledger writer.
 *   3. The Five Business Equations + RoP + TUoP rollup.
 *   4. The Governance Plane policy engine (closed-loop decisions written
 *      back as governance events).
 *   5. The PEL bridge — every canonical event opens or closes a
 *      ledger row with five-structure semantics.
 *
 * Layers wired here:
 *   Observation ─▶ Canonical Event Bus ─▶ PEL Open ─▶ SoR Reconcile ─▶
 *   Variance + Attribution ─▶ Equation Snapshot ─▶ Governance Plane ─▶
 *   Recommendation Surface ─▶ Audit Chain.
 */

import crypto from "node:crypto";
import { db, storage } from "./storage";
import {
  captureOnTrustDemotion,
  captureOnHighVariance,
  captureOnPolicyBlock,
  captureOnCoverageGap,
} from "./fmeaCapture";
import { eq, and, gte, sql, desc, count, avg, inArray } from "drizzle-orm";
import {
  type CanonicalEvent, type InsertCanonicalEvent,
  type InsertLedgerRow, type LedgerRow,
  type InsertRecommendation,
  governanceDecisions,
  recommendations,
  canonicalEvents,
  equationSnapshots,
  agentRegistry,
  ledgerRows,
  apiKeys,
  TRUST_TIER_ORDER,
  DEFAULT_AGENT_TRUST_TIER,
} from "@shared/schema";

const HMAC_SECRET = process.env.FBX_HMAC_SECRET ?? "fbx-dev-secret-rotate-in-prod";
const FUZEBOX_KMS_KEY = process.env.FBX_SIGNING_KEY ?? "fuzebox-kms-primary-dev";
const RPOTENTIAL_KMS_KEY = process.env.RPOT_SIGNING_KEY ?? "rpotential-kms-dev";

/* ---------- ULID-ish, no external dep ---------- */
const ulidLike = () => {
  const ts = Date.now().toString(36);
  const rnd = crypto.randomBytes(8).toString("hex");
  return `evt-${ts}-${rnd}`;
};

const sign = (secret: string, payload: string) =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

/* ============================================================
 * 1. Vendor Adapters (Patent Family 6 Claim A — canonical schema)
 *    Each adapter produces a partial canonical event.
 * ============================================================ */

export type RawVendorEvent = Record<string, any>;
export interface AdapterContext {
  tenantId: string;
  workspaceId?: string;
  agentId: string;
  workflowId?: string;
  skill?: string;
  trigger?: string;
  humanUserId?: string;
  parentAgentId?: string;
  capturedVia?: "litellm" | "proxy_gateway" | "otel" | "vendor_webhook" | "ebpf";
  costCenter?: string;
  ledgerAccount?: string;
  humanBaselineMinutes?: number;
  manualHourlyCostUsd?: number;
  /** Optional model hint when the vendor payload omits or blanks model. */
  model?: string;
}

interface PriceCard { in: number; out: number; }
const PRICES: Record<string, PriceCard> = {
  "claude-opus-4-7":   { in: 15.00, out: 75.00 },
  "claude-sonnet-4-6": { in:  3.00, out: 15.00 },
  "gpt-5":             { in:  5.00, out: 20.00 },
  "gpt-5-mini":        { in:  0.40, out:  2.00 },
  "gemini-1.5-pro":    { in:  3.50, out: 10.50 },
  "mistral-large-3":   { in:  4.00, out: 12.00 },
  "phi-4":             { in:  0.30, out:  1.20 },
};
const priceOf = (model: string, inTok: number, outTok: number) => {
  const p = PRICES[model] ?? { in: 1, out: 3 };
  return (inTok * p.in + outTok * p.out) / 1_000_000;
};

abstract class ConnectorBase {
  abstract hyperscaler: string;
  abstract endpoint: string;
  abstract translate(raw: RawVendorEvent, ctx: AdapterContext): Partial<InsertCanonicalEvent>;
}

class AnthropicAdapter extends ConnectorBase {
  hyperscaler = "anthropic"; endpoint = "messages";
  translate(raw: RawVendorEvent, ctx: AdapterContext) {
    const usage = raw.usage ?? {};
    const inTok = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
                + Math.round((usage.cache_read_input_tokens ?? 0) * 0.1);
    const outTok = usage.output_tokens ?? 0;
    const vendorCost = priceOf(raw.model, inTok, outTok);
    return {
      hyperscaler: "anthropic", endpoint: "messages", transport: "https",
      vendorRequestId: raw.id,
      capturedVia: ctx.capturedVia ?? "litellm",
      agentKind: "llm_call", model: raw.model,
      inputTokens: inTok, outputTokens: outTok,
      vendorCostUsd: vendorCost, amortizedCostUsd: vendorCost * 1.15,
      passedThresholds: raw.stop_reason !== "max_tokens",
    };
  }
}
class OpenAIAdapter extends ConnectorBase {
  hyperscaler = "openai"; endpoint = "responses";
  translate(raw: RawVendorEvent, ctx: AdapterContext) {
    const usage = raw.usage ?? {};
    const cached = usage.input_tokens_details?.cached_tokens ?? 0;
    const inTok = (usage.input_tokens ?? 0) - Math.round(cached * 0.5); // 50% discount
    const reasoning = usage.output_tokens_details?.reasoning_tokens ?? 0;
    const outTok = (usage.output_tokens ?? 0) + reasoning;
    const cost = priceOf(raw.model, inTok, outTok);
    return {
      hyperscaler: "openai", endpoint: "responses", transport: "https",
      vendorRequestId: raw.id, capturedVia: ctx.capturedVia ?? "proxy_gateway",
      agentKind: "llm_call", model: raw.model,
      inputTokens: inTok, outputTokens: outTok,
      vendorCostUsd: cost, amortizedCostUsd: cost * 1.15,
      toolCallsJson: JSON.stringify(raw.tool_calls ?? []),
    };
  }
}
class MistralAdapter extends ConnectorBase {
  hyperscaler = "mistral"; endpoint = "responses";
  translate(raw: RawVendorEvent, ctx: AdapterContext) {
    const u = raw.usage ?? {};
    const inTok = u.prompt_tokens ?? 0;
    const outTok = u.completion_tokens ?? 0;
    const cost = priceOf(raw.model, inTok, outTok);
    return {
      hyperscaler: "mistral", endpoint: "responses", transport: "https",
      vendorRequestId: raw.id, capturedVia: ctx.capturedVia ?? "litellm",
      agentKind: "llm_call", model: raw.model,
      inputTokens: inTok, outputTokens: outTok,
      vendorCostUsd: cost, amortizedCostUsd: cost * 1.15,
    };
  }
}
class MicrosoftCopilotAdapter extends ConnectorBase {
  hyperscaler = "ms_copilot"; endpoint = "agent_run";
  translate(raw: RawVendorEvent, ctx: AdapterContext) {
    const inTok = raw.usage?.prompt_tokens ?? 0;
    const outTok = raw.usage?.completion_tokens ?? 0;
    const cost = priceOf(raw.model ?? "gpt-5-mini", inTok, outTok);
    return {
      hyperscaler: "ms_copilot",
      endpoint: raw.endpoint ?? "agent_run",
      transport: raw.transport ?? "https",
      vendorRequestId: raw.id, capturedVia: ctx.capturedVia ?? "vendor_webhook",
      agentKind: raw.agent_kind ?? "tool_call",
      model: raw.model ?? "gpt-5-mini",
      inputTokens: inTok, outputTokens: outTok,
      vendorCostUsd: cost, amortizedCostUsd: cost * 1.20,
    };
  }
}
class UniphoreBAICAdapter extends ConnectorBase {
  hyperscaler = "uniphore_baic"; endpoint = "mcp";
  translate(raw: RawVendorEvent, ctx: AdapterContext) {
    const inTok = raw.token_usage?.input_tokens ?? 0;
    const outTok = raw.token_usage?.output_tokens ?? 0;
    const cost = priceOf(raw.model ?? "phi-4", inTok, outTok);
    return {
      hyperscaler: "uniphore_baic", endpoint: "mcp",
      transport: raw.transport ?? "streamable_http",
      vendorRequestId: raw.step_id, capturedVia: ctx.capturedVia ?? "proxy_gateway",
      agentKind: "mcp_call", model: raw.model,
      inputTokens: inTok, outputTokens: outTok,
      vendorCostUsd: cost, amortizedCostUsd: cost * 1.10,
      toolCallsJson: JSON.stringify(raw.tools ?? []),
    };
  }
}

const ADAPTERS: Record<string, ConnectorBase> = {
  anthropic: new AnthropicAdapter(),
  openai: new OpenAIAdapter(),
  mistral: new MistralAdapter(),
  ms_copilot: new MicrosoftCopilotAdapter(),
  uniphore_baic: new UniphoreBAICAdapter(),
};

export const adapterFor = (hyperscaler: string) => ADAPTERS[hyperscaler];

/** Optional chain link from vendor / orchestrator raw payload (canonical prev mirrors this when set). */
function prevEventHashFromRaw(raw: RawVendorEvent): string | undefined {
  const v = raw?.prevEventHash ?? raw?.previousEventHash ?? raw?.prev_event_hash;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** First non-blank string among candidates, else "unknown". */
export function sanitizeToKnown(...candidates: (unknown)[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim() !== "") return c.trim();
  }
  return "unknown";
}

export function sanitizeWorkflowId(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

/* ============================================================
 * 2. Append + chain canonical event, open PEL row.
 * ============================================================ */

export async function ingest(opts: {
  hyperscaler: string;
  raw: RawVendorEvent;
  ctx: AdapterContext;
  /** Fallback when model is missing/blank on raw + ctx (e.g. gateway injects model here). */
  model?: string;
  decisionId?: string;
  qualityConfidence?: number;
  reworkMinutes?: number;
  policyId?: string;
  /** Explicit override from the calling orchestrator — skips tier/confidence gates when set. */
  policyOutcome?: string;
  humanReview?: string;
}): Promise<{ event: CanonicalEvent; ledger: LedgerRow }> {
  const adapter = adapterFor(opts.hyperscaler);
  if (!adapter) throw new Error(`No adapter for ${opts.hyperscaler}`);
  const partial = adapter.translate(opts.raw, opts.ctx);

  const sanitizedModel = sanitizeToKnown(partial.model, opts.ctx.model, opts.model);
  const sanitizedVendor = sanitizeToKnown(
    opts.raw?.vendor,
    opts.raw?.vendor_name,
    (partial as { vendor?: string }).vendor,
    opts.hyperscaler,
  );
  const sanitizedWorkflowId = sanitizeWorkflowId(opts.ctx.workflowId);

  const decisionId = opts.decisionId ?? `dec-${ulidLike()}`;
  const eventId = ulidLike();
  const capturedAt = new Date().toISOString();
  const chainTip = await storage.lastEventHash(opts.ctx.tenantId);
  const rawPrev = prevEventHashFromRaw(opts.raw);
  const prevHash = rawPrev ?? (chainTip ?? "GENESIS");

  const agentRow = await storage.getAgentById(opts.ctx.agentId, opts.ctx.tenantId);
  const eventTrustTier = agentRow?.trustTier ?? DEFAULT_AGENT_TRUST_TIER;

  // Economic enrichment
  const wallMs = (partial as any).wallMs ?? 1500 + Math.floor(Math.random() * 2000);
  const baseline = opts.ctx.humanBaselineMinutes ?? agentRow?.humanBaselineMinutes ?? 3.0;
  const hourly   = opts.ctx.manualHourlyCostUsd  ?? agentRow?.manualHourlyCostUsd  ?? 75.0;
  const laborValueSaved = (baseline / 60) * hourly;
  const amortized = (partial.amortizedCostUsd ?? 0);
  const rop = amortized > 0 ? laborValueSaved / amortized : 0;
  const cuow = amortized + (opts.reworkMinutes ?? 0) * (hourly / 60);
  const conf = opts.qualityConfidence ?? 0.85 + Math.random() * 0.14;
  const mer = cuow > 0 ? conf / cuow : 0;

  // Orchestrator-supplied values take highest precedence — use them directly when present.
  const orchestratorPolicyOutcome = opts.policyOutcome ?? null;
  const orchestratorHumanReview = opts.humanReview ?? null;

  // Tier-based ingestion policy (evaluated before cost/quality circuit-breakers)
  let tierPolicyOutcome: string | null = null;
  let tierHumanReview: string | null = null;
  if (eventTrustTier === "T0_probation" || eventTrustTier === "T1_observed") {
    tierPolicyOutcome = "held_for_review";
    tierHumanReview = "pending";
  } else if (eventTrustTier === "T3_trusted") {
    tierPolicyOutcome = "allowed";
    tierHumanReview = "none";
  }
  // T2_supervised: fall through to confidence/cost gates, flag if thresholds failed

  // governance trial (confidence/cost gates — overridden by tier policy above when set)
  const policyOutcome = orchestratorPolicyOutcome ?? tierPolicyOutcome ?? (() => {
    if (conf < 0.7) return "human_gate";
    if (amortized > 5.0) return "blocked";   // budget circuit-breaker (demo)
    return "allowed";
  })();

  // Auto-FMEA: hard budget block is a realised failure — capture it before processing continues
  if (policyOutcome === "blocked") {
    captureOnPolicyBlock({
      tenantId: opts.ctx.tenantId,
      agentId: opts.ctx.agentId,
      decisionId,
      rationale: "Per-call amortized cost above $5.00 ceiling.",
      policyId: opts.policyId ?? "POL_DEFAULT_V1",
      amortizedCostUsd: amortized,
      agentRegistryId: agentRow?.id ?? undefined,
    }).catch((e) => console.error("[fmeaCapture] captureOnPolicyBlock failed:", e));
  }

  // humanReview: orchestrator wins, then tier, then confidence/threshold gates
  const humanReview = orchestratorHumanReview ?? tierHumanReview ??
    (eventTrustTier === "T2_supervised" && !(partial.passedThresholds ?? true)
      ? "flagged"
      : policyOutcome === "human_gate" ? "queued" : "auto");

  const merged: InsertCanonicalEvent = {
    eventId,
    schemaVersion: "fbx-canonical-v1.0",
    capturedAt,
    tenantId: opts.ctx.tenantId,
    workspaceId: opts.ctx.workspaceId,
    decisionId,
    hyperscaler: partial.hyperscaler!,
    endpoint: partial.endpoint!,
    transport: partial.transport!,
    vendorRequestId: partial.vendorRequestId,
    capturedVia: partial.capturedVia!,
    agentId: opts.ctx.agentId,
    agentKind: partial.agentKind!,
    model: sanitizedModel,
    humanUserId: opts.ctx.humanUserId,
    parentAgentId: opts.ctx.parentAgentId,
    workflowId: sanitizedWorkflowId ?? undefined,
    skill: opts.ctx.skill,
    skillVersion: "3.1.0",
    trigger: opts.ctx.trigger,
    inputTokens: partial.inputTokens ?? 0,
    outputTokens: partial.outputTokens ?? 0,
    toolCallsJson: partial.toolCallsJson,
    wallMs,
    vendorCostUsd: partial.vendorCostUsd ?? 0,
    amortizedCostUsd: amortized,
    passedThresholds: partial.passedThresholds ?? true,
    confidence: conf,
    humanReview,
    reworkMinutes: opts.reworkMinutes ?? 0,
    ledgerAccount: opts.ctx.ledgerAccount ?? "GL_4200_AI_OPS",
    costCenter: opts.ctx.costCenter ?? "CC_ENTERPRISE_AI",
    humanBaselineMinutes: baseline,
    manualHourlyCostUsd: hourly,
    laborValueSavedUsd: laborValueSaved,
    uopId: `uop-${capturedAt.slice(0,10)}-${decisionId.slice(-6)}`,
    ropValue: rop, cuowValue: cuow, merValue: mer,
    policyId: opts.policyId ?? "POL_DEFAULT_V1",
    policyOutcome,
    trustTier: eventTrustTier,
    auditHash: "",
    prevEventHash: prevHash,
    rawPayloadRef: `s3://fbx-raw/${partial.hyperscaler}/${capturedAt.slice(0,10)}/${eventId}.json`,
  };

  // HMAC chain (Patent Family 6 Claim C — closed-loop)
  const auditHash = sign(HMAC_SECRET, JSON.stringify({ ...merged, auditHash: undefined }));
  merged.auditHash = auditHash;

  const event = await storage.appendCanonicalEvent(merged);

  // Open a PEL row with PREDICTED structure
  const predictedSig = sign(FUZEBOX_KMS_KEY, `${decisionId}:${amortized}:${laborValueSaved}`);
  const pelRow: InsertLedgerRow = {
    decisionId,
    tenantId: opts.ctx.tenantId,
    agentId: opts.ctx.agentId,
    workflowId: sanitizedWorkflowId ?? undefined,
    skillId: opts.ctx.skill,
    status: "open",
    createdAt: capturedAt,
    closedAt: null as any,
    predictedCostUsd: amortized,
    predictedOutcomeUsd: laborValueSaved,
    predictedSignature: predictedSig,
    predictedSignedAt: capturedAt,
    uefCapabilityFit: 0.78 + Math.random() * 0.18,
    uefGstiScore: 60 + Math.random() * 35,
    uefGstiClassification: rop > 1.2 ? "AI-Primary" : rop > 0.8 ? "Hybrid" : "AI-Assisted",
    uefUopValue: laborValueSaved,
    uefCoordinationTax: 0.05 + Math.random() * 0.18,
    uefGovernanceScore: 0.85,
    uefRuntimeFit: 0.9,
    uefEconomicValue: laborValueSaved - amortized,
    uefRiskPenalty: 0.02 + Math.random() * 0.08,
    staleSignalFlag: false,
    cosignStatus: "pending",
    // Mirror canonical audit chain on the PEL row (row_hash ↔ audit_hash, prev_row_hash ↔ prev_event_hash).
    rowHash: auditHash,
    prevRowHash: merged.prevEventHash ?? null,
  };
  const ledger = await storage.upsertLedgerRow(pelRow);

  // Governance writeback as a closed-loop event in the same chain
  if (policyOutcome !== "allowed") {
    await storage.insertGovernance({
      decisionId, tenantId: opts.ctx.tenantId,
      firedAt: capturedAt, policyId: merged.policyId!,
      policyOutcome, rationale:
        policyOutcome === "human_gate" ? "Confidence below 0.70 threshold — queued for review."
        : "Per-call amortized cost above $5.00 ceiling.",
      prevTrustTier: eventTrustTier, newTrustTier: eventTrustTier,
      rerouteFromModel: null as any, rerouteToModel: null as any,
      subject: opts.ctx.agentId,
      actor: null,
      relatedRecId: null,
    });
  }

  if (merged.confidence! < 0.4 || merged.passedThresholds === false) {
    const currentAgent = await storage.getAgentById(opts.ctx.agentId, opts.ctx.tenantId);
    if (currentAgent) {
      const order = TRUST_TIER_ORDER as readonly string[];
      const curIdx = order.indexOf(currentAgent.trustTier);
      const newTier =
        curIdx <= 0 ? DEFAULT_AGENT_TRUST_TIER : order[curIdx - 1]!;
      if (newTier !== currentAgent.trustTier) {
        const { id: _cid, ...cur } = currentAgent;
        await storage.upsertAgent({ ...cur, trustTier: newTier });

        const demoteDecisionId = `demote-${ulidLike()}`;
        await storage.insertGovernance({
          decisionId: demoteDecisionId,
          tenantId: opts.ctx.tenantId,
          firedAt: capturedAt,
          policyId: "GOV_AUTO_DEMOTION",
          policyOutcome: "demoted",
          rationale: `Family 8 Trigger: Quality regression (confidence ${merged.confidence}, passedThresholds=${merged.passedThresholds}). Demoted one tier to ${newTier}.`,
          prevTrustTier: currentAgent.trustTier,
          newTrustTier: newTier,
          rerouteFromModel: null,
          rerouteToModel: null,
          subject: opts.ctx.agentId,
          actor: null,
          relatedRecId: null,
        });

        // Auto-FMEA: demotion = realised quality failure — capture for the risk register
        captureOnTrustDemotion({
          tenantId: opts.ctx.tenantId,
          agentId: opts.ctx.agentId,
          agentName: currentAgent.name,
          prevTier: currentAgent.trustTier,
          newTier,
          decisionId: demoteDecisionId,
          agentRegistryId: currentAgent.id,
        }).catch((e) => console.error("[fmeaCapture] captureOnTrustDemotion failed:", e));
      }
    }
  }

  const postDemotion = await storage.getAgentById(opts.ctx.agentId, opts.ctx.tenantId);
  const registryStatus = postDemotion?.status ?? "green";
  const registryCreatedAt = postDemotion?.createdAt ?? capturedAt;
  const registryTrustTier = postDemotion?.trustTier ?? DEFAULT_AGENT_TRUST_TIER;

  await storage.registerOrRefreshAgent({
    agentId: opts.ctx.agentId,
    tenantId: opts.ctx.tenantId,
    name: opts.ctx.agentId.replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    hyperscaler: opts.hyperscaler,
    model: sanitizedModel,
    trustTier: registryTrustTier,
    vendor: sanitizedVendor,
    workflowId: sanitizedWorkflowId,
    status: registryStatus,
    createdAt: registryCreatedAt,
  });

  return { event, ledger };
}

/* ============================================================
 * 3. SoR reconciliation: close the PEL row with ACTUAL +
 *    compute Variance + Attribution + Two-Party Co-signature.
 * ============================================================ */
export async function reconcileSoR(opts: {
  decisionId: string; actualCostUsd: number; actualOutcomeUsd: number; sor: string; existingRow?: LedgerRow;
}): Promise<LedgerRow | undefined> {
  const closedAt = new Date().toISOString();
  const fuzeboxSig = sign(FUZEBOX_KMS_KEY, `${opts.decisionId}:actual:${opts.actualCostUsd}`);
  const rpotentialSig = sign(RPOTENTIAL_KMS_KEY, `${opts.decisionId}:actual:${opts.actualOutcomeUsd}`);

  // Use the passed row if available, otherwise fetch from storage
  const row = opts.existingRow ?? await storage.getLedgerRow(opts.decisionId);
  if (!row) {
    console.error(`PEL RECONCILE FAIL: decisionId ${opts.decisionId} not found in DB`);
    return undefined;
  }

  const econCostDelta = opts.actualCostUsd - row.predictedCostUsd;
  const econWinRateDelta = (opts.actualOutcomeUsd - row.predictedOutcomeUsd) / Math.max(1e-9, row.predictedOutcomeUsd);
  const techVariance = Math.abs(econWinRateDelta) * 1.5;
  const attribution =
    econCostDelta > row.predictedCostUsd * 0.4 ? "agent" :
    techVariance > 0.5 ? "prompt" :
    Math.abs(econWinRateDelta) > 0.3 ? "data" : "environment";

  const correctionType =
    attribution === "agent"  ? "routing_patch" :
    attribution === "prompt" ? "prompt_patch" : null;

  const closed = await storage.closeLedgerRow(opts.decisionId, {
    status: "closed", closedAt,
    actualCostUsd: opts.actualCostUsd, actualOutcomeUsd: opts.actualOutcomeUsd,
    actualSourceSor: opts.sor,
    fuzeboxSig, rpotentialSig, cosignStatus: "complete",
    techVarianceSigma: techVariance, techErrorRate: techVariance * 0.6,
    econWinRateDelta, econCostDelta,
    attributionBucket: attribution, attributionConfidence: 0.78 + Math.random() * 0.18,
    correctionType: correctionType ?? undefined,
    correctionRef: correctionType ? `patch-${ulidLike()}` : undefined,
    correctionAppliedAt: correctionType ? closedAt : undefined,
  });

  // Auto-FMEA: variance exceeding the promotions-engine threshold is a risk signal
  if (techVariance > 0.5) {
    captureOnHighVariance({
      tenantId: row.tenantId,
      agentId: row.agentId,
      decisionId: opts.decisionId,
      techVarianceSigma: techVariance,
      econCostDelta,
    }).catch((e) => console.error("[fmeaCapture] captureOnHighVariance failed:", e));
  }

  return closed;
}

/* ============================================================
 * 4. Five Business Equations rollup
 * ============================================================ */
export async function rollupEquations(tenantId: string) {
  const activeAgentIds = await storage.getActiveTenantAgentIds(tenantId);
  if (activeAgentIds.length === 0) return null;
  const events = await storage.listCanonicalEventsForAgents(tenantId, activeAgentIds, 5000);
  if (events.length === 0) return null;

  const totalAgentCost  = events.reduce((s, e) => s + (e.amortizedCostUsd || 0), 0);
  const totalLaborSaved = events.reduce((s, e) => s + (e.laborValueSavedUsd || 0), 0);
  const totalRework     = events.reduce((s, e) => s + ((e.reworkMinutes || 0) * 1.25), 0);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const recentEvents = events.filter(e => e.capturedAt >= sevenDaysAgo);
  const weeklyLaborSaved = recentEvents.reduce((s, e) => s + (e.laborValueSavedUsd || 0), 0);
  const weeklyCost       = recentEvents.reduce((s, e) => s + (e.amortizedCostUsd || 0), 0);
  const weeklyRunRateUsd = weeklyLaborSaved - weeklyCost;
  const tasks = events.length;

  const cuow = (totalAgentCost + totalRework) / tasks;
  const humanCostPerTask = events.reduce((s, e) => s + (((e.humanBaselineMinutes||3)/60)*(e.manualHourlyCostUsd||75)), 0) / tasks;
  const agentPerTask = totalAgentCost / tasks;
  const abt = humanCostPerTask / Math.max(1e-9, agentPerTask);
  const avgConfidence = events.reduce((s, e) => s + (e.confidence ?? 0.85), 0) / tasks;
  const mer = avgConfidence / Math.max(1e-9, cuow);

  const handoffMs = events.filter(e => e.humanReview === "queued").reduce((s, e) => s + e.wallMs, 0);
  const productiveMs = events.reduce((s, e) => s + e.wallMs, 0) - handoffMs;
  const ctr = handoffMs / Math.max(1e-9, productiveMs);

  const target = 1.0;
  const realized = totalLaborSaved / Math.max(1e-9, totalAgentCost);
  const tv = Math.min(1.5, realized / target);

  const rop = totalLaborSaved / Math.max(1e-9, totalAgentCost);
  // H/A split: events flagged human_review="queued" are human-touched units;
  // remainder is autonomous AI units. Realistic mix ~30/70.
  const humanTouched = events.filter(e => e.humanReview === "queued").length;
  const humanShare = Math.min(0.5, Math.max(0.18, humanTouched / Math.max(1, tasks) + 0.22));
  const huop = totalLaborSaved * humanShare;
  const auop = totalLaborSaved * (1 - humanShare);
  // Synergy coefficient: hybrid amplification rises with capability + governance fit, falls with CTR.
  const synergy = Math.max(0.08, Math.min(0.34, 0.22 + (1 - ctr) * 0.12 - (1 - avgConfidence) * 0.20));
  // TUoP master equation, normalized so the cross-term is denominated in $
  const tuop = huop + auop + (huop * auop * synergy) / Math.max(1, totalLaborSaved);

  return storage.insertSnapshot({
    tenantId, workflowId: null as any, agentId: null as any,
    computedAt: new Date().toISOString(),
    windowSeconds: 3600,
    cuow, abt, mer, ctr, tv, rop, tuop, huop, auop, synergyS: synergy,
    taskCount: tasks,
    laborValueSavedUsd: totalLaborSaved,
    amortizedCostUsd: totalAgentCost,
    netSavingsUsd: totalLaborSaved - totalAgentCost,
    weeklyRunRateUsd,
  });
}

/** Agents without a workflow are grouped under this process id in the Data Flow API. */
export const UNASSIGNED_WORKFLOW_ID = "__unassigned__";

export type ObservationDependencyNode = {
  agentId: string;
  name: string;
  model: string | null;
  hyperscaler: string;
  trustTier: string;
  vendor: string | null;
  status: string;
  /** Average techVarianceSigma across ledger rows for this agent (0 if none). */
  sigma: number;
  /** Count of ledger rows with status closed for this agent. */
  runs: number;
  /** Observation-plane event volume for this agent (canonical_events). */
  eventCount: number;
};

export type ObservationDependencyChain = {
  processId: string;
  /** Human-readable chain title */
  name: string;
  /** Mean of node sigma values in this chain (for header pill). */
  avgSigma: number;
  nodes: ObservationDependencyNode[];
};

function formatWorkflowLabel(workflowId: string): string {
  const t = workflowId.replace(/[-_]+/g, " ").trim();
  if (!t) return workflowId;
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Same bucket key as agent_registry grouping (trimmed workflow or UNASSIGNED). */
function workflowBucketId(workflowId: string | null): string {
  if (workflowId != null && String(workflowId).trim() !== "") return String(workflowId).trim();
  return UNASSIGNED_WORKFLOW_ID;
}

function isBlankHash(h: string | null | undefined): boolean {
  return h == null || String(h).trim() === "";
}

/** True when this event is a chain head (genesis / empty / literal null token). */
function isChainRootPrev(prev: string | null | undefined): boolean {
  if (isBlankHash(prev)) return true;
  const s = String(prev).trim();
  if (s.toLowerCase() === "genesis") return true;
  if (s === "null") return true;
  return false;
}

function capturedAtMs(value: string | null | undefined): number {
  if (value == null || value === "") return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

type AuditChainEventRow = {
  agentId: string;
  workflowId: string | null;
  auditHash: string;
  prevEventHash: string | null;
  capturedAt: string;
};

/**
 * Order nodes using the Observation-plane hash chain within this workflow:
 * roots are genesis-like prevs or events whose prev does not resolve inside this workflow,
 * then follow prevEventHash === prior auditHash. When canonical hash data exists, tail nodes
 * are ordered by earliest event time (not alphabetically).
 */
function orderNodesByAuditHashChain(
  processId: string,
  bucketNodes: ObservationDependencyNode[],
  tenantEvents: AuditChainEventRow[],
): ObservationDependencyNode[] {
  const wfEvents = tenantEvents.filter((e) => workflowBucketId(e.workflowId) === processId);
  if (wfEvents.length === 0) {
    return [...bucketNodes];
  }

  const auditHashes = new Set(wfEvents.map((e) => e.auditHash));
  const roots = wfEvents.filter(
    (e) =>
      isChainRootPrev(e.prevEventHash) ||
      !auditHashes.has(String(e.prevEventHash ?? "").trim()),
  );
  roots.sort((a, b) => capturedAtMs(a.capturedAt) - capturedAtMs(b.capturedAt));

  const orderedAgentIds: string[] = [];
  const seenAgents = new Set<string>();
  const visitedAudit = new Set<string>();

  const walkFrom = (start: AuditChainEventRow) => {
    let cur: AuditChainEventRow | null = start;
    while (cur != null) {
      if (visitedAudit.has(cur.auditHash)) return;
      visitedAudit.add(cur.auditHash);
      if (!seenAgents.has(cur.agentId)) {
        seenAgents.add(cur.agentId);
        orderedAgentIds.push(cur.agentId);
      }
      const nexts = wfEvents.filter((e) => e.prevEventHash === cur!.auditHash);
      if (nexts.length === 0) {
        cur = null;
      } else {
        nexts.sort((a, b) => capturedAtMs(a.capturedAt) - capturedAtMs(b.capturedAt));
        cur = nexts[0]!;
      }
    }
  };

  for (const r of roots) walkFrom(r);

  const nodeById = new Map(bucketNodes.map((n) => [n.agentId, n]));
  const head: ObservationDependencyNode[] = [];
  for (const id of orderedAgentIds) {
    const n = nodeById.get(id);
    if (n) head.push(n);
  }
  const tail: ObservationDependencyNode[] = [];
  for (const n of bucketNodes) {
    if (!seenAgents.has(n.agentId)) tail.push(n);
  }

  const bucketIndex = new Map(bucketNodes.map((n, i) => [n.agentId, i]));
  const earliestMsForAgent = (agentId: string) => {
    const hits = wfEvents.filter((e) => e.agentId === agentId);
    if (hits.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...hits.map((e) => capturedAtMs(e.capturedAt)));
  };
  tail.sort((a, b) => {
    const ta = earliestMsForAgent(a.agentId);
    const tb = earliestMsForAgent(b.agentId);
    if (ta !== tb) return ta - tb;
    return (bucketIndex.get(a.agentId) ?? 0) - (bucketIndex.get(b.agentId) ?? 0);
  });

  return [...head, ...tail];
}

function earliestCapturedMsInWorkflow(
  processId: string,
  tenantEvents: AuditChainEventRow[],
): number {
  const wf = tenantEvents.filter((e) => workflowBucketId(e.workflowId) === processId);
  if (wf.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...wf.map((e) => capturedAtMs(e.capturedAt)));
}

/**
 * Process chains for the Dependencies / Data Flow UI: agents from the registry
 * grouped by workflowId, enriched with ledger variance (σ) and closed-run counts
 * plus canonical event counts.
 */
export async function getObservationDependencies(tenantId: string): Promise<ObservationDependencyChain[]> {
  const registry = await db
    .select()
    .from(agentRegistry)
    .where(eq(agentRegistry.tenantId, tenantId));

  const activeAgents = registry.filter((a) =>
    ["active", "green", "amber", "red"].includes((a.status || "").toLowerCase()),
  );
  const agents = activeAgents.length > 0 ? activeAgents : registry;

  const [sigmaRows, closedRows, eventRows, auditChainEvents] = await Promise.all([
    db
      .select({
        agentId: ledgerRows.agentId,
        avgSigma: avg(ledgerRows.techVarianceSigma),
      })
      .from(ledgerRows)
      .where(eq(ledgerRows.tenantId, tenantId))
      .groupBy(ledgerRows.agentId),
    db
      .select({
        agentId: ledgerRows.agentId,
        runs: count(),
      })
      .from(ledgerRows)
      .where(and(eq(ledgerRows.tenantId, tenantId), eq(ledgerRows.status, "closed")))
      .groupBy(ledgerRows.agentId),
    db
      .select({
        agentId: canonicalEvents.agentId,
        eventCount: count(canonicalEvents.id),
      })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.tenantId, tenantId))
      .groupBy(canonicalEvents.agentId),
    db
      .select({
        agentId: canonicalEvents.agentId,
        workflowId: canonicalEvents.workflowId,
        auditHash: canonicalEvents.auditHash,
        prevEventHash: canonicalEvents.prevEventHash,
        capturedAt: canonicalEvents.capturedAt,
      })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.tenantId, tenantId)),
  ]);

  const sigmaByAgent = new Map(
    sigmaRows.map((r) => [r.agentId, r.avgSigma != null ? Number(r.avgSigma) : 0]),
  );
  const closedByAgent = new Map(closedRows.map((r) => [r.agentId, Number(r.runs)]));
  const eventsByAgent = new Map(eventRows.map((r) => [r.agentId, Number(r.eventCount)]));

  const buckets = new Map<string, ObservationDependencyNode[]>();

  for (const a of agents) {
    const pid = workflowBucketId(a.workflowId);
    const sigma = sigmaByAgent.get(a.agentId) ?? 0;
    const runs = closedByAgent.get(a.agentId) ?? 0;
    const eventCount = eventsByAgent.get(a.agentId) ?? 0;
    const node: ObservationDependencyNode = {
      agentId: a.agentId,
      name: a.name,
      model: a.model,
      hyperscaler: a.hyperscaler,
      trustTier: a.trustTier,
      vendor: a.vendor,
      status: a.status,
      sigma,
      runs,
      eventCount,
    };
    const list = buckets.get(pid) ?? [];
    list.push(node);
    buckets.set(pid, list);
  }

  const chains: ObservationDependencyChain[] = [];
  buckets.forEach((nodes, processId) => {
    const chainNodes = orderNodesByAuditHashChain(processId, [...nodes], auditChainEvents);
    const avgSigma =
      chainNodes.length > 0
        ? chainNodes.reduce((s: number, n: ObservationDependencyNode) => s + n.sigma, 0) / chainNodes.length
        : 0;
    const name =
      processId === UNASSIGNED_WORKFLOW_ID ? "Unassigned" : formatWorkflowLabel(processId);
    chains.push({ processId, name, avgSigma, nodes: chainNodes });
  });

  chains.sort((a, b) => {
    if (a.processId === UNASSIGNED_WORKFLOW_ID) return 1;
    if (b.processId === UNASSIGNED_WORKFLOW_ID) return -1;
    const ta = earliestCapturedMsInWorkflow(a.processId, auditChainEvents);
    const tb = earliestCapturedMsInWorkflow(b.processId, auditChainEvents);
    if (ta !== tb) return ta - tb;
    // Only when neither workflow has canonical events (no temporal signal).
    if (a.processId < b.processId) return -1;
    if (a.processId > b.processId) return 1;
    return 0;
  });

  return chains;
}

/**
 * PEL Trust Tier Auditor (Patent Family 8 — Autonomous Promotion)
 * Evaluates agents against the 30-day/Stability/Quality gate.
 */
export async function evaluateAgentPromotions(tenantId: string) {
  const agents = await storage.listAgents(tenantId);
  const now = new Date();
  const tierOrder = TRUST_TIER_ORDER as readonly string[];
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  for (const agent of agents) {
    const currentIndex = tierOrder.indexOf(agent.trustTier);
    // Exit if already at max tier or tier is unrecognized
    if (currentIndex === -1 || currentIndex === tierOrder.length - 1) continue;

    // 1. Tenure Check (≥ 30 days at current tier)
    const createdAt = new Date(agent.createdAt);
    const daysActive = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysActive < 30) continue;

    // 2. Stability Check (σ < 0.5 across snapshots)
    const snapshots = await db.select().from(equationSnapshots)
      .where(and(
        eq(equationSnapshots.tenantId, tenantId),
        eq(equationSnapshots.agentId, agent.agentId),
        gte(equationSnapshots.computedAt, thirtyDaysAgo)
      ));

    if (snapshots.length < 5) continue; // Need at least 5 snapshots to calculate σ

    const ropValues = snapshots.map(s => Number(s.rop ?? 0));
    const mean = ropValues.reduce((a, b) => a + b, 0) / ropValues.length;
    const variance = ropValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / ropValues.length;
    const sigma = Math.sqrt(variance);
    if (sigma >= 0.5) continue;

    // 3. Quality Check (≥ 95% threshold pass rate)
    const events = await db.select().from(canonicalEvents)
      .where(and(
        eq(canonicalEvents.tenantId, tenantId),
        eq(canonicalEvents.agentId, agent.agentId),
        gte(canonicalEvents.capturedAt, thirtyDaysAgo)
      ));

    const passCount = events.filter(e => e.passedThresholds).length;
    const passRate = events.length > 0 ? passCount / events.length : 0;
    if (passRate < 0.95) continue;

    // 4. Boundary Check (Zero open violations for this agent)
    const violations = await db.select().from(canonicalEvents)
      .where(and(
        eq(canonicalEvents.tenantId, tenantId),
        eq(canonicalEvents.agentId, agent.agentId),
        eq(canonicalEvents.policyOutcome, "blocked"),
        gte(canonicalEvents.capturedAt, thirtyDaysAgo)
      ));
    if (violations.length > 0) continue;

    // EXECUTE PROMOTION (use registry row only — listAgents adds aggregate fields)
    const nextTier = tierOrder[currentIndex + 1];
    const registryRow = await storage.getAgentById(agent.agentId, tenantId);
    if (registryRow) {
      const { id: _regId, ...reg } = registryRow;
      await storage.upsertAgent({ ...reg, trustTier: nextTier });
    }

    // Log the promotion to the Governance Decisions table
    await storage.insertGovernance({
      decisionId: `prom-${agent.agentId}-${Date.now().toString(36)}`,
      tenantId,
      firedAt: now.toISOString(),
      policyId: "GOV_TRUST_PROMOTION",
      policyOutcome: "promoted",
      rationale: `Autonomous promotion: Tenure=${daysActive.toFixed(0)}d, σ=${sigma.toFixed(3)}, passRate=${(passRate * 100).toFixed(1)}%.`,
      prevTrustTier: agent.trustTier,
      newTrustTier: nextTier,
      rerouteFromModel: null,
      rerouteToModel: null,
      subject: agent.agentId,
      actor: null,
      relatedRecId: null,
    });
  }
}


/* ============================================================
 * 5. Recommendation Generator (templated patterns)
 * ============================================================ */
export async function generateRecommendations(tenantId: string) {
  const activeAgentIds = await storage.getActiveTenantAgentIds(tenantId);
  if (activeAgentIds.length === 0) return 0;
  // Note: generateRecommendations uses snapshots, not raw events, so epoch filtering is not needed here.

  const snap = await storage.listSnapshots(tenantId, 24);
  const latest = snap[snap.length - 1];
  if (!latest) return;

  const out: InsertRecommendation[] = [];
  const now = new Date().toISOString();
  const mkId = () => `rec-${ulidLike()}`;

  // Recent telemetry to anchor recs to *real* agents/workflows for this tenant.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentEvents = await db
    .select({
      agentId: canonicalEvents.agentId,
      workflowId: canonicalEvents.workflowId,
      model: canonicalEvents.model,
      hyperscaler: canonicalEvents.hyperscaler,
      amortizedCostUsd: canonicalEvents.amortizedCostUsd,
      confidence: canonicalEvents.confidence,
      humanReview: canonicalEvents.humanReview,
      passedThresholds: canonicalEvents.passedThresholds,
    })
    .from(canonicalEvents)
    .where(and(
      eq(canonicalEvents.tenantId, tenantId),
      gte(canonicalEvents.capturedAt, since24h),
      inArray(canonicalEvents.agentId, activeAgentIds),
    ));

  const workflowKey = (wf: string | null) => (wf && wf.trim() ? wf.trim() : UNASSIGNED_WORKFLOW_ID);

  const workflowAgg = new Map<
    string,
    { n: number; queued: number; cost: number; confSum: number; passed: number }
  >();
  const agentAgg = new Map<
    string,
    { n: number; cost: number; confSum: number; passed: number; model: string | null; hyperscaler: string }
  >();

  for (const e of recentEvents) {
    const wf = workflowKey(e.workflowId ?? null);
    const wa = workflowAgg.get(wf) ?? { n: 0, queued: 0, cost: 0, confSum: 0, passed: 0 };
    wa.n += 1;
    if ((e.humanReview || "").toLowerCase() === "queued") wa.queued += 1;
    wa.cost += Number(e.amortizedCostUsd ?? 0);
    wa.confSum += Number(e.confidence ?? 0);
    if (e.passedThresholds) wa.passed += 1;
    workflowAgg.set(wf, wa);

    const aa = agentAgg.get(e.agentId) ?? {
      n: 0,
      cost: 0,
      confSum: 0,
      passed: 0,
      model: e.model ?? null,
      hyperscaler: e.hyperscaler,
    };
    aa.n += 1;
    aa.cost += Number(e.amortizedCostUsd ?? 0);
    aa.confSum += Number(e.confidence ?? 0);
    if (e.passedThresholds) aa.passed += 1;
    if (!aa.model && e.model) aa.model = e.model;
    agentAgg.set(e.agentId, aa);
  }

  const worstWorkflowByQueuedShare = () => {
    let best: { wf: string; n: number; queued: number } | null = null;
    for (const [wf, a] of Array.from(workflowAgg.entries())) {
      if (a.n < 5) continue;
      const share = a.queued / a.n;
      if (!best) best = { wf, n: a.n, queued: a.queued };
      else {
        const bestShare = best.queued / best.n;
        if (share > bestShare) best = { wf, n: a.n, queued: a.queued };
      }
    }
    return best;
  };

  const mostExpensiveAgent = () => {
    let best: { agentId: string; cost: number; n: number; model: string | null; hyperscaler: string } | null = null;
    for (const [agentId, a] of Array.from(agentAgg.entries())) {
      if (a.n < 3) continue;
      if (!best || a.cost > best.cost) {
        best = { agentId, cost: a.cost, n: a.n, model: a.model, hyperscaler: a.hyperscaler };
      }
    }
    return best;
  };

  // Helper: select real agent candidates for promotion and demotion across all trust tiers.
  const pickTrustPromotionCandidate = async (): Promise<{
    promotions: Array<{
      agentId: string; name: string; workflowId: string | null;
      trustTier: string; nextTier: string; model: string | null;
      passRate: number; sigma: number; n: number;
    }>;
    demotions: Array<{
      agentId: string; name: string; workflowId: string | null;
      trustTier: string; prevTier: string; model: string | null;
      passRate: number; blocked: number; n: number;
    }>;
  }> => {
    const tierOrder = TRUST_TIER_ORDER as readonly string[];
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const registry = await db
      .select()
      .from(agentRegistry)
      .where(eq(agentRegistry.tenantId, tenantId));

    if (registry.length === 0) return { promotions: [], demotions: [] };

    const active = registry.filter((a) =>
      ["active", "green", "amber", "red"].includes((a.status || "").toLowerCase()),
    );
    const agents = active.length > 0 ? active : registry;

    const events = await db
      .select({
        agentId: canonicalEvents.agentId,
        passedThresholds: canonicalEvents.passedThresholds,
        policyOutcome: canonicalEvents.policyOutcome,
      })
      .from(canonicalEvents)
      .where(and(eq(canonicalEvents.tenantId, tenantId), gte(canonicalEvents.capturedAt, since)));

    const sigmaRows = await db
      .select({
        agentId: ledgerRows.agentId,
        avgSigma: avg(ledgerRows.techVarianceSigma),
      })
      .from(ledgerRows)
      .where(
        and(
          eq(ledgerRows.tenantId, tenantId),
          eq(ledgerRows.status, "closed"),
          gte(ledgerRows.createdAt, since),
        ),
      )
      .groupBy(ledgerRows.agentId);

    const sigmaByAgent = new Map(
      sigmaRows.map((r) => [r.agentId, r.avgSigma != null ? Number(r.avgSigma) : 0]),
    );

    const stats = new Map<string, { n: number; passed: number; blocked: number }>();
    for (const e of events) {
      const cur = stats.get(e.agentId) ?? { n: 0, passed: 0, blocked: 0 };
      cur.n += 1;
      if (e.passedThresholds) cur.passed += 1;
      if ((e.policyOutcome || "").toLowerCase() === "blocked") cur.blocked += 1;
      stats.set(e.agentId, cur);
    }

    type PromotionEntry = { agentId: string; name: string; workflowId: string | null; trustTier: string; nextTier: string; model: string | null; passRate: number; sigma: number; n: number };
    type DemotionEntry  = { agentId: string; name: string; workflowId: string | null; trustTier: string; prevTier: string; model: string | null; passRate: number; blocked: number; n: number };
    const promotions: PromotionEntry[] = [];
    const demotions: DemotionEntry[] = [];

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const a of agents) {
      const currentIndex = tierOrder.indexOf(a.trustTier);
      if (currentIndex === -1) continue;

      // 30-day cool-down: skip tier change recommendations if the tier was updated recently
      const tierUpdatedAt = a.tierUpdatedAt ? new Date(a.tierUpdatedAt).getTime() : 0;
      if (Date.now() - tierUpdatedAt < thirtyDaysMs) continue;

      const s = stats.get(a.agentId) ?? { n: 0, passed: 0, blocked: 0 };
      const passRate = s.n > 0 ? s.passed / s.n : 0;
      const sigma = sigmaByAgent.get(a.agentId) ?? 0;

      // Promotion: eligible if not already at max tier and meets quality gates
      if (currentIndex < tierOrder.length - 1 && s.n >= 10 && s.blocked === 0 && passRate >= 0.95 && sigma < 0.5) {
        promotions.push({
          agentId: a.agentId,
          name: a.name,
          workflowId: a.workflowId ?? null,
          trustTier: a.trustTier,
          nextTier: tierOrder[currentIndex + 1]!,
          model: a.model ?? null,
          passRate,
          sigma,
          n: s.n,
        });
      }

      // Demotion: eligible if above T0 and showing poor reliability
      if (currentIndex > 0 && s.n >= 5 && (s.blocked > 2 || passRate < 0.70)) {
        demotions.push({
          agentId: a.agentId,
          name: a.name,
          workflowId: a.workflowId ?? null,
          trustTier: a.trustTier,
          prevTier: tierOrder[currentIndex - 1]!,
          model: a.model ?? null,
          passRate,
          blocked: s.blocked,
          n: s.n,
        });
      }
    }

    promotions.sort((x, y) => {
      if (y.passRate !== x.passRate) return y.passRate - x.passRate;
      if (x.sigma !== y.sigma) return x.sigma - y.sigma;
      return y.n - x.n;
    });
    demotions.sort((x, y) => {
      if (y.blocked !== x.blocked) return y.blocked - x.blocked;
      return x.passRate - y.passRate;
    });

    return { promotions, demotions };
  };

  if ((latest.cuow ?? 0) > 0.06) {
    const spend = mostExpensiveAgent();
    out.push({
      recId: mkId(), tenantId, generatedAt: now,
      template: "cost_optim", severity: "warn",
      title: "Cost per task above target",
      agentId: spend?.agentId,
      rationale: spend
        ? `CUoW is $${(latest.cuow ?? 0).toFixed(3)} (tenant). Highest 24h spend driver is ${spend.agentId} (${spend.model ?? spend.hyperscaler}) at $${spend.cost.toFixed(2)} across ${spend.n} runs. Consider routing long-context work to a cheaper model tier and re-measuring CUoW/MER.`
        : `CUoW is $${(latest.cuow ?? 0).toFixed(3)} (tenant). Consider routing long-context work to a cheaper model tier and re-measuring CUoW/MER.`,
      predictedDeltaUsd: -380.00, confidence: 0.82, status: "new",
    });
  }
  if ((latest.mer ?? 0) < 18 && (latest.mer ?? 0) > 0) {
    const spend = mostExpensiveAgent();
    out.push({
      recId: mkId(), tenantId, generatedAt: now,
      template: "vendor_swap", severity: "info",
      title: "Model Efficiency Ratio drift detected",
      agentId: spend?.agentId,
      rationale: spend
        ? `Tenant MER is ${(latest.mer ?? 0).toFixed(1)}. The highest-spend agent in the last 24h is ${spend.agentId} (${spend.model ?? spend.hyperscaler}). Route the next cohort of runs to an alternative model/vendor and re-measure MER/CUoW.`
        : `Tenant MER is ${(latest.mer ?? 0).toFixed(1)}. Route the next cohort of runs to an alternative model/vendor and re-measure MER/CUoW.`,
      predictedDeltaUsd: -120.00, confidence: 0.71, status: "new",
    });
  }
  if ((latest.ctr ?? 0) > 0.20) {
    const wf = worstWorkflowByQueuedShare();
    out.push({
      recId: mkId(), tenantId, generatedAt: now,
      template: "boundary_violation", severity: "warn",
      title: "Coordination Tax rising",
      workflowId: wf?.wf === UNASSIGNED_WORKFLOW_ID ? undefined : wf?.wf,
      rationale: wf
        ? `CTR is ${((latest.ctr ?? 0) * 100).toFixed(0)}% (tenant). In the last 24h, workflow ${wf.wf} had ${wf.queued}/${wf.n} runs queued for human review (${((wf.queued / wf.n) * 100).toFixed(0)}%). Reduce handoffs by tightening confidence gates, improving prompts/data, or upgrading the supervising tier once quality is stable.`
        : `CTR is ${((latest.ctr ?? 0) * 100).toFixed(0)}% (tenant). Reduce handoffs by tightening confidence gates, improving prompts/data, or upgrading the supervising tier once quality is stable.`,
      predictedDeltaUsd: -210.00, confidence: 0.68, status: "new",
    });
  }
  {
    const { promotions, demotions } = await pickTrustPromotionCandidate();
    if ((latest.tv ?? 0) > 1.05 && promotions.length > 0) {
      const cand = promotions[0]!;
      out.push({
        recId: mkId(),
        tenantId,
        generatedAt: now,
        template: "trust_promotion",
        severity: "info",
        title: "Trust tier promotion candidate",
        agentId: cand.agentId,
        workflowId: cand.workflowId ?? undefined,
        rationale:
          `Promotion candidate: ${cand.name} (${cand.agentId}) currently ${cand.trustTier}. ` +
          `Last-30d gates: passRate ${(cand.passRate * 100).toFixed(1)}% over ${cand.n} runs, ` +
          `σ=${cand.sigma.toFixed(3)}, 0 blocked outcomes. ` +
          `Tenant TV is ${(latest.tv ?? 0).toFixed(2)}× target; promote to ${cand.nextTier}.`,
        predictedDeltaUsd: 0,
        confidence: Math.max(0.5, Math.min(0.95, cand.passRate)),
        status: "new",
      });
    }
    for (const cand of demotions) {
      out.push({
        recId: mkId(),
        tenantId,
        generatedAt: now,
        template: "trust_demotion",
        severity: "error",
        title: "Trust tier demotion flag",
        agentId: cand.agentId,
        workflowId: cand.workflowId ?? undefined,
        rationale:
          `Demotion flag: ${cand.name} (${cand.agentId}) currently ${cand.trustTier}. ` +
          `Last-30d reliability: passRate ${(cand.passRate * 100).toFixed(1)}% over ${cand.n} runs, ` +
          `${cand.blocked} blocked outcome(s). ` +
          `Reliability below threshold; recommend demotion to ${cand.prevTier}.`,
        predictedDeltaUsd: 0,
        confidence: 0.85,
        status: "new",
      });
    }
  }
  // Deduplication gate: skip insertion if an active (status = 'new') card already
  // exists for the same (tenantId, template, agentId/workflowId) combination.
  const existingNew = await db
    .select({
      template: recommendations.template,
      agentId: recommendations.agentId,
      workflowId: recommendations.workflowId,
    })
    .from(recommendations)
    .where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.status, "new")));

  const activeKey = (template: string, agentId?: string, workflowId?: string) =>
    `${template}::${agentId ?? ""}::${workflowId ?? ""}`;

  const activeSet = new Set(
    existingNew.map((r) =>
      activeKey(r.template, r.agentId ?? undefined, r.workflowId ?? undefined),
    ),
  );

  let inserted = 0;
  for (const r of out) {
    const key = activeKey(r.template, r.agentId ?? undefined, r.workflowId ?? undefined);
    if (activeSet.has(key)) continue;
    await storage.insertRec(r);
    inserted++;
  }
  return inserted;
}

/* ============================================================
 * 6. Synthetic seeder — populates the dashboard with realistic
 *    cross-vendor traffic on first run.
 * ============================================================ */
const TENANT = "org-d63dc26f";
const AGENTS = [
  { id: "agt_odds_analyzer",      name: "Odds Analysis Agent",       hyperscaler: "anthropic",     model: "claude-sonnet-4-6", status: "green", trustTier: DEFAULT_AGENT_TRUST_TIER, baselineMin: 6,  hourlyCost: 70 },
  { id: "agt_line_compare",       name: "Line Comparison Agent",     hyperscaler: "openai",        model: "gpt-5",             status: "amber", trustTier: DEFAULT_AGENT_TRUST_TIER, baselineMin: 5,  hourlyCost: 68 },
  { id: "agt_recommendation",     name: "Recommendation Writer",     hyperscaler: "anthropic",     model: "claude-opus-4-7",   status: "red",   trustTier: DEFAULT_AGENT_TRUST_TIER, baselineMin: 10, hourlyCost: 90 },
  { id: "agt_customer_response",  name: "Customer Response Agent",   hyperscaler: "ms_copilot",    model: "gpt-5-mini",        status: "amber", trustTier: DEFAULT_AGENT_TRUST_TIER, baselineMin: 4,  hourlyCost: 65 },
  { id: "agt_resume_screener_v3", name: "Resume Screener v3",        hyperscaler: "uniphore_baic", model: "phi-4",             status: "green", trustTier: DEFAULT_AGENT_TRUST_TIER, baselineMin: 5,  hourlyCost: 72 },
  { id: "agt_service_advisor",    name: "Service Advisor Agent",     hyperscaler: "mistral",       model: "mistral-large-3",   status: "green", trustTier: DEFAULT_AGENT_TRUST_TIER, baselineMin: 7,  hourlyCost: 78 },
];

/* ============================================================
 * 7. UoP Library — publish a measured Unit of Production
 *    (returns it to the catalogue for reuse + composition)
 * ============================================================ */
export async function publishUoP(opts: {
  tenantId: string;
  name: string;
  workflowId?: string;
  agentId?: string;
  description?: string;
  publishedBy?: string;
  classification?: "Human-Only" | "AI-Assisted" | "Hybrid" | "AI-Primary";
  trustTier?: string;
  /** if omitted we recompute from latest snapshot */
  metrics?: { laborValueSavedUsd: number; amortizedCostUsd: number; rop: number; cuow: number; mer: number; huop: number; auop: number; synergy: number };
}) {
  let metrics = opts.metrics;
  if (!metrics) {
    const snaps = await storage.listSnapshots(opts.tenantId, 24);
    const latest = snaps[snaps.length - 1];
    if (!latest) throw new Error("no equation snapshot to publish from");
    const activeAgentIds = await storage.getActiveTenantAgentIds(opts.tenantId);
    const events = await storage.listCanonicalEventsForAgents(opts.tenantId, activeAgentIds, 5000);
    const totalLabor = events.reduce((s, e) => s + (e.laborValueSavedUsd ?? 0), 0);
    const totalCost = events.reduce((s, e) => s + (e.amortizedCostUsd ?? 0), 0);
    metrics = {
      laborValueSavedUsd: totalLabor,
      amortizedCostUsd: totalCost,
      rop: latest.rop ?? 0,
      cuow: latest.cuow ?? 0,
      mer: latest.mer ?? 0,
      huop: latest.huop ?? 0,
      auop: latest.auop ?? 0,
      synergy: latest.synergyS ?? 0,
    };
  }
  const total = metrics.huop + metrics.auop;
  const huopShare = total > 0 ? metrics.huop / total : 0;
  const auopShare = total > 0 ? metrics.auop / total : 0;
  const uopId = `uop-${new Date().toISOString().slice(0,10)}-${ulidLike().slice(-6)}`;
  const signature = sign(FUZEBOX_KMS_KEY, `${uopId}:${metrics.laborValueSavedUsd}:${metrics.rop}`);
  return storage.publishUoP({
    uopId, tenantId: opts.tenantId,
    name: opts.name,
    workflowId: opts.workflowId,
    agentId: opts.agentId,
    publishedAt: new Date().toISOString(),
    publishedBy: opts.publishedBy ?? "les@fuzebox.ai",
    classification: opts.classification ?? (metrics.rop > 1.2 ? "AI-Primary" : metrics.rop > 0.8 ? "Hybrid" : "AI-Assisted"),
    description: opts.description,
    laborValueSavedUsd: metrics.laborValueSavedUsd,
    amortizedCostUsd: metrics.amortizedCostUsd,
    ropValue: metrics.rop,
    cuow: metrics.cuow,
    mer: metrics.mer,
    huopShare, auopShare,
    synergyShare: metrics.synergy,
    trustTier: opts.trustTier ?? DEFAULT_AGENT_TRUST_TIER,
    signature,
    status: "published",
    reuseCount: 0,
  });
}

export async function seedIfEmpty(tenantId: string = TENANT) {
  const existing = await storage.listAgents(tenantId);
  if (existing.length > 0) return;

  const now = new Date().toISOString();
  for (const a of AGENTS) {
    await storage.upsertAgent({
      agentId: a.id, tenantId, name: a.name, hyperscaler: a.hyperscaler,
      model: a.model, trustTier: a.trustTier, vendor: a.hyperscaler,
      workflowId: a.id.includes("resume") ? "wf_apply_2026Q2" : "wf_default",
      status: a.status, createdAt: now,
      humanBaselineMinutes: a.baselineMin,
      manualHourlyCostUsd: a.hourlyCost,
    });
  }

  // Coverage manifest
  const covers = [
    { hyperscaler: "anthropic",     surface: "messages",  status: "covered" },
    { hyperscaler: "anthropic",     surface: "mcp",       status: "covered" },
    { hyperscaler: "openai",        surface: "responses", status: "covered" },
    { hyperscaler: "openai",        surface: "operator",  status: "gap" },
    { hyperscaler: "mistral",       surface: "responses", status: "covered" },
    { hyperscaler: "ms_copilot",    surface: "agent_run", status: "degraded" },
    { hyperscaler: "uniphore_baic", surface: "mcp",       status: "covered" },
  ];
  for (const c of covers) {
    await storage.upsertCoverage({
      tenantId, hyperscaler: c.hyperscaler, surface: c.surface, status: c.status,
      activatedAt: now, lastTelemetryAt: now,
      signedAt: now, signature: sign(FUZEBOX_KMS_KEY, `coverage:${c.hyperscaler}:${c.surface}`),
    });
    if (c.status === "gap") {
      await captureOnCoverageGap({ tenantId, hyperscaler: c.hyperscaler, surface: c.surface });
    }
  }

  // Seed ~120 events distributed over the past 24h
  const start = Date.now() - 24 * 3600 * 1000;
  for (let i = 0; i < 120; i++) {
    const a = AGENTS[i % AGENTS.length];
    const ts = new Date(start + (i / 120) * 24 * 3600 * 1000);
    const inTok = 800 + Math.floor(Math.random() * 1500);
    const outTok = 200 + Math.floor(Math.random() * 600);
    const conf = a.status === "red" ? 0.55 + Math.random() * 0.25
               : a.status === "amber" ? 0.7 + Math.random() * 0.2
               : 0.85 + Math.random() * 0.13;
    const rework = conf < 0.70 ? (1 - conf) * 12 : conf < 0.90 ? (1 - conf) * 8 : 0;
    const raw: RawVendorEvent = {
      id: `req_${i}`, model: a.model,
      usage: { input_tokens: inTok, output_tokens: outTok, prompt_tokens: inTok, completion_tokens: outTok },
      stop_reason: "end_turn",
    };
    const ctx: AdapterContext = {
      tenantId, workspaceId: "ws_demo",
      agentId: a.id, workflowId: a.id.includes("resume") ? "wf_apply_2026Q2" : "wf_default",
      skill: a.id.includes("resume") ? "weighted-scoring" : "decision-support",
      trigger: "schedule", capturedVia: "litellm",
      costCenter: "CC_DEMO",
    };
    const { event, ledger } = await ingest({
      hyperscaler: a.hyperscaler, raw, ctx,
      qualityConfidence: conf, reworkMinutes: rework,
    });
    // backdate to spread the timeline
    // (storage already wrote `now`; we patch the event row directly via SQL would be overkill for seed)
    void event; void ts;

    // Reconcile most rows with realistic SoR data
    if (Math.random() > 0.18) {
      const variance = (Math.random() - 0.45) * 0.6;
      await reconcileSoR({
        decisionId: ledger.decisionId,
        actualCostUsd: ledger.predictedCostUsd * (1 + variance * 0.5),
        actualOutcomeUsd: ledger.predictedOutcomeUsd * (1 + variance),
        sor: ["salesforce", "sap", "hubspot", "oracle_gl"][i % 4],
      });
    }
  }

  // Run the equation rollup a few times to build a sparkline
  for (let i = 0; i < 6; i++) await rollupEquations(tenantId);
  await generateRecommendations(tenantId);

  // Pre-seed the UoP Library with three published units
  const seed = [
    {
      name: "Resume Screening · Tier-2 Hybrid",
      workflowId: "wf_apply_2026Q2", agentId: "agt_resume_screener_v3",
      classification: "AI-Primary" as const,
      description: "Weighted-scoring rubric on inbound resumes for technology and 1099 contractor roles. Reduces fill-time 52% with human override on edge cases.",
      trustTier: "T3_autonomous",
      metrics: { laborValueSavedUsd: 14820, amortizedCostUsd: 2185, rop: 6.78, cuow: 0.0144, mer: 6.78, huop: 4250, auop: 10570, synergy: 0.21 },
    },
    {
      name: "Service Advisor · Conversational",
      workflowId: "wf_default", agentId: "agt_service_advisor",
      classification: "Hybrid" as const,
      description: "Mistral-large-3 conversational agent guiding service writers through estimate creation. Boosts accuracy on first quote.",
      trustTier: "T2_supervised",
      metrics: { laborValueSavedUsd: 9450, amortizedCostUsd: 1640, rop: 5.76, cuow: 0.0182, mer: 5.76, huop: 3780, auop: 5670, synergy: 0.18 },
    },
    {
      name: "Odds Analysis · Edge Detection",
      workflowId: "wf_default", agentId: "agt_odds_analyzer",
      classification: "AI-Primary" as const,
      description: "Sonnet 4.6 edge-detection across multi-book lines. Closed-loop reconciliation against Salesforce + Oracle GL.",
      trustTier: "T3_autonomous",
      metrics: { laborValueSavedUsd: 18290, amortizedCostUsd: 3220, rop: 5.68, cuow: 0.0212, mer: 5.68, huop: 4570, auop: 13720, synergy: 0.24 },
    },
  ];
  for (const u of seed) {
    await publishUoP({ tenantId, ...u });
  }

  // Seed a fixed demo Workforce API key for the demo tenant so .env.example works out of the box.
  const [existingKey] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .limit(1);

  if (!existingKey) {
    const keyHash = crypto.createHash("sha256").update("key_demo11", "utf8").digest("hex");
    // key_hash is globally unique: if another tenant already holds the demo key, skip it.
    const inserted = await db.insert(apiKeys).values({
      keyHash,
      tenantId,
      label: "Demo Workforce",
    }).onConflictDoNothing().returning({ id: apiKeys.id });
    if (inserted.length > 0) console.log("Seeded demo Workforce API key for tenant", tenantId);
  }
}
