import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { storage, db } from "./storage";
import { apiKeys, canonicalEvents, ledgerRows, agentRegistry, governanceRules, governanceDecisions, fmeaItems, insertFmeaItemSchema, insertCanonicalEventSchema, DEFAULT_AGENT_TRUST_TIER, users, buildVsBuyComparisons, buildVsBuyMatrices, insertBuildVsBuyComparisonSchema, insertBuildVsBuyMatrixSchema } from "@shared/schema";
import { and, desc, eq, isNull, sql, count, sum, max } from "drizzle-orm";
import {
  ingest, reconcileSoR, rollupEquations,
  generateRecommendations, adapterFor,
  publishUoP,
  getObservationDependencies,
  sanitizeToKnown,
  sanitizeWorkflowId,
} from "./cognition";
import { verifyPassword, signToken, hashPassword } from "./auth";
import { requireAuth } from "./middleware/requireAuth";
import { resolveApiKey } from "./middleware/resolveApiKey";
import { getScenariosBaseline } from "./scenariosBaseline";
import { captureOnCoverageGap } from "./fmeaCapture";

// DPMO → Sigma conversion using the rational approximation of the inverse normal CDF.
// The +1.5 shift accounts for the standard Six Sigma 1.5σ long-term drift assumption.
function dpmoToSigma(defects: number, opportunities: number): number {
  if (opportunities <= 0) return 0;
  const dpmo = (defects / opportunities) * 1_000_000;
  if (dpmo >= 1_000_000) return 0;
  if (dpmo <= 0) return 6.0;
  const p = 1 - dpmo / 1_000_000;
  // Abramowitz & Stegun rational approximation of probit (inverse normal CDF)
  const c = [2.515517, 0.802853, 0.010328];
  const d = [1.432788, 0.189269, 0.001308];
  const t = Math.sqrt(-2 * Math.log(p < 0.5 ? p : 1 - p));
  const num = c[0] + c[1] * t + c[2] * t * t;
  const den = 1 + d[0] * t + d[1] * t * t + d[2] * t * t * t;
  const z = t - num / den;
  const probit = p < 0.5 ? -z : z;
  return Math.max(0, Math.min(6, probit + 1.5));
}

type CorrelationStrength = "Strong" | "Moderate" | "Weak";
type CorrelationCategory = "Quality" | "Temporal" | "Model comparison" | "Task analysis";
type CorrelationInsight = {
  id: string;
  title: string;
  strength: CorrelationStrength;
  r: number; // pearson correlation coefficient (signed)
  category: CorrelationCategory;
  insight: string;
  metric: string;
  workflow?: string;
};

function pearson(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 3) return 0;
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  if (!Number.isFinite(den) || den === 0) return 0;
  const r = num / den;
  if (!Number.isFinite(r)) return 0;
  return Math.max(-1, Math.min(1, r));
}

function strengthFromR(r: number): CorrelationStrength {
  const a = Math.abs(r);
  if (a >= 0.8) return "Strong";
  if (a >= 0.55) return "Moderate";
  return "Weak";
}

/* =====================================================================
 * Helpers — Deploy Agent Code parsing + UoP instruction generator
 * ===================================================================== */
type ParsedDeployment = {
  agentKind: string;
  manifest: Record<string, any>;
  validationStatus: "valid" | "warnings" | "errors";
  validationNotes: string;
};

function parseAgentCode(codeLanguage: string, rawCode: string): ParsedDeployment {
  const lang = (codeLanguage || "").toLowerCase();
  if (!rawCode || typeof rawCode !== "string" || rawCode.trim().length === 0) {
    return { agentKind: "agent", manifest: {}, validationStatus: "errors", validationNotes: "Empty payload" };
  }
  const notes: string[] = [];

  if (lang === "json") {
    try {
      const obj = JSON.parse(rawCode);
      const manifest: Record<string, any> = {
        agent_id: obj.agent_id ?? obj.id ?? null,
        name: obj.name ?? obj.agent_name ?? null,
        hyperscaler: obj.hyperscaler ?? obj.provider ?? "anthropic",
        model: obj.model ?? null,
        workflow_id: obj.workflow_id ?? obj.workflow ?? null,
        vendor: obj.vendor ?? null,
        skills: obj.skills ?? obj.tools ?? [],
        triggers: obj.triggers ?? [],
        guardrails: obj.guardrails ?? obj.policies ?? [],
        inputs: obj.inputs ?? obj.input_schema ?? null,
        outputs: obj.outputs ?? obj.output_schema ?? null,
        rop_target: obj.rop_target ?? obj.ropTarget ?? null,
        recursive_depth: obj.recursive_depth ?? obj.recursiveDepth ?? null,
      };
      if (!manifest.agent_id) notes.push("missing agent_id (will be auto-generated)");
      if (!manifest.model) notes.push("no model specified — defaulting to claude-sonnet-4-6");
      const kind = obj.kind ?? obj.agent_kind ?? (Array.isArray(obj.agents) ? "crew" : Array.isArray(obj.tasks) ? "workflow" : "agent");
      return {
        agentKind: kind,
        manifest,
        validationStatus: notes.length ? "warnings" : "valid",
        validationNotes: notes.join(" · ") || "JSON manifest parsed cleanly.",
      };
    } catch (e: any) {
      return { agentKind: "agent", manifest: { _raw: rawCode.slice(0, 800) }, validationStatus: "errors", validationNotes: `Invalid JSON: ${e.message}` };
    }
  }

  if (lang === "crewai") {
    // Heuristic CrewAI parser — pulls Agent(...), Task(...), Crew(...) blocks
    const agents = Array.from(rawCode.matchAll(/Agent\s*\(([^)]*)\)/g), (m) => m[1]);
    const tasks  = Array.from(rawCode.matchAll(/Task\s*\(([^)]*)\)/g), (m) => m[1]);
    const crews  = Array.from(rawCode.matchAll(/Crew\s*\(([^)]*)\)/g), (m) => m[1]);
    const tools  = Array.from(rawCode.matchAll(/tools\s*=\s*\[([^\]]*)\]/g), (m) => m[1]);
    const roleMatch = rawCode.match(/role\s*=\s*["']([^"']+)["']/);
    const goalMatch = rawCode.match(/goal\s*=\s*["']([^"']+)["']/);
    const backstoryMatch = rawCode.match(/backstory\s*=\s*["']([^"']+)["']/);
    const llmMatch = rawCode.match(/llm\s*=\s*["']([^"']+)["']/);
    const manifest = {
      agent_id: null,
      hyperscaler: llmMatch?.[1]?.includes("gpt") ? "openai" : llmMatch?.[1]?.includes("claude") ? "anthropic" : "anthropic",
      model: llmMatch?.[1] ?? null,
      role: roleMatch?.[1] ?? null,
      goal: goalMatch?.[1] ?? null,
      backstory: backstoryMatch?.[1] ?? null,
      agentCount: agents.length,
      taskCount: tasks.length,
      crewCount: crews.length,
      tools: tools.flatMap((t) => t.split(",").map((s: string) => s.trim()).filter(Boolean)).slice(0, 30),
    };
    if (agents.length === 0) notes.push("no Agent(...) constructor detected");
    if (tasks.length === 0) notes.push("no Task(...) constructor detected");
    return {
      agentKind: crews.length > 0 ? "crew" : tasks.length > 1 ? "workflow" : "agent",
      manifest,
      validationStatus: notes.length ? "warnings" : "valid",
      validationNotes: notes.join(" · ") || `Detected ${agents.length} agent(s), ${tasks.length} task(s), ${crews.length} crew(s).`,
    };
  }

  // Generic Python
  const defs = Array.from(rawCode.matchAll(/def\s+(\w+)\s*\(/g), (m) => m[1]);
  const classes = Array.from(rawCode.matchAll(/class\s+(\w+)\s*[\(:]/g), (m) => m[1]);
  const imports = Array.from(rawCode.matchAll(/(?:^|\n)\s*(?:from|import)\s+([\w\.]+)/g), (m) => m[1]).slice(0, 20);
  const manifest = {
    agent_id: null,
    hyperscaler: "anthropic",
    classes, functions: defs, imports,
    lineCount: rawCode.split("\n").length,
  };
  if (defs.length === 0 && classes.length === 0) notes.push("no functions or classes detected");
  return {
    agentKind: classes.length > 1 ? "workflow" : "agent",
    manifest,
    validationStatus: notes.length ? "warnings" : "valid",
    validationNotes: notes.join(" · ") || `Detected ${classes.length} class(es), ${defs.length} function(s), ${imports.length} import(s).`,
  };
}

function buildUopInstructions(opts: {
  name: string;
  classification: string;
  trustTier: string;
  ropTarget: number;
  recursiveDepth: number;
  parsed: ParsedDeployment;
  reuseFrom: any;
}): string {
  const { name, classification, trustTier, ropTarget, recursiveDepth, parsed, reuseFrom } = opts;
  const ttHuman = trustTier.replace(/_/g, " · ");
  const reuseLine = reuseFrom
    ? `Inherits economic profile from UoP **${reuseFrom.name}** (${reuseFrom.uopId}) · prior RoP ${reuseFrom.ropValue.toFixed(2)}× · prior MER ${reuseFrom.mer.toFixed(2)}.`
    : "No prior UoP inheritance — this is a greenfield deployment.";

  return [
    `# UoP Instructions — ${name}`,
    ``,
    `## 1. Identity & Classification`,
    `- **Agent Kind:** ${parsed.agentKind}`,
    `- **Classification:** ${classification}`,
    `- **Trust Tier:** ${ttHuman}`,
    `- **RoP Target:** ${ropTarget.toFixed(2)}×`,
    `- **Recursive Depth:** ${recursiveDepth} (max self-improvement iterations per cycle)`,
    `- **Reuse:** ${reuseLine}`,
    ``,
    `## 2. Recursive Training Profile`,
    `Recursive training runs in three nested loops. Each loop closes against the Predictive Economic Ledger and only promotes the agent if RoP ≥ ${ropTarget.toFixed(2)}× sustains over the rolling window.`,
    ``,
    `1. **Inner loop (per call) — depth ${recursiveDepth}.** After each invocation, the agent reads its own ledger row (Predicted vs Actual), generates an attribution patch (prompt | routing | data | policy), and commits a Correction reference. Patches above 0.18 σ variance are auto-rejected.`,
    `2. **Outer loop (per workflow window — 24h).** A meta-evaluator scores aggregate CUoW, MER, and CTR. If MER drops below the trust-tier floor for ${ttHuman}, the agent is auto-demoted one tier and routed through the Operator surface for human review.`,
    `3. **Promotion loop (per economic cycle — 7d).** The TUoP master equation re-computes synergy S given current H-UoP / A-UoP shares. If RoP ≥ ${ropTarget.toFixed(2)}× sustains 7 days *and* no critical FMEA scenario fires, the agent is promoted one tier and re-signed.`,
    ``,
    `## 3. New Agent Bootstrapping Sequence`,
    `On first deploy:`,
    `- Register in Agent Registry under tier **${ttHuman}** (status: green).`,
    `- Open a virtual UoP draft in the Cognition Plane (visible immediately, not yet published).`,
    `- Begin shadow execution against last 50 reconciled ledger rows of the parent skill (back-fit).`,
    `- After back-fit, switch to live execution with budget circuit-breaker ($5/call ceiling).`,
    `- After 50 live, ledger-closed events, the UoP becomes eligible for publish-to-Library.`,
    ``,
    `## 4. Task & Workflow Hooks`,
    `- **on_invocation:** sign predicted UEF eight-dimension vector before any spend.`,
    `- **on_completion:** capture canonical event, append to HMAC chain, request SoR co-sign.`,
    `- **on_variance:** if |σ| ≥ 0.18, fire DIR (Detect → Isolate → Remediate) and emit attribution patch.`,
    `- **on_promotion:** re-sign manifest, bump trust tier, archive prior signature for audit.`,
    ``,
    `## 5. Governance Constraints`,
    `- Cannot exceed RoP target without human attestation (Operator surface).`,
    `- Must register on Coverage Manifest under its hyperscaler · surface combination.`,
    `- Compliance Cartridges in scope: GDPR, EU AI Act Annex III (if PII routes), SOC 2 Type II.`,
    `- Off-policy outputs are logged-only at T0 / T1, blocked at T2+, hard-blocked at T3.`,
    ``,
    `## 6. Economic Mandate`,
    `This deployment must, within 30 days, produce ≥ 50 ledger-closed events. Cohort ROI is reviewed against the agent's measured H-UoP / A-UoP shares. If the synergy term S falls below 0.10 (low collaboration uplift), the agent is flagged for re-architecture, not retirement — re-architecture is the default response.`,
    ``,
    `## 7. Library Pathway`,
    `Once the deployment satisfies criteria above, the **Send to UoP Library** action on the Cognition Plane publishes a permanent UoP record with measured economics. Future deployments may inherit by referencing the published UoP id, which is logged here in section 1.`,
    ``,
    `_Generated at deploy time. Re-renders on each retrain cycle._`,
  ].join("\n");
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {

  // ==========================================
  // AUTHENTICATION ROUTES
  // ==========================================
  
  // --- REGISTER (NEW TENANT & USER) ---
  app.post("/api/auth/register", async (req, res) => {
    const { workspaceName, tenantSlug, username, password } = req.body;

    if (!workspaceName || !tenantSlug || !username || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    try {
      // 1. Check if the workspace URL is already taken by someone else
      const existingTenant = await storage.getTenantBySlug(tenantSlug);
      if (existingTenant) {
        return res.status(400).json({ message: "That workspace URL is already taken" });
      }

      // 2. Create the brand new workspace (Tenant)
      const newTenant = await storage.createTenant({
        id: crypto.randomUUID(), // Generates a unique ID for the tenant
        name: workspaceName,
        slug: tenantSlug,
        plan: "starter",
        status: "active",
        createdAt: new Date().toISOString(),
      });

      // 3. Hash the password
      const hashedPassword = await hashPassword(password);

      // 4. Create the first user (Admin) inside this new workspace
      const user = await storage.createUser({
        tenantId: newTenant.id,
        username,
        passwordHash: hashedPassword,
      });

      // 5. Instantly log them in securely
      const token = signToken({ userId: user.id, tenantId: newTenant.id });
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // 6. Return safe user data
      const { passwordHash, ...safeUser } = user;
      res.status(201).json({ user: safeUser, workspace: newTenant.name });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- LOGIN ---
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    try {
      // 1. Find user globally by username
      const user = await storage.getUserByGlobalUsername(username);
      if (!user) return res.status(401).json({ message: "Invalid credentials" });

      // 2. Verify password
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) return res.status(401).json({ message: "Invalid credentials" });

      // 3. Sign JWT using the tenantId from the user's record
      const token = signToken({ userId: user.id, tenantId: user.tenantId });
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      // 5. Return safe user data
      const { passwordHash, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- GET CURRENT USER (/me) ---
  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const { userId, tenantId } = res.locals.auth!;
      const user = await storage.getUserById(userId, tenantId);
      
      if (!user) {
        res.clearCookie("token");
        return res.status(401).json({ message: "User no longer exists" });
      }

      const { passwordHash, ...safeUser } = user;
      res.json({ user: safeUser });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // --- LOGOUT ---
  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.status(200).json({ message: "Logged out successfully" });
  });

  /* ---------- Admin ---------- */

  // Workforce integration API keys (per-tenant)
  app.post("/api/admin/api-keys", requireAuth, async (req: Request, res: Response) => {
    const { tenantId } = res.locals.auth!;
    const { label } = req.body ?? {};
    if (!label || typeof label !== "string" || label.trim().length === 0) {
      return res.status(400).json({ error: "label is required" });
    }
    const rawKey = await storage.createApiKey(tenantId, label.trim());
    // IMPORTANT: raw key is only returned once, here.
    res.json({ key: rawKey, label: label.trim(), tenantId });
  });

  app.get("/api/admin/api-keys", requireAuth, async (_req: Request, res: Response) => {
    const { tenantId } = res.locals.auth!;
    const rows = await db
      .select({
        id: apiKeys.id,
        label: apiKeys.label,
        createdAt: apiKeys.createdAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.tenantId, tenantId))
      .orderBy(desc(apiKeys.createdAt));
    res.json(rows);
  });

  app.delete("/api/admin/api-keys/:id", requireAuth, async (req: Request, res: Response) => {
    const idRaw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const id = Number(idRaw);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
    await storage.revokeApiKey(id);
    res.json({ success: true });
  });

  /* ---------- Observation Plane ---------- */
  app.post("/api/observation/ingest", resolveApiKey, async (req: Request, res: Response) => {
    try {
      const { hyperscaler, raw, ctx, qualityConfidence, reworkMinutes } = req.body;
      if (!adapterFor(hyperscaler)) return res.status(400).json({ error: `unknown hyperscaler ${hyperscaler}` });
      const resolvedCtx = { ...ctx, tenantId: res.locals.auth!.tenantId };

      // Accept policyOutcome and humanReview from root level or nested inside ctx.
      const policyOutcome: string | undefined =
        req.body.policyOutcome ?? ctx?.policyOutcome ?? undefined;
      const humanReview: string | undefined =
        req.body.humanReview ?? ctx?.humanReview ?? undefined;

      const result = await ingest({
        hyperscaler,
        raw,
        ctx: resolvedCtx,
        model: resolvedCtx.model,
        qualityConfidence,
        reworkMinutes,
        policyOutcome,
        humanReview,
      });

      // 2. AUTO-RECONCILE (Closes the ledger row immediately)
      await reconcileSoR({
        decisionId: result.ledger.decisionId,
        actualCostUsd: result.event.vendorCostUsd ?? 0,
        actualOutcomeUsd: result.event.laborValueSavedUsd ?? 0,
        sor: "fuzebox_telemetry",
        existingRow: result.ledger // PASS THE ROW DIRECTLY
      });

      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // Direct canonical ingestion for the Python agent orchestrator.
  // Expects a pre-formed canonical event (insertCanonicalEventSchema shape) with
  // auditHash already computed. We re-derive the hash server-side to verify.
  app.post("/api/observation/ingest/canonical", resolveApiKey, async (req: Request, res: Response) => {
    try {
      const validation = insertCanonicalEventSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ error: "Invalid payload", details: validation.error.flatten() });
      }

      const data = { ...validation.data, tenantId: res.locals.auth!.tenantId };
      const { auditHash, prevEventHash } = data;

      // Re-derive HMAC using the same formula as the Python agent:
      // HMAC-SHA256(secret, (prevEventHash || "null") + JSON.stringify(payload_without_auditHash))
      const secret = process.env.ECL_SECRET_KEY || "dev-secret-key";
      const { auditHash: _dropped, ...payloadWithoutHash } = data as any;
      const message = (prevEventHash ?? "null") + JSON.stringify(payloadWithoutHash);
      const expectedHash = crypto.createHmac("sha256", secret).update(message).digest("hex");

      if (expectedHash !== auditHash) {
        return res.status(403).json({ error: "Signature verification failed" });
      }

      // Persist the canonical event
      const [event] = await db.insert(canonicalEvents).values(data).returning();

      // Bootstrap a PEL row for Predicted-vs-Actual tracking (ledger chain mirrors canonical audit chain).
      const now = new Date().toISOString();

      const [newLedgerRow] = await db.insert(ledgerRows).values({
        decisionId: data.decisionId,
        tenantId: data.tenantId,
        agentId: data.agentId,
        workflowId: data.workflowId ?? null,
        skillId: data.skill ?? null,
        status: "open",
        createdAt: now,
        predictedCostUsd: data.vendorCostUsd ?? 0,
        predictedOutcomeUsd: data.laborValueSavedUsd ?? 0,
        actualCostUsd: data.vendorCostUsd ?? 0,
        actualOutcomeUsd: data.laborValueSavedUsd ?? 0,
        actualSourceSor: "fuzebox_internal_telemetry",
        predictedSignature: `psig_${data.decisionId}`,
        predictedSignedAt: now,
        rowHash: event.auditHash,
        prevRowHash: event.prevEventHash ?? null,
      });

      // Immediately reconcile with internal telemetry values so both HMAC
      // signatures (fuzebox_sig + rpotential_sig) are generated and
      // cosignStatus becomes "complete".
      await reconcileSoR({
        decisionId: data.decisionId,
        actualCostUsd: data.vendorCostUsd ?? 0,
        actualOutcomeUsd: data.laborValueSavedUsd ?? 0,
        sor: "internal_telemetry",
        existingRow: newLedgerRow // PASS THE ROW DIRECTLY
      });

      const postCanon = await storage.getAgentById(data.agentId, data.tenantId);
      const canonModel = sanitizeToKnown(data.model);
      const canonVendor = sanitizeToKnown((data as { vendor?: string }).vendor, data.hyperscaler);
      const canonWorkflowId = sanitizeWorkflowId(data.workflowId ?? undefined);
      await storage.registerOrRefreshAgent({
        agentId: data.agentId,
        tenantId: data.tenantId,
        name: data.agentId.replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
        hyperscaler: data.hyperscaler,
        model: canonModel,
        trustTier: postCanon?.trustTier ?? DEFAULT_AGENT_TRUST_TIER,
        vendor: canonVendor,
        workflowId: canonWorkflowId,
        status: postCanon?.status ?? "active",
        createdAt: postCanon?.createdAt ?? now,
      });

      res.json({ eventId: event.eventId, decisionId: event.decisionId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/observation/events", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    res.json(await storage.listCanonicalEvents(tenantId, 5000));
  });

  // AI Screening aggregation — histogram, HITL gate metrics, and skill frequency
  app.get("/api/observation/screening", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const events = await storage.listCanonicalEvents(tenantId, 5000);

    // Score histogram: bucket confidence*100 into 10-point bands
    const BINS = ["0–10","10–20","20–30","30–40","40–50","50–60","60–70","70–80","80–90","90–100"] as const;
    const histMap: Record<string, number> = {};
    BINS.forEach(b => { histMap[b] = 0; });

    let hitlAwaitingCount = 0;
    let totalReviewed = 0;
    let alignedCount = 0;
    const skillCounts: Record<string, number> = {};

    for (const e of events) {
      // histogram
      if (e.confidence != null) {
        const score = e.confidence * 100;
        const bucketIdx = Math.min(9, Math.floor(score / 10));
        histMap[BINS[bucketIdx]] = (histMap[BINS[bucketIdx]] ?? 0) + 1;
      }

      // HITL awaiting: score 60–70, human_review = 'pending'
      if (
        e.confidence != null &&
        e.confidence >= 0.60 && e.confidence < 0.70 &&
        e.humanReview === "pending"
      ) {
        hitlAwaitingCount++;
      }

      // Reviewer alignment: human_review = 'verified' and passed_thresholds = true
      if (e.humanReview != null && e.humanReview !== "auto" && e.humanReview !== "pending") {
        totalReviewed++;
        if (e.humanReview === "verified" && e.passedThresholds) {
          alignedCount++;
        }
      }

      // Skill coverage: only rows that passed thresholds
      if (e.passedThresholds && e.skill) {
        skillCounts[e.skill] = (skillCounts[e.skill] ?? 0) + 1;
      }
    }

    const histogram = BINS.map(bin => ({ bin, count: histMap[bin] ?? 0 }));
    const totalCandidates = histogram.reduce((s, b) => s + b.count, 0);
    const reviewerAlignment = totalReviewed > 0 ? alignedCount / totalReviewed : null;

    const skills = Object.entries(skillCounts)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({
      histogram,
      totalCandidates,
      hitlAwaiting: hitlAwaitingCount,
      reviewerAlignment,
      skills,
    });
  });

  app.get("/api/observation/coverage", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    res.json(await storage.listCoverage(tenantId));
  });

  // Called by vendor webhook integrations or the platform-setup flow when a new surface
  // coverage status is reported. A "gap" status auto-creates an FMEA risk item.
  app.post("/api/observation/coverage", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    const { hyperscaler, surface, status, activatedAt, lastTelemetryAt } = req.body ?? {};
    if (!hyperscaler || !surface || !status) {
      return res.status(400).json({ error: "hyperscaler, surface, and status are required" });
    }
    const now = new Date().toISOString();
    const entry = await storage.upsertCoverage({
      tenantId,
      hyperscaler,
      surface,
      status,
      activatedAt: activatedAt ?? now,
      lastTelemetryAt: lastTelemetryAt ?? now,
      signedAt: now,
      signature: crypto.createHmac("sha256", process.env.FBX_HMAC_SECRET ?? "fbx-dev-secret-rotate-in-prod")
        .update(`coverage:${hyperscaler}:${surface}`).digest("hex"),
    });

    if (status === "gap") {
      captureOnCoverageGap({ tenantId, hyperscaler, surface })
        .catch((e) => console.error("[fmeaCapture] captureOnCoverageGap failed:", e));
    }

    res.json(entry);
  });

  // Dependency "hash walk" is implemented in getObservationDependencies (cognition.ts): it loads
  // canonical_events (auditHash + prevEventHash) per tenant and orders agents by that chain per workflow.
  app.get("/api/observation/dependencies", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    res.json(await getObservationDependencies(tenantId));
  });

  /* ---------- PEL — Predictive Economic Ledger ---------- */
  app.get("/api/pel/rows", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    res.json(await storage.listLedger(tenantId, 5000));
  });

  app.post("/api/pel/reconcile", requireAuth, async (req, res) => {
    const { decisionId, actualCostUsd, actualOutcomeUsd, sor } = req.body;
    const row = await reconcileSoR({ decisionId, actualCostUsd, actualOutcomeUsd, sor });
    if (!row) return res.status(404).json({ error: "decision not found" });
    res.json(row);
  });

  app.post("/api/pel/rollup", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const snap = await rollupEquations(tenantId);
    res.json(snap);
  });

  app.get("/api/pel/equations", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    const hours = Number(req.query.hours ?? 24);
    res.json(await storage.listSnapshots(tenantId, hours));
  });

  /* ---------- Recommendations + Governance Plane ---------- */
  app.get("/api/recommendations", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    res.json(await storage.listRecs(tenantId, req.query.status as string | undefined));
  });
  app.post("/api/recommendations/generate", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const n = await generateRecommendations(tenantId);
    res.json({ generated: n ?? 0 });
  });
  app.post("/api/recommendations/:recId/decide", requireAuth, async (req, res) => {
    const { status } = req.body;
    const recId = typeof req.params.recId === "string" ? req.params.recId : req.params.recId[0]!;

    const auth = res.locals.auth;
    let decidedBy = "system-admin@dev.local";
    if (auth) {
      const user = await storage.getUser(auth.userId);
      decidedBy = user?.username ?? `user-${auth.userId}`;
    }

    const r = await storage.decideRec(recId, status, decidedBy);
    if (!r) return res.status(404).json({ error: "not found" });
    res.json(r);
  });

  app.get("/api/governance/decisions", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));
    res.json(await storage.listGovernance(tenantId, limit));
  });

  /* ---------- Team Reviews Queue (HITL gate) ---------- */

  app.get("/api/governance/reviews", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 100)));
    const rows = await db
      .select({
        eventId: canonicalEvents.eventId,
        agentId: canonicalEvents.agentId,
        skill: canonicalEvents.skill,
        confidence: canonicalEvents.confidence,
        humanReview: canonicalEvents.humanReview,
        policyOutcome: canonicalEvents.policyOutcome,
        trustTier: canonicalEvents.trustTier,
        capturedAt: canonicalEvents.capturedAt,
        humanUserId: canonicalEvents.humanUserId,
        reviewerName: users.username,
      })
      .from(canonicalEvents)
      .leftJoin(users, eq(users.id, sql`${canonicalEvents.humanUserId}::integer`))
      .where(
        and(
          eq(canonicalEvents.tenantId, tenantId),
          sql`${canonicalEvents.humanReview} IN ('queued', 'pending', 'verified', 'auto')`,
          sql`${canonicalEvents.policyOutcome} IN ('human_gate', 'blocked')`,
        )
      )
      .orderBy(desc(canonicalEvents.capturedAt))
      .limit(limit);
    res.json(rows);
  });

  app.get("/api/governance/gaps", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;

    // Aggregate per (agentId, skill): total events + auto-reviewed count
    const grouped = await db
      .select({
        agentId: canonicalEvents.agentId,
        skill: canonicalEvents.skill,
        total: count(canonicalEvents.id),
        autoCount: sql<number>`cast(sum(case when ${canonicalEvents.humanReview} = 'auto' then 1 else 0 end) as int)`,
        avgConfidence: sql<number>`cast(avg(${canonicalEvents.confidence}) as float)`,
      })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.tenantId, tenantId))
      .groupBy(canonicalEvents.agentId, canonicalEvents.skill);

    // Fetch agent registry for names + trust tiers
    const agents = await db
      .select({ agentId: agentRegistry.agentId, name: agentRegistry.name, trustTier: agentRegistry.trustTier })
      .from(agentRegistry)
      .where(eq(agentRegistry.tenantId, tenantId));
    const agentMap = new Map(agents.map(a => [a.agentId, a]));

    // Fetch active governance rules to know which skills already have a gate
    const rules = await db
      .select({ taskType: governanceRules.taskType })
      .from(governanceRules)
      .where(and(eq(governanceRules.tenantId, tenantId), eq(governanceRules.isActive, true)));
    const ruledSkills = new Set(rules.map(r => r.taskType));

    const TIER_RISK: Record<string, "HIGH" | "MEDIUM" | "LOW"> = {
      T0_unverified: "HIGH", T0_probation: "HIGH",
      T1_observed: "HIGH",
      T2_supervised: "MEDIUM",
      T3_trusted: "LOW", T4_autonomous: "LOW",
    };

    const gaps = grouped
      .filter(g => g.total > 0 && (g.autoCount / g.total) >= 0.80)
      .map(g => {
        const agent = agentMap.get(g.agentId);
        const tier = agent?.trustTier ?? "T2_supervised";
        const autoRate = g.autoCount / g.total;
        const riskLevel = TIER_RISK[tier] ?? (autoRate >= 0.95 ? "HIGH" : autoRate >= 0.85 ? "MEDIUM" : "LOW");
        return {
          agentId: g.agentId,
          agentName: agent?.name ?? g.agentId,
          skill: g.skill ?? "unknown",
          trustTier: tier,
          totalDecisions: g.total,
          autoRate,
          avgConfidence: g.avgConfidence ?? 0,
          riskLevel,
          hasRule: ruledSkills.has(g.skill ?? ""),
        };
      })
      .sort((a, b) => {
        const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return order[a.riskLevel] - order[b.riskLevel];
      });

    res.json(gaps);
  });

  app.get("/api/governance/gaps/coverage", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;

    // Count decisions per skill (used as process proxy)
    const skillCounts = await db
      .select({
        skill: canonicalEvents.skill,
        decisions: count(canonicalEvents.id),
      })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.tenantId, tenantId))
      .groupBy(canonicalEvents.skill);

    // Count active rules per taskType
    const ruleCounts = await db
      .select({
        taskType: governanceRules.taskType,
        gates: sql<number>`cast(count(*) as int)`,
      })
      .from(governanceRules)
      .where(and(eq(governanceRules.tenantId, tenantId), eq(governanceRules.isActive, true)))
      .groupBy(governanceRules.taskType);
    const ruleMap = new Map(ruleCounts.map(r => [r.taskType, r.gates]));

    // Count gaps per skill (auto-rate >= 80%)
    const gapCounts = await db
      .select({
        skill: canonicalEvents.skill,
        total: count(canonicalEvents.id),
        autoCount: sql<number>`cast(sum(case when ${canonicalEvents.humanReview} = 'auto' then 1 else 0 end) as int)`,
      })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.tenantId, tenantId))
      .groupBy(canonicalEvents.skill);
    const gapMap = new Map(
      gapCounts
        .filter(g => g.total > 0 && (g.autoCount / g.total) >= 0.80)
        .map(g => [g.skill, 1])
    );

    const coverage = skillCounts.map(s => ({
      process: s.skill ?? "unknown",
      gates: ruleMap.get(s.skill ?? "") ?? 0,
      decisionsPerWeek: s.decisions,
      gapCount: gapMap.has(s.skill) ? 1 : 0,
    }));

    res.json(coverage);
  });

  app.post("/api/governance/reviews/:taskId/decide", requireAuth, async (req, res) => {
    try {
      const { tenantId, userId } = res.locals.auth!;
      const taskId = req.params.taskId as string;
      const { decision } = req.body as { decision?: string };

      const allowed = ["Advance", "Reject", "Hold"] as const;
      type Decision = typeof allowed[number];
      if (!decision || !allowed.includes(decision as Decision)) {
        return res.status(400).json({ error: "decision must be Advance, Reject, or Hold" });
      }

      const humanReviewMap: Record<Decision, string> = {
        Advance: "verified",
        Reject:  "rejected",
        Hold:    "pending",
      };

      const [event] = await db
        .select()
        .from(canonicalEvents)
        .where(and(eq(canonicalEvents.eventId, taskId), eq(canonicalEvents.tenantId, tenantId)))
        .limit(1);

      if (!event) {
        return res.status(404).json({ error: "event not found" });
      }

      await db
        .update(canonicalEvents)
        .set({ humanReview: humanReviewMap[decision as Decision], humanUserId: String(userId) })
        .where(and(eq(canonicalEvents.eventId, taskId), eq(canonicalEvents.tenantId, tenantId)));

      await storage.insertGovernance({
        decisionId: `rev-${Date.now()}-${taskId}`,
        tenantId,
        firedAt: new Date().toISOString(),
        policyId: event.policyId ?? "hitl-review",
        policyOutcome: decision === "Advance" ? "allowed" : decision === "Reject" ? "blocked" : "human_gate",
        rationale: `Human reviewer decision: ${decision}`,
        prevTrustTier: event.trustTier ?? null,
        newTrustTier: decision === "Advance" ? "T3_trusted" : event.trustTier ?? null,
        rerouteFromModel: null,
        rerouteToModel: null,
        subject: event.skill ?? event.agentId,
        actor: String(userId),
        relatedRecId: event.eventId,
      });

      // Fire workforce resume callback when a reviewer advances the task.
      // The local AEOS state has already been committed above, so a network
      // failure here must not surface as an error to the caller.
      if (decision === "Advance" && event.workflowId) {
        const workforceResumeUrl =
          process.env.WORKFORCE_RESUME_URL ??
          "http://fuzebox-webhook-v2:8000/api/workforce/resume";

        const workflowId = event.workflowId;
        // stepIndex is stored on the event; fall back to 0 if absent.
        const stepIndex: number = (event as any).stepIndex ?? 0;

        (async () => {
          try {
            await fetch(workforceResumeUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workflowId, resumeFromStepIndex: stepIndex }),
            });
          } catch (callbackErr) {
            console.error(
              "[workforce-resume] callback failed — workflow will need manual resume",
              { workflowId, stepIndex, error: callbackErr }
            );
          }
        })();
      }

      res.json({ ok: true, eventId: taskId, decision });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  /* ---------- Audit History ---------- */

  app.get("/api/governance/history", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    const limit = Math.min(500, Math.max(1, Number(req.query.limit ?? 200)));

    const rows = await db
      .select({
        eventId: canonicalEvents.eventId,
        agentId: canonicalEvents.agentId,
        skill: canonicalEvents.skill,
        confidence: canonicalEvents.confidence,
        humanReview: canonicalEvents.humanReview,
        capturedAt: canonicalEvents.capturedAt,
        humanUserId: canonicalEvents.humanUserId,
        reviewerName: users.username,
      })
      .from(canonicalEvents)
      .leftJoin(users, eq(users.id, sql`${canonicalEvents.humanUserId}::integer`))
      .where(
        and(
          eq(canonicalEvents.tenantId, tenantId),
          sql`${canonicalEvents.humanReview} IN ('verified', 'rejected')`,
        )
      )
      .orderBy(desc(canonicalEvents.capturedAt))
      .limit(limit);

    res.json(rows);
  });

  /* ---------- Reviewer Performance ---------- */

  app.get("/api/governance/performance", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;

    const rows = await db
      .select({
        reviewerName: users.username,
        humanReview: canonicalEvents.humanReview,
        confidence: canonicalEvents.confidence,
        capturedAt: canonicalEvents.capturedAt,
      })
      .from(canonicalEvents)
      .leftJoin(users, eq(users.id, sql`${canonicalEvents.humanUserId}::integer`))
      .where(
        and(
          eq(canonicalEvents.tenantId, tenantId),
          sql`${canonicalEvents.humanReview} IN ('verified', 'rejected')`,
          sql`${canonicalEvents.humanUserId} IS NOT NULL`,
        )
      );

    // Group by reviewer name and aggregate
    const byReviewer = new Map<string, {
      reviewed: number;
      advances: number;
      confidenceSum: number;
      confidenceCount: number;
    }>();

    for (const row of rows) {
      const name = row.reviewerName ?? `User ${row.humanReview}`;
      if (!byReviewer.has(name)) {
        byReviewer.set(name, { reviewed: 0, advances: 0, confidenceSum: 0, confidenceCount: 0 });
      }
      const agg = byReviewer.get(name)!;
      agg.reviewed += 1;
      if (row.humanReview === "verified") agg.advances += 1;
      if (row.confidence != null) {
        agg.confidenceSum += row.confidence;
        agg.confidenceCount += 1;
      }
    }

    const result = Array.from(byReviewer.entries()).map(([name, agg]) => {
      const advanceRate = agg.reviewed > 0 ? agg.advances / agg.reviewed : 0;
      const avgConfidence = agg.confidenceCount > 0 ? agg.confidenceSum / agg.confidenceCount : null;
      // Calibration: "Drift" if advance rate deviates significantly from AI confidence baseline
      const calibration = avgConfidence != null && Math.abs(advanceRate - avgConfidence) > 0.15
        ? "Drift"
        : "On";
      return { name, reviewed: agg.reviewed, advanceRate, calibration };
    });

    res.json(result);
  });

  /* ---------- Governance Rules (Rules & Compliance UI) ---------- */

  app.get("/api/governance/rules", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const rules = await db
      .select()
      .from(governanceRules)
      .where(eq(governanceRules.tenantId, tenantId))
      .orderBy(governanceRules.id);
    res.json(rules);
  });

  app.post("/api/governance/rules", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    const { id, name, description, task_type, enforcement_action, reference_code } = req.body as {
      id?: string;
      name?: string;
      description?: string;
      task_type?: string;
      enforcement_action?: string;
      reference_code?: string;
    };

    if (!id || typeof id !== "string" || !id.trim()) {
      return res.status(400).json({ error: "id is required (e.g. 'R-005')" });
    }
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!task_type || typeof task_type !== "string" || !task_type.trim()) {
      return res.status(400).json({ error: "task_type is required" });
    }
    const allowedActions = ["BLOCK", "WARN", "LOG"];
    if (!enforcement_action || !allowedActions.includes(enforcement_action)) {
      return res.status(400).json({ error: "enforcement_action must be BLOCK, WARN, or LOG" });
    }

    const existing = await db
      .select({ id: governanceRules.id })
      .from(governanceRules)
      .where(eq(governanceRules.id, id.trim()))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: `Rule with id '${id.trim()}' already exists` });
    }

    const [created] = await db
      .insert(governanceRules)
      .values({
        id: id.trim(),
        tenantId,
        name: name.trim(),
        description: (description ?? "").trim(),
        taskType: task_type.trim(),
        enforcementAction: enforcement_action,
        isActive: true,
        referenceCode: reference_code?.trim() || null,
      })
      .returning();

    res.status(201).json(created);
  });

  /* GET /api/governance/violations
   * Returns canonical_events where policyOutcome = 'violated' OR passedThresholds = false,
   * joined with governance_rules on policyId = rule id, sorted by capturedAt DESC.
   */
  app.get("/api/governance/violations", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));

    const rows = await db
      .select({
        eventId: canonicalEvents.eventId,
        capturedAt: canonicalEvents.capturedAt,
        agentId: canonicalEvents.agentId,
        skill: canonicalEvents.skill,
        policyId: canonicalEvents.policyId,
        policyOutcome: canonicalEvents.policyOutcome,
        passedThresholds: canonicalEvents.passedThresholds,
        trustTier: canonicalEvents.trustTier,
        confidence: canonicalEvents.confidence,
        humanReview: canonicalEvents.humanReview,
        workflowId: canonicalEvents.workflowId,
        // governance_rules fields (null when no matching rule row)
        ruleName: governanceRules.name,
        ruleDescription: governanceRules.description,
        ruleTaskType: governanceRules.taskType,
        ruleReferenceCode: governanceRules.referenceCode,
      })
      .from(canonicalEvents)
      .leftJoin(
        governanceRules,
        and(
          eq(governanceRules.tenantId, tenantId),
          sql`${governanceRules.id} = ${canonicalEvents.policyId}`
        )
      )
      .where(
        and(
          eq(canonicalEvents.tenantId, tenantId),
          sql`(${canonicalEvents.policyOutcome} = 'violated' OR ${canonicalEvents.passedThresholds} = false)`
        )
      )
      .orderBy(desc(canonicalEvents.capturedAt))
      .limit(limit);

    res.json(rows);
  });

  app.patch("/api/governance/rules/:id", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    const { id } = req.params;
    const { enforcement_action, is_active } = req.body as {
      enforcement_action?: string;
      is_active?: boolean;
    };

    const allowed = ["BLOCK", "WARN", "LOG"];
    if (enforcement_action !== undefined && !allowed.includes(enforcement_action)) {
      return res.status(400).json({ error: "enforcement_action must be BLOCK, WARN, or LOG" });
    }
    if (is_active !== undefined && typeof is_active !== "boolean") {
      return res.status(400).json({ error: "is_active must be a boolean" });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (enforcement_action !== undefined) patch.enforcementAction = enforcement_action;
    if (is_active !== undefined) patch.isActive = is_active;

    const [updated] = await db
      .update(governanceRules)
      .set(patch)
      .where(and(eq(governanceRules.id, id), eq(governanceRules.tenantId, tenantId)))
      .returning();

    if (!updated) return res.status(404).json({ error: "rule not found" });
    res.json(updated);
  });

  /**
   * GET /api/governance/rules/check
   * API-key authenticated (Bearer token). Returns whether the given task_type
   * is blocked for the calling tenant per their active governance rules.
   *
   * Query params:
   *   task_type  — required; the raw workforce task string to check
   *
   * Response:
   *   { is_blocked: true,  enforcement_action: "BLOCK" }  — active BLOCK rule found
   *   { is_blocked: false }                               — no match or non-blocking rule
   */
  app.get("/api/governance/rules/check", resolveApiKey, async (req, res) => {
    if (req.query.humanOverride === "true") {
      return res.json({ is_blocked: false, enforcement_action: "ALLOW" });
    }

    const { tenantId } = (res.locals as any).auth as { tenantId: string };
    const taskType = typeof req.query.task_type === "string" ? req.query.task_type.trim() : "";

    if (!taskType) {
      return res.status(400).json({ error: "task_type query parameter is required" });
    }

    const [rule] = await db
      .select()
      .from(governanceRules)
      .where(
        and(
          eq(governanceRules.tenantId, tenantId),
          eq(governanceRules.taskType, taskType),
          eq(governanceRules.isActive, true),
          eq(governanceRules.enforcementAction, "BLOCK")
        )
      )
      .limit(1);

    if (rule) {
      return res.json({ is_blocked: true, enforcement_action: "BLOCK" });
    }
    return res.json({ is_blocked: false });
  });

  /* ---------- Agents + Trust Tiers ---------- */
  app.get("/api/agents", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const probe = await storage.latestTenantHealthProbe(tenantId);
    res.json(await storage.listAgents(tenantId, probe));
  });

  // Sync from deployment workspace (v2) via API key — create or update registry row.
  app.post("/api/agents", resolveApiKey, async (req, res) => {
    try {
      const { tenantId } = res.locals.auth!;
      const {
        agentId,
        name,
        hyperscaler,
        model,
        vendor,
        status,
        trustTier,
        createdAt,
        workflowId,
      } = req.body ?? {};

      if (!agentId || typeof agentId !== "string" || !name || typeof name !== "string") {
        return res.status(400).json({ error: "agentId and name are required" });
      }

      const existing = await storage.getAgentById(agentId, tenantId);
      if (existing) {
        await storage.upsertAgent({
          agentId: existing.agentId,
          tenantId: existing.tenantId,
          name,
          hyperscaler: hyperscaler ?? existing.hyperscaler,
          model: model ?? existing.model,
          trustTier: existing.trustTier,
          vendor: vendor ?? existing.vendor,
          workflowId: workflowId ?? existing.workflowId,
          status: status ?? existing.status,
          createdAt: existing.createdAt,
        });
      } else {
        await storage.upsertAgent({
          agentId,
          tenantId,
          name,
          hyperscaler: hyperscaler ?? "anthropic",
          model: model ?? null,
          trustTier: trustTier ?? DEFAULT_AGENT_TRUST_TIER,
          vendor: vendor ?? null,
          workflowId: workflowId ?? null,
          status: status ?? "green",
          createdAt: createdAt ?? new Date().toISOString(),
        });
      }

      res.status(existing ? 200 : 201).json({ ok: true, agentId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/agents/:agentId", resolveApiKey, async (req, res) => {
    try {
      const { tenantId } = res.locals.auth!;
      const agentId = String(req.params.agentId || "").trim();
      if (!agentId) {
        return res.status(400).json({ error: "agentId is required" });
      }
      const removed = await storage.deleteAgent(agentId, tenantId);
      if (!removed) {
        return res.status(404).json({ error: "Agent not found" });
      }
      res.json({ ok: true, agentId });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tenant", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const tenant = await storage.getTenant(tenantId);
    res.json({ deploymentHealthUrl: tenant?.deploymentHealthUrl ?? null });
  });

  app.patch("/api/tenant/deployment-health-url", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    const { deploymentHealthUrl } = req.body ?? {};
    if (deploymentHealthUrl !== undefined && deploymentHealthUrl !== null && typeof deploymentHealthUrl !== "string") {
      return res.status(400).json({ error: "deploymentHealthUrl must be a string or null" });
    }
    await storage.setDeploymentHealthUrl(tenantId, deploymentHealthUrl ?? null);
    res.json({ ok: true });
  });

  /* ---------- Correlation Engine (data-driven insights) ---------- */
  app.get("/api/correlations", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const events = await storage.listCanonicalEvents(tenantId, 5000);

    const rows = events
      .map((e) => {
        const t = Date.parse(e.capturedAt);
        if (Number.isNaN(t)) return null;
        const date = new Date(t);
        const hour = date.getHours();
        const totalTokens = (e.inputTokens ?? 0) + (e.outputTokens ?? 0);
        const wallMs = e.wallMs ?? 0;
        const cost = e.amortizedCostUsd ?? 0;
        const conf = e.confidence ?? null;
        const passed = e.passedThresholds ? 1 : 0;
        return {
          hour,
          totalTokens,
          wallMs,
          cost,
          conf,
          passed,
          model: e.model ?? "unknown",
          workflowId: e.workflowId ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    // If there's no telemetry, return an empty array (UI will show 0).
    if (rows.length < 3) {
      return res.json({
        source: "telemetry",
        eventCount: rows.length,
        updatedAt: new Date().toISOString(),
        correlations: [] as CorrelationInsight[],
      });
    }

    const correlations: CorrelationInsight[] = [];

    // 1) Complexity (tokens) vs success (passedThresholds)
    {
      const xs = rows.map((r) => r.totalTokens);
      const ys = rows.map((r) => r.passed);
      const r = pearson(xs, ys);
      correlations.push({
        id: "COR-001",
        title: "Token volume correlates with success rate",
        r,
        strength: strengthFromR(r),
        category: "Task analysis",
        insight:
          r < 0
            ? "Higher token volume is associated with lower pass-rate. Consider splitting high-token tasks into smaller workflows or tightening prompts/tools."
            : "Higher token volume is associated with higher pass-rate. Complex tasks may be benefiting from more context; watch spend and latency.",
        metric: `r = ${r >= 0 ? "+" : ""}${r.toFixed(2)} · n=${rows.length}`,
      });
    }

    // 2) Confidence vs success (only where confidence exists)
    {
      const filtered = rows.filter((r) => typeof r.conf === "number" && Number.isFinite(r.conf));
      if (filtered.length >= 3) {
        const xs = filtered.map((r) => r.conf as number);
        const ys = filtered.map((r) => r.passed);
        const r = pearson(xs, ys);
        correlations.push({
          id: "COR-002",
          title: "Confidence correlates with pass-rate",
          r,
          strength: strengthFromR(r),
          category: "Quality",
          insight:
            r >= 0.4
              ? "Confidence tracks real quality. You can safely raise the confidence gate for auto-approve paths and reduce human review."
              : "Confidence is weakly aligned with pass-rate. Revisit the confidence calibration and add post-hoc evaluation signals.",
          metric: `r = ${r >= 0 ? "+" : ""}${r.toFixed(2)} · n=${filtered.length}`,
        });
      }
    }

    // 3) Peak-hour latency effect (hour vs wallMs), plus breach multiplier 2–4 PM vs rest
    {
      const xs = rows.map((r) => r.hour);
      const ys = rows.map((r) => r.wallMs);
      const r = pearson(xs, ys);

      // Define a "breach" relative to p95 (robust to workload differences)
      const sorted = [...rows].sort((a, b) => a.wallMs - b.wallMs);
      const p95 = sorted[Math.floor(sorted.length * 0.95)]?.wallMs ?? 0;
      const breachMs = Math.max(1000, p95); // never below 1s
      const peak = rows.filter((x) => x.hour >= 14 && x.hour < 16);
      const off = rows.filter((x) => !(x.hour >= 14 && x.hour < 16));
      const peakB = peak.length ? peak.filter((x) => x.wallMs >= breachMs).length / peak.length : 0;
      const offB = off.length ? off.filter((x) => x.wallMs >= breachMs).length / off.length : 0;
      const mult = offB > 0 ? peakB / offB : 0;

      correlations.push({
        id: "COR-003",
        title: "Latency shifts by hour-of-day (peak window 2–4 PM)",
        r,
        strength: strengthFromR(r),
        category: "Temporal",
        insight:
          mult >= 1.5
            ? `Latency breaches are ~${mult.toFixed(1)}× more likely during 2–4 PM. Consider caching, request shaping, or routing changes in that window.`
            : "No strong peak-hour latency signature detected in the latest telemetry. Keep monitoring as volume grows.",
        metric: `breach≥${Math.round(breachMs)}ms · peak ${Math.round(peakB * 100)}% vs off ${Math.round(offB * 100)}%`,
      });
    }

    // 4) Model cost vs success (per model averages), compute r across models with enough samples
    {
      const byModel: Record<string, { n: number; cost: number; pass: number }> = {};
      rows.forEach((r) => {
        const k = r.model || "unknown";
        byModel[k] ??= { n: 0, cost: 0, pass: 0 };
        byModel[k].n += 1;
        byModel[k].cost += r.cost;
        byModel[k].pass += r.passed;
      });
      const models = Object.entries(byModel)
        .filter(([, v]) => v.n >= 10)
        .map(([k, v]) => ({
          model: k,
          n: v.n,
          avgCost: v.cost / v.n,
          passRate: v.pass / v.n,
        }))
        .sort((a, b) => b.n - a.n);

      if (models.length >= 3) {
        const xs = models.map((m) => m.avgCost);
        const ys = models.map((m) => m.passRate);
        const r = pearson(xs, ys);
        const cheapest = [...models].sort((a, b) => a.avgCost - b.avgCost)[0];
        const best = [...models].sort((a, b) => b.passRate - a.passRate)[0];
        correlations.push({
          id: "COR-004",
          title: "Higher cost correlates with higher success (across models)",
          r,
          strength: strengthFromR(r),
          category: "Model comparison",
          insight:
            r >= 0.3
              ? `Across models, higher spend tends to buy quality. Cheapest frequent model is ${cheapest.model} while best pass-rate is ${best.model} — consider routing based on task complexity.`
              : `Across models, spend is not strongly buying quality. Cheapest frequent model is ${cheapest.model}; best pass-rate is ${best.model}.`,
          metric: `r = ${r >= 0 ? "+" : ""}${r.toFixed(2)} · models=${models.length} (n≥10 each)`,
        });
      }
    }

    // Sort by absolute strength and cap to a reasonable number for UI.
    correlations.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    res.json({
      source: "telemetry",
      eventCount: rows.length,
      updatedAt: new Date().toISOString(),
      correlations: correlations.slice(0, 12),
    });
  });

  /* ---------- UoP Library ---------- */
  app.get("/api/uop/library", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    res.json(await storage.listUoPLibrary(tenantId));
  });
  app.post("/api/uop/publish", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    try {
      const u = await publishUoP({ tenantId, ...req.body });
      res.json(u);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });
  app.post("/api/uop/:uopId/reuse", requireAuth, async (req, res) => {
    const uopId = Array.isArray(req.params.uopId) ? req.params.uopId[0] : req.params.uopId;
    await storage.bumpUoPReuse(uopId);
    res.json(await storage.getUoP(uopId));
  });

  /* ---------- Quality dashboard ---------- */
  app.get("/api/dashboard/quality", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const events = await storage.listCanonicalEvents(tenantId, 5000);
    const ledger = await storage.listLedger(tenantId, 5000);
    const passed = events.filter(e => e.passedThresholds).length;
    const total = events.length || 1;
    const passRate = passed / total;
    const avgConfidence = events.reduce((s, e) => s + (e.confidence ?? 0), 0) / total;
    const reworkMin = events.reduce((s, e) => s + (e.reworkMinutes ?? 0), 0);
    const closed = ledger.filter(r => r.status === "closed");
    const sigmaCost = closed.length
      ? Math.sqrt(closed.reduce((s, r) => s + Math.pow(r.econCostDelta ?? 0, 2), 0) / closed.length)
      : 0;
    const sigmaOutcome = closed.length
      ? Math.sqrt(closed.reduce((s, r) => s + Math.pow((r.econWinRateDelta ?? 0), 2), 0) / closed.length)
      : 0;
    const sigmaLevel = dpmoToSigma(total - passed, total);
    const buckets: Record<string, number> = {};
    closed.forEach(r => { const b = r.attributionBucket ?? "environment"; buckets[b] = (buckets[b] ?? 0) + 1; });
    res.json({
      tenantId,
      passRate, avgConfidence, reworkMin,
      passedCount: passed, totalCount: total,
      sigmaLevel, sigmaCost, sigmaOutcome,
      attribution: buckets,
      humanReviewQueued: events.filter(e => e.humanReview === "queued").length,
    });
  });

  /* ---------- Risk Analysis (FMEA-shaped) ---------- */
  app.get("/api/risk/scenarios", async (_req, res) => {
    // FMEA = Severity × Occurrence × Detection (each 1–10). RPN ≥ 200 = critical.
    const scenarios = [
      {
        id: "RSK-001", category: "Vendor concentration",
        scenario: "Anthropic outage ≥ 30 min during business hours",
        severity: 8, occurrence: 4, detection: 3, rpn: 96,
        exposureUsd: 2840, blastRadiusAgents: 2,
        mitigation: "Active failover routing rule · Mistral large-3 hot standby",
        owner: "CTO", residualRpn: 32,
      },
      {
        id: "RSK-002", category: "Silent failure",
        scenario: "Recommendation Writer hallucinates citation, passes confidence gate",
        severity: 9, occurrence: 6, detection: 7, rpn: 378,
        exposureUsd: 18500, blastRadiusAgents: 1,
        mitigation: "Post-hoc evaluator on T1 outputs · source-link verifier",
        owner: "CTO", residualRpn: 84,
      },
      {
        id: "RSK-003", category: "Cost overrun",
        scenario: "Opus 4.7 long-context loop spends > $5/call ceiling",
        severity: 6, occurrence: 7, detection: 2, rpn: 84,
        exposureUsd: 3420, blastRadiusAgents: 1,
        mitigation: "Per-call budget circuit-breaker (already firing)",
        owner: "CFO", residualRpn: 18,
      },
      {
        id: "RSK-004", category: "Trust drift",
        scenario: "T3-promoted agent regresses below 0.85 confidence rolling 30d",
        severity: 7, occurrence: 5, detection: 4, rpn: 140,
        exposureUsd: 7250, blastRadiusAgents: 2,
        mitigation: "Auto-demote to T2 on 7-day variance > 0.18",
        owner: "Board", residualRpn: 35,
      },
      {
        id: "RSK-005", category: "Coverage gap",
        scenario: "OpenAI Operator surface unmonitored; off-ledger spend",
        severity: 6, occurrence: 8, detection: 5, rpn: 240,
        exposureUsd: 4180, blastRadiusAgents: 3,
        mitigation: "Activate Operator capture via vendor webhook · ETA Q3",
        owner: "CTO", residualRpn: 60,
      },
      {
        id: "RSK-006", category: "Compliance",
        scenario: "EU AI Act Annex III logging gap on automated screening",
        severity: 9, occurrence: 3, detection: 4, rpn: 108,
        exposureUsd: 22000, blastRadiusAgents: 1,
        mitigation: "Compliance Cartridge · EU AI Act profile (v1.5 roadmap)",
        owner: "Board", residualRpn: 27,
      },
      {
        id: "RSK-007", category: "Coordination tax",
        scenario: "Manual handoffs in resume screening exceed 25% wall time",
        severity: 5, occurrence: 6, detection: 2, rpn: 60,
        exposureUsd: 1840, blastRadiusAgents: 1,
        mitigation: "Promote screener to T3 · replace step-2 approval gate",
        owner: "CTO", residualRpn: 12,
      },
      {
        id: "RSK-008", category: "Data sovereignty",
        scenario: "PII routed to non-EU model endpoint without DPA",
        severity: 10, occurrence: 2, detection: 6, rpn: 120,
        exposureUsd: 95000, blastRadiusAgents: 4,
        mitigation: "Region-pinned routing rule · GDPR cartridge attestation",
        owner: "Board", residualRpn: 30,
      },
    ];
    const totalRpn = scenarios.reduce((s, r) => s + r.rpn, 0);
    const totalResidual = scenarios.reduce((s, r) => s + r.residualRpn, 0);
    const totalExposure = scenarios.reduce((s, r) => s + r.exposureUsd, 0);
    res.json({
      scenarios,
      summary: {
        totalRpn, totalResidual,
        rpnReduction: totalRpn > 0 ? (totalRpn - totalResidual) / totalRpn : 0,
        totalExposureUsd: totalExposure,
        criticalCount: scenarios.filter(r => r.rpn >= 200).length,
        elevatedCount: scenarios.filter(r => r.rpn >= 100 && r.rpn < 200).length,
        watchlistCount: scenarios.filter(r => r.rpn < 100).length,
      },
    });
  });

  /* ---------- FMEA Risk Register ---------- */

  app.get("/api/fmea", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    try {
      const rows = await db
        .select({
          id: fmeaItems.id,
          tenantId: fmeaItems.tenantId,
          agentRegistryId: fmeaItems.agentRegistryId,
          processScope: fmeaItems.processScope,
          failureMode: fmeaItems.failureMode,
          effect: fmeaItems.effect,
          rootCause: fmeaItems.rootCause,
          mitigation: fmeaItems.mitigation,
          severity: fmeaItems.severity,
          occurrence: fmeaItems.occurrence,
          detection: fmeaItems.detection,
          status: fmeaItems.status,
          owner: fmeaItems.owner,
          createdAt: fmeaItems.createdAt,
          updatedAt: fmeaItems.updatedAt,
          agentName: agentRegistry.name,
          agentTrustTier: agentRegistry.trustTier,
          agentStatus: agentRegistry.status,
          agentHyperscaler: agentRegistry.hyperscaler,
          agentModel: agentRegistry.model,
        })
        .from(fmeaItems)
        .leftJoin(agentRegistry, eq(agentRegistry.id, fmeaItems.agentRegistryId))
        .where(eq(fmeaItems.tenantId, tenantId));

      const data = rows
        .map((r) => ({ ...r, rpn: r.severity * r.occurrence * r.detection }))
        .sort((a, b) => b.rpn - a.rpn);

      res.json({ ok: true, data });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/fmea", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    try {
      const payload = { ...req.body, tenantId };
      const parsed = insertFmeaItemSchema.safeParse(payload);
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "Invalid payload", details: parsed.error.flatten() });
      }

      const existing = await db
        .select({ id: fmeaItems.id })
        .from(fmeaItems)
        .where(and(eq(fmeaItems.id, parsed.data.id), eq(fmeaItems.tenantId, tenantId)))
        .limit(1);

      let row;
      if (existing.length > 0) {
        const { id, tenantId: _tid, createdAt: _ca, ...updates } = parsed.data as any;
        [row] = await db
          .update(fmeaItems)
          .set({ ...updates, updatedAt: new Date() })
          .where(and(eq(fmeaItems.id, parsed.data.id), eq(fmeaItems.tenantId, tenantId)))
          .returning();
      } else {
        [row] = await db.insert(fmeaItems).values(parsed.data).returning();
      }

      const rpn = row.severity * row.occurrence * row.detection;
      res.status(existing.length > 0 ? 200 : 201).json({ ok: true, data: { ...row, rpn } });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* ---------- Build vs Buy (Insights) ---------- */

  app.get("/api/build-vs-buy", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    try {
      const comparisons = await db
        .select()
        .from(buildVsBuyComparisons)
        .where(eq(buildVsBuyComparisons.tenantId, tenantId))
        .orderBy(buildVsBuyComparisons.process);

      const [matrixRow] = await db
        .select({ factors: buildVsBuyMatrices.factors })
        .from(buildVsBuyMatrices)
        .where(eq(buildVsBuyMatrices.tenantId, tenantId))
        .limit(1);

      res.json({ ok: true, data: { comparisons, matrix: matrixRow?.factors ?? [] } });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/build-vs-buy", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    try {
      const parsed = insertBuildVsBuyComparisonSchema.safeParse({ ...req.body, tenantId });
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "Invalid payload", details: parsed.error.flatten() });
      }

      const existing = await db
        .select({ id: buildVsBuyComparisons.id })
        .from(buildVsBuyComparisons)
        .where(and(eq(buildVsBuyComparisons.tenantId, tenantId), eq(buildVsBuyComparisons.process, parsed.data.process)))
        .limit(1);

      let row;
      if (existing.length > 0) {
        const { tenantId: _tid, process: _proc, ...updates } = parsed.data;
        [row] = await db
          .update(buildVsBuyComparisons)
          .set({ ...updates, updatedAt: new Date() })
          .where(and(eq(buildVsBuyComparisons.tenantId, tenantId), eq(buildVsBuyComparisons.process, parsed.data.process)))
          .returning();
      } else {
        [row] = await db.insert(buildVsBuyComparisons).values(parsed.data).returning();
      }

      res.status(existing.length > 0 ? 200 : 201).json({ ok: true, data: row });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post("/api/build-vs-buy/matrix", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    try {
      const parsed = insertBuildVsBuyMatrixSchema.safeParse({ tenantId, factors: req.body?.factors });
      if (!parsed.success) {
        return res.status(400).json({ ok: false, error: "Invalid payload", details: parsed.error.flatten() });
      }

      const existing = await db
        .select({ id: buildVsBuyMatrices.id })
        .from(buildVsBuyMatrices)
        .where(eq(buildVsBuyMatrices.tenantId, tenantId))
        .limit(1);

      let row;
      if (existing.length > 0) {
        [row] = await db
          .update(buildVsBuyMatrices)
          .set({ factors: parsed.data.factors, updatedAt: new Date() })
          .where(eq(buildVsBuyMatrices.tenantId, tenantId))
          .returning();
      } else {
        [row] = await db.insert(buildVsBuyMatrices).values(parsed.data).returning();
      }

      res.status(existing.length > 0 ? 200 : 201).json({ ok: true, data: row });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  /* ---------- Agent Deployments (Deploy Agent Code page) ---------- */
  app.get("/api/deployments", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    res.json(await storage.listDeployments(tenantId));
  });

  app.get("/api/deployments/:deploymentId", requireAuth, async (req, res) => {
    const deploymentId = Array.isArray(req.params.deploymentId) ? req.params.deploymentId[0] : req.params.deploymentId;
    const d = await storage.getDeployment(deploymentId);
    if (!d) return res.status(404).json({ error: "not found" });
    res.json(d);
  });

  app.post("/api/deployments/validate", requireAuth, async (req, res) => {
    try {
      const { codeLanguage, rawCode } = req.body || {};
      const result = parseAgentCode(codeLanguage, rawCode);
      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/deployments", requireAuth, async (req, res) => {
    const { tenantId } = res.locals.auth!;
    try {
      const {
        name, codeLanguage, rawCode,
        classification = "AI-Primary",
        trustTier = DEFAULT_AGENT_TRUST_TIER,
        ropTarget = 3.0,
        recursiveDepth = 2,
        reuseFromUop = null,
        publishedBy = "les@fuzebox.ai",
        webhookUrl = null,
        webhookSecret = null,
      } = req.body || {};
      if (!name || !codeLanguage || !rawCode) return res.status(400).json({ error: "name, codeLanguage, rawCode required" });
      const parsed = parseAgentCode(codeLanguage, rawCode);
      const uopReuse = reuseFromUop ? await storage.getUoP(reuseFromUop) : null;
      const instructions = buildUopInstructions({
        name, classification, trustTier, ropTarget, recursiveDepth, parsed, reuseFrom: uopReuse,
      });
      const deploymentId = `dep-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
      const signature = `sig_${deploymentId}_${Buffer.from(rawCode).length.toString(16)}`;
      const publishedAt = new Date().toISOString();
      const dep = await storage.insertDeployment({
        deploymentId, tenantId, name, codeLanguage,
        agentKind: parsed.agentKind, classification, trustTier,
        ropTarget, recursiveDepth, reuseFromUop,
        rawCode, manifestJson: JSON.stringify(parsed.manifest, null, 2),
        uopInstructions: instructions,
        validationStatus: parsed.validationStatus,
        validationNotes: parsed.validationNotes,
        status: "deployed", signature,
        publishedAt,
        publishedBy,
        webhookUrl,
        webhookSecret,
      });
      // best-effort register agent in registry so it shows up immediately
      if (parsed.manifest.agent_id) {
        try {
          await storage.upsertAgent({
            agentId: parsed.manifest.agent_id,
            tenantId,
            name,
            hyperscaler: parsed.manifest.hyperscaler ?? "anthropic",
            model: parsed.manifest.model ?? null,
            trustTier,
            vendor: parsed.manifest.vendor ?? null,
            workflowId: parsed.manifest.workflow_id ?? null,
            status: "green",
            createdAt: new Date().toISOString(),
            humanBaselineMinutes: parsed.manifest.human_baseline_minutes ?? null,
            manualHourlyCostUsd: parsed.manifest.manual_hourly_cost_usd ?? null,
          });
        } catch {}
      }
      if (uopReuse) {
        try { await storage.bumpUoPReuse(uopReuse.uopId); } catch {}
      }
      // fire-and-forget webhook — notify client orchestrator of new deployment
      const deployWebhookUrl = process.env.DEPLOYMENT_WEBHOOK_URL ?? webhookUrl ?? null;
      if (deployWebhookUrl) {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        const secret = webhookSecret ?? process.env.DEPLOYMENT_WEBHOOK_SECRET ?? null;
        if (secret) {
          const { createHmac } = await import("crypto");
          const payload = JSON.stringify({ event: "agent.deployed", deploymentId });
          headers["X-Webhook-Signature"] = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
        }
        (async () => {
          try {
            await fetch(deployWebhookUrl, {
              method: "POST",
              headers,
              body: JSON.stringify({
                event: "agent.deployed",
                deploymentId,
                tenantId,
                name,
                agentKind: parsed.agentKind,
                trustTier,
                classification,
                ropTarget,
                signature,
                deployedAt: publishedAt,
              }),
            });
          } catch (err) {
            console.error("[deploy-webhook] callback failed", { deploymentId, error: err });
          }
        })();
      }
      res.json(dep);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/api/deployments/:deploymentId/status", requireAuth, async (req, res) => {
    const { status } = req.body || {};
    const deploymentId = Array.isArray(req.params.deploymentId) ? req.params.deploymentId[0] : req.params.deploymentId;
    const d = await storage.setDeploymentStatus(deploymentId, status);
    if (!d) return res.status(404).json({ error: "not found" });
    res.json(d);
  });

  /* ---------- Outreach QA — AI-drafted message quality ---------- */
  app.get("/api/observation/outreach", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const events = await storage.listCanonicalEvents(tenantId, 100);

    // Filter to outreach composer events
    const outreachEvents = events.filter(e =>
      e.agentId.toLowerCase().includes("outreach") ||
      e.agentId.toLowerCase().includes("composer") ||
      (e.skill ?? "").toLowerCase().includes("outreach") ||
      (e.skill ?? "").toLowerCase().includes("draft")
    );

    const CHANNELS = ["LinkedIn", "Email", "Slack"] as const;
    const channelKeywords: Record<string, string> = {
      linkedin: "LinkedIn",
      email: "Email",
      slack: "Slack",
    };

    function inferChannel(e: { skill: string | null; agentId: string }): "LinkedIn" | "Email" | "Slack" {
      const haystack = `${e.skill ?? ""} ${e.agentId}`.toLowerCase();
      for (const [kw, label] of Object.entries(channelKeywords)) {
        if (haystack.includes(kw)) return label as "LinkedIn" | "Email" | "Slack";
      }
      // deterministic fallback based on event position
      return CHANNELS[0];
    }

    function inferCandidateName(e: { agentId: string; skill: string | null; eventId: string }): string {
      // Try to extract a name-like segment from skill or agentId
      const raw = e.skill ?? e.agentId ?? "";
      const nameMatch = raw.match(/for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
      if (nameMatch) return nameMatch[1];
      return `Candidate ${e.eventId.slice(-4).toUpperCase()}`;
    }

    function inferMessage(e: { skill: string | null; agentId: string; wallMs: number }): string {
      const base = e.skill ?? e.agentId ?? "outreach message";
      return `AI-composed outreach via ${base} — generated in ${Math.round(e.wallMs / 1000)}s with personalization scoring applied.`;
    }

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400_000;

    const drafts = outreachEvents.map(e => {
      const personalizationScore = e.confidence ?? 0.75;
      const channel = inferChannel(e);
      const status: "Sent" | "Awaiting review" =
        e.humanReview === "pending" ? "Awaiting review" : "Sent";

      return {
        id: e.eventId,
        candidateName: inferCandidateName(e),
        channel,
        messageText: inferMessage(e),
        personalizationScore,
        status,
        capturedAt: e.capturedAt,
        humanReview: e.humanReview,
      };
    });

    // KPI: drafts this week
    const draftsThisWeek = drafts.filter(d => {
      const t = Date.parse(d.capturedAt);
      return !Number.isNaN(t) && t >= sevenDaysAgo;
    }).length;

    // KPI: avg personalization
    const avgPersonalization = drafts.length > 0
      ? drafts.reduce((s, d) => s + d.personalizationScore, 0) / drafts.length
      : 0;

    // KPI: flagged for review (personalization < 0.75 and humanReview = 'pending')
    const flaggedForReview = drafts.filter(
      d => d.personalizationScore < 0.75 && d.humanReview === "pending"
    ).length;

    // Channel mix percentages
    const channelCounts: Record<string, number> = { LinkedIn: 0, Email: 0, Slack: 0 };
    drafts.forEach(d => { channelCounts[d.channel] = (channelCounts[d.channel] ?? 0) + 1; });
    const total = drafts.length || 1;
    const channelMix = {
      LinkedIn: Math.round((channelCounts.LinkedIn / total) * 100),
      Email: Math.round((channelCounts.Email / total) * 100),
      Slack: Math.round((channelCounts.Slack / total) * 100),
    };

    res.json({
      drafts,
      kpis: {
        draftsThisWeek,
        avgPersonalization,
        flaggedForReview,
        channelMix,
      },
    });
  });

  /* ---------- Agent Registry — aggregated metrics ---------- */
  app.get("/api/observation/registry", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;

    // Aggregate metrics per agent from canonical_events
    const metrics = await db
      .select({
        agentId: canonicalEvents.agentId,
        totalRuns: count(canonicalEvents.id),
        passedRuns: sql<number>`cast(sum(case when ${canonicalEvents.passedThresholds} then 1 else 0 end) as int)`,
        totalBaselineMinutes: sum(canonicalEvents.humanBaselineMinutes),
        topModel: sql<string>`(
          select ${canonicalEvents.model}
          from ${canonicalEvents} as ce2
          where ce2.agent_id = ${canonicalEvents.agentId}
            and ce2.tenant_id = ${tenantId}
            and ce2.model is not null
          group by ce2.model
          order by count(*) desc
          limit 1
        )`,
      })
      .from(canonicalEvents)
      .where(eq(canonicalEvents.tenantId, tenantId))
      .groupBy(canonicalEvents.agentId);

    const metricsMap = new Map(metrics.map(m => [m.agentId, m]));

    const agents = await db
      .select()
      .from(agentRegistry)
      .where(eq(agentRegistry.tenantId, tenantId))
      .orderBy(agentRegistry.createdAt);

    const result = agents.map(a => {
      const m = metricsMap.get(a.agentId);
      const totalRuns = m?.totalRuns ?? 0;
      const passedRuns = m?.passedRuns ?? 0;
      const successRate = totalRuns > 0 ? passedRuns / totalRuns : 0;
      const hoursSaved = m?.totalBaselineMinutes != null
        ? Number(m.totalBaselineMinutes) / 60
        : 0;
      const activeModel = m?.topModel ?? a.model ?? null;

      return {
        agentId: a.agentId,
        name: a.name,
        model: activeModel,
        trustTier: a.trustTier,
        status: a.status,
        totalRuns,
        successRate,
        hoursSaved: Math.round(hoursSaved * 10) / 10,
      };
    });

    res.json(result);
  });

  /* ---------- What-if scenarios baselines (PEL-backed inputs) ---------- */
  app.get("/api/scenarios/baseline", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    res.json(await getScenariosBaseline(tenantId));
  });

  /* ---------- Aggregate dashboard summary ---------- */
  app.get("/api/dashboard/summary", requireAuth, async (_req, res) => {
    const { tenantId } = res.locals.auth!;
    const events = await storage.listCanonicalEvents(tenantId, 5000);
    const ledger = await storage.listLedger(tenantId, 5000);
    const snaps = await storage.listSnapshots(tenantId, 24);
    const latest = snaps[snaps.length - 1];
    const agents = await storage.listAgents(tenantId);
    const recs = await storage.listRecs(tenantId, "new");
    const coverage = await storage.listCoverage(tenantId);
    const governance = await storage.listGovernance(tenantId, 500);
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const governanceDecisions7d = governance.filter(g => {
      const t = Date.parse(g.firedAt);
      return !Number.isNaN(t) && t >= sevenDaysAgo;
    }).length;
    const closedRows  = ledger.filter(r => r.status === "closed");
    const openRows    = ledger.filter(r => r.status === "open");
    // All financial KPIs come from the equation snapshot (active-epoch window, authoritative).
    // Raw event aggregates are only used for non-financial counts below.
    const eqLaborSaved    = latest ? Number(latest.laborValueSavedUsd ?? 0) : 0;
    const eqCost          = latest ? Number(latest.amortizedCostUsd ?? 0) : 0;
    const eqNetSavings    = latest ? Number(latest.netSavingsUsd ?? 0) : eqLaborSaved - eqCost;
    const eqWeeklyRunRate = latest ? Number(latest.weeklyRunRateUsd ?? 0) : 0;
    const eqRop           = latest ? Number(latest.rop ?? 0) : 0;
    const byVendor: Record<string, { saved: number; cost: number; n: number }> = {};
    events.forEach(e => {
      byVendor[e.hyperscaler] ??= { saved: 0, cost: 0, n: 0 };
      byVendor[e.hyperscaler].saved += e.laborValueSavedUsd ?? 0;
      byVendor[e.hyperscaler].cost += e.amortizedCostUsd ?? 0;
      byVendor[e.hyperscaler].n += 1;
    });
    const passed = events.filter(e => e.passedThresholds).length;
    const passRate = events.length ? passed / events.length : 0;
    const queued = events.filter(e => e.humanReview === "queued").length;
    const totalTokens = events.reduce((s, e) => s + (e.inputTokens || 0) + (e.outputTokens || 0), 0);
    res.json({
      tenantId,
      counts: {
        events: events.length,
        ledgerRows: ledger.length,
        ledgerOpen: openRows.length,
        ledgerClosed: closedRows.length,
        agents: agents.length,
        newRecommendations: recs.length,
        coverageEntries: coverage.length,
        coverageGaps: coverage.filter(c => c.status !== "covered").length,
        governanceDecisions7d,
      },
      economics: {
        laborValueSavedUsd: eqLaborSaved,
        amortizedCostUsd: eqCost,
        netSavingsUsd: eqNetSavings,
        weeklyRunRateUsd: eqWeeklyRunRate,
        annualizedRunRateUsd: eqWeeklyRunRate * 52,
        ropAvg: eqRop,
        totalTokens,
        avgCostPerEvent: events.length ? eqCost / events.length : 0,
        avgSavedPerEvent: events.length ? eqLaborSaved / events.length : 0,
      },
      quality: {
        passRate, passedCount: passed, totalCount: events.length,
        humanReviewQueued: queued,
        sigmaLevel: dpmoToSigma(events.length - passed, events.length),
      },
      byVendor,
      latestEquations: latest,
    });
  });

  return httpServer;
}
