import { pgTable, text, integer, boolean, serial, doublePrecision, index, uniqueIndex, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

/**
 * FuzeBox AEOS — Economic Cognition Layer
 * ----------------------------------------
 * Persistence model for the canonical telemetry pipeline, the Predictive
 * Economic Ledger (PEL), the Five Business Equations roll-up, and the
 * Governance Plane decisions/recommendations.
 *
 * Layer mapping (per FuzeBoxAI_Economic_Cognition_Layer.docx):
 *   Observation Plane  -> canonical_events
 *   Predictive Ledger  -> ledger_rows  (Predicted/Actual/Variance/Attribution/Correction)
 *   Cognitive Output   -> equation_snapshots (CUoW, ABT, MER, CTR, TV, RoP, TUoP)
 *   Governance Plane   -> recommendations, governance_decisions, attestations
 *   Vendor Coverage    -> coverage_manifest, agent_registry
 */

/** Ordered trust ladder (Patent Family 8); used for promotion/demotion and defaults. */
export const TRUST_TIER_ORDER = [
  "T0_unverified",
  "T1_observed",
  "T2_supervised",
  "T3_trusted",
  "T4_autonomous",
] as const;

/** New agents and first-time registry rows start here until gates promote them. */
export const DEFAULT_AGENT_TRUST_TIER: (typeof TRUST_TIER_ORDER)[number] = "T0_unverified";

/* ============================================================
 * 0. Tenants  (multi-tenancy anchor — all other tables FK here)
 * ============================================================ */
export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),                                    // ULID
  slug: text("slug").notNull().unique(),                          // URL-safe identifier
  name: text("name").notNull(),
  plan: text("plan").notNull().default("starter"),                // starter|pro|enterprise
  status: text("status").notNull().default("active"),             // active|suspended|cancelled
  createdAt: text("created_at").notNull(),
  /** URL of the tenant's deployment server health endpoint — polled every 30s by the background poller. */
  deploymentHealthUrl: text("deployment_health_url"),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  username: text("username").notNull(),
  passwordHash: text("password_hash").notNull(),
}, (t) => ({
  // username uniqueness is per-tenant, not global
  tenantUsernameUniq: uniqueIndex("users_tenant_username_uniq").on(t.tenantId, t.username),
  tenantIdx: index("users_tenant_id_idx").on(t.tenantId),
}));

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  keyHash: text("key_hash").notNull().unique(), // store hash, not raw key
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  label: text("label").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (t) => ({
  tenantIdx: index("api_keys_tenant_id_idx").on(t.tenantId),
}));

/* ============================================================
 * 1. Canonical Telemetry Event (Observation Plane)
 *    Reflects the FuzeBox Canonical Event v1 schema in the brief.
 * ============================================================ */
export const canonicalEvents = pgTable("canonical_events", {
  id: serial("id").primaryKey(),
  eventId: text("event_id").notNull().unique(), // ULID
  schemaVersion: text("schema_version").notNull().default("fbx-canonical-v1.0"),
  capturedAt: text("captured_at").notNull(), // RFC3339
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  workspaceId: text("workspace_id"),
  decisionId: text("decision_id").notNull(), // propagating ID (OBS-03)

  // source
  hyperscaler: text("hyperscaler").notNull(), // anthropic|openai|ms_copilot|uniphore_baic|mistral|other
  endpoint: text("endpoint").notNull(),
  transport: text("transport").notNull(),
  vendorRequestId: text("vendor_request_id"),
  capturedVia: text("captured_via").notNull(), // litellm|proxy|otel|webhook|ebpf

  // actor
  agentId: text("agent_id").notNull(),
  agentKind: text("agent_kind").notNull(), // llm_call|tool_call|mcp_call|computer_use|human|rpa
  model: text("model"),
  humanUserId: text("human_user_id"),
  parentAgentId: text("parent_agent_id"),

  // task
  workflowId: text("workflow_id"),
  skill: text("skill"),
  skillVersion: text("skill_version"),
  trigger: text("trigger"),

  // consumption
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  toolCallsJson: text("tool_calls_json"), // JSON array
  wallMs: integer("wall_ms").notNull().default(0),
  vendorCostUsd: doublePrecision("vendor_cost_usd").notNull().default(0),
  amortizedCostUsd: doublePrecision("amortized_cost_usd").notNull().default(0),

  // quality
  passedThresholds: boolean("passed_thresholds").notNull().default(true),
  confidence: doublePrecision("confidence"),
  humanReview: text("human_review").default("auto"),
  reworkMinutes: doublePrecision("rework_minutes").default(0),

  // economic join
  ledgerAccount: text("ledger_account"),
  costCenter: text("cost_center"),
  humanBaselineMinutes: doublePrecision("human_baseline_minutes"),
  manualHourlyCostUsd: doublePrecision("manual_hourly_cost_usd"),
  laborValueSavedUsd: doublePrecision("labor_value_saved_usd").default(0),
  uopId: text("uop_id"),
  ropValue: doublePrecision("rop_value"),
  cuowValue: doublePrecision("cuow_value"),
  merValue: doublePrecision("mer_value"),

  // governance / audit chain (HMAC)
  policyId: text("policy_id"),
  policyOutcome: text("policy_outcome"), // allowed|blocked|human_gate|logged_only
  trustTier: text("trust_tier").default(DEFAULT_AGENT_TRUST_TIER),
  auditHash: text("audit_hash").notNull(),
  prevEventHash: text("prev_event_hash"),

  rawPayloadRef: text("raw_payload_ref"),
}, (t) => ({
  tenantIdx: index("canonical_events_tenant_id_idx").on(t.tenantId),
  tenantCapturedAtIdx: index("canonical_events_tenant_captured_at_idx").on(t.tenantId, t.capturedAt),
}));

/* ============================================================
 * 2. Predictive Economic Ledger Rows  (PEL — Patent Family 8)
 *    Five-structure record: Predicted / Actual / Variance /
 *    Attribution / Correction. Append-only chain in HMAC.
 * ============================================================ */
export const ledgerRows = pgTable("ledger_rows", {
  id: serial("id").primaryKey(),
  decisionId: text("decision_id").notNull().unique(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  agentId: text("agent_id").notNull(),
  workflowId: text("workflow_id"),
  skillId: text("skill_id"),
  status: text("status").notNull().default("open"), // open|closed|stale|writeback_failed
  createdAt: text("created_at").notNull(),
  closedAt: text("closed_at"),

  // PREDICTED — UEF eight-dimension score, signed at execution
  predictedCostUsd: doublePrecision("predicted_cost_usd").notNull(),
  predictedOutcomeUsd: doublePrecision("predicted_outcome_usd").notNull(),
  predictedSignature: text("predicted_signature").notNull(),
  predictedSignedAt: text("predicted_signed_at").notNull(),

  // UEF dimensions (UEF-01..08)
  uefCapabilityFit: doublePrecision("uef_capability_fit"),
  uefGstiScore: doublePrecision("uef_gsti_score"),
  uefGstiClassification: text("uef_gsti_classification"), // Human-Only|AI-Assisted|Hybrid|AI-Primary
  uefUopValue: doublePrecision("uef_uop_value"),
  uefCoordinationTax: doublePrecision("uef_coordination_tax"),
  uefGovernanceScore: doublePrecision("uef_governance_score"),
  uefRuntimeFit: doublePrecision("uef_runtime_fit"),
  uefEconomicValue: doublePrecision("uef_economic_value"),
  uefRiskPenalty: doublePrecision("uef_risk_penalty"),
  staleSignalFlag: boolean("stale_signal_flag").default(false),

  // ACTUAL — populated from System of Record (SoR) webhook
  actualCostUsd: doublePrecision("actual_cost_usd"),
  actualOutcomeUsd: doublePrecision("actual_outcome_usd"),
  actualSourceSor: text("actual_source_sor"), // salesforce|sap|hubspot|oracle_gl
  fuzeboxSig: text("fuzebox_sig"),
  rpotentialSig: text("rpotential_sig"),
  cosignStatus: text("cosign_status").default("pending"), // pending|complete|single_party

  // VARIANCE — technical & economic
  techVarianceSigma: doublePrecision("tech_variance_sigma"),
  techErrorRate: doublePrecision("tech_error_rate"),
  econWinRateDelta: doublePrecision("econ_win_rate_delta"),
  econCostDelta: doublePrecision("econ_cost_delta"),

  // ATTRIBUTION — five-bucket
  attributionBucket: text("attribution_bucket"), // agent|prompt|data|policy|environment
  attributionConfidence: doublePrecision("attribution_confidence"),

  // CORRECTION — DIR patch reference
  correctionType: text("correction_type"), // prompt_patch|routing_patch|code_patch
  correctionRef: text("correction_ref"),
  correctionAppliedAt: text("correction_applied_at"),

  // chain
  rowHash: text("row_hash").notNull(),
  prevRowHash: text("prev_row_hash"),
}, (t) => ({
  tenantIdx: index("ledger_rows_tenant_id_idx").on(t.tenantId),
  tenantStatusIdx: index("ledger_rows_tenant_status_idx").on(t.tenantId, t.status),
}));

/* ============================================================
 * 3. Equation Snapshots  (Cognitive output, time-series)
 *    Five Business Equations + RoP/TUoP, computed continuously.
 * ============================================================ */
export const equationSnapshots = pgTable("equation_snapshots", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  workflowId: text("workflow_id"),
  agentId: text("agent_id"),
  computedAt: text("computed_at").notNull(),
  windowSeconds: integer("window_seconds").notNull().default(3600),
  // five business equations
  cuow: doublePrecision("cuow"),               // cost per unit of work
  abt: doublePrecision("abt"),                 // agent break-even threshold
  mer: doublePrecision("mer"),                 // model efficiency ratio
  ctr: doublePrecision("ctr"),                 // coordination tax ratio
  tv: doublePrecision("tv"),                   // transformation velocity
  // bonus
  rop: doublePrecision("rop"),                 // return on potential
  tuop: doublePrecision("tuop"),               // total UoP (HUoP+AUoP+H*A*S)
  huop: doublePrecision("huop"),
  auop: doublePrecision("auop"),
  synergyS: doublePrecision("synergy_s"),
  taskCount: integer("task_count").default(0),
  // financial totals captured at rollup time (active-epoch window only)
  laborValueSavedUsd: doublePrecision("labor_value_saved_usd"),
  amortizedCostUsd: doublePrecision("amortized_cost_usd"),
  netSavingsUsd: doublePrecision("net_savings_usd"),
  weeklyRunRateUsd: doublePrecision("weekly_run_rate_usd"),
}, (t) => ({
  tenantIdx: index("equation_snapshots_tenant_id_idx").on(t.tenantId),
  tenantComputedAtIdx: index("equation_snapshots_tenant_computed_at_idx").on(t.tenantId, t.computedAt),
}));

/* ============================================================
 * 4. Recommendations  (templated patterns surfaced in UI)
 * ============================================================ */
export const recommendations = pgTable("recommendations", {
  id: serial("id").primaryKey(),
  recId: text("rec_id").notNull().unique(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  generatedAt: text("generated_at").notNull(),
  template: text("template").notNull(), // cost_optim|gsti_drift|boundary_violation|vendor_swap|skill_preserve|trust_promotion|budget_gate
  severity: text("severity").notNull().default("info"), // info|warn|critical
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  agentId: text("agent_id"),
  workflowId: text("workflow_id"),
  predictedDeltaUsd: doublePrecision("predicted_delta_usd"),
  confidence: doublePrecision("confidence"),
  status: text("status").notNull().default("new"), // new|adopted|rejected|deferred
  decidedAt: text("decided_at"),
  decidedBy: text("decided_by"),
}, (t) => ({
  tenantIdx: index("recommendations_tenant_id_idx").on(t.tenantId),
  tenantStatusIdx: index("recommendations_tenant_status_idx").on(t.tenantId, t.status),
}));

/* ============================================================
 * 5. Governance Decisions  (Policy engine outputs, audit closed-loop)
 * ============================================================ */
export const governanceDecisions = pgTable("governance_decisions", {
  id: serial("id").primaryKey(),
  decisionId: text("decision_id").notNull(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  firedAt: text("fired_at").notNull(),
  policyId: text("policy_id").notNull(),
  policyOutcome: text("policy_outcome").notNull(), // allowed|blocked|human_gate|reroute|logged_only
  rationale: text("rationale"),
  prevTrustTier: text("prev_trust_tier"),
  newTrustTier: text("new_trust_tier"),
  rerouteFromModel: text("reroute_from_model"),
  rerouteToModel: text("reroute_to_model"),
  /** Short label for audit UI (e.g. rec title, agent id). */
  subject: text("subject"),
  /** Human or system actor when known (e.g. recommendation decidedBy). */
  actor: text("actor"),
  relatedRecId: text("related_rec_id"),
}, (t) => ({
  tenantIdx: index("governance_decisions_tenant_id_idx").on(t.tenantId),
  tenantFiredAtIdx: index("governance_decisions_tenant_fired_at_idx").on(t.tenantId, t.firedAt),
}));

/* ============================================================
 * 6. Coverage Manifest  (OBS-11..15)
 * ============================================================ */
export const coverageManifest = pgTable("coverage_manifest", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  hyperscaler: text("hyperscaler").notNull(),
  surface: text("surface").notNull(), // messages|responses|operator|mcp|tool|agent_run
  status: text("status").notNull(), // covered|gap|degraded
  activatedAt: text("activated_at"),
  lastTelemetryAt: text("last_telemetry_at"),
  signedAt: text("signed_at"),
  signature: text("signature"),
}, (t) => ({
  tenantIdx: index("coverage_manifest_tenant_id_idx").on(t.tenantId),
  tenantHyperscalerUniq: uniqueIndex("coverage_manifest_tenant_hyperscaler_surface_uniq").on(t.tenantId, t.hyperscaler, t.surface),
}));

/* ============================================================
 * 7b. UoP Library  (published Units-of-Production catalogue)
 *     The canonical store of UoPs surfaced from Cognition Plane.
 *     A UoP becomes a reusable economic primitive once published.
 * ============================================================ */
export const uopLibrary = pgTable("uop_library", {
  id: serial("id").primaryKey(),
  uopId: text("uop_id").notNull().unique(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  workflowId: text("workflow_id"),
  agentId: text("agent_id"),
  publishedAt: text("published_at").notNull(),
  publishedBy: text("published_by").notNull(),
  classification: text("classification").notNull(), // Human-Only|AI-Assisted|Hybrid|AI-Primary
  description: text("description"),
  // measured economics at publish time
  laborValueSavedUsd: doublePrecision("labor_value_saved_usd").notNull(),
  amortizedCostUsd: doublePrecision("amortized_cost_usd").notNull(),
  ropValue: doublePrecision("rop_value").notNull(),
  cuow: doublePrecision("cuow").notNull(),
  mer: doublePrecision("mer").notNull(),
  // synergy contribution
  huopShare: doublePrecision("huop_share"),
  auopShare: doublePrecision("auop_share"),
  synergyShare: doublePrecision("synergy_share"),
  // governance
  trustTier: text("trust_tier").notNull(),
  signature: text("signature").notNull(),
  status: text("status").notNull().default("published"), // draft|published|deprecated
  reuseCount: integer("reuse_count").notNull().default(0),
}, (t) => ({
  tenantIdx: index("uop_library_tenant_id_idx").on(t.tenantId),
  tenantStatusIdx: index("uop_library_tenant_status_idx").on(t.tenantId, t.status),
}));

/* ============================================================
 * 7c. Agent Deployments  (code packages submitted via Deploy Agent Code)
 *     Stores the raw code (JSON / CrewAI / Python) plus parsed manifest,
 *     UoP instructions, recursive-training profile, and lifecycle status.
 * ============================================================ */
export const agentDeployments = pgTable("agent_deployments", {
  id: serial("id").primaryKey(),
  deploymentId: text("deployment_id").notNull().unique(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  codeLanguage: text("code_language").notNull(), // json|crewai|python
  agentKind: text("agent_kind").notNull().default("agent"), // agent|task|workflow|crew
  classification: text("classification").notNull().default("AI-Primary"),
  trustTier: text("trust_tier").notNull().default(DEFAULT_AGENT_TRUST_TIER),
  ropTarget: doublePrecision("rop_target").notNull().default(3.0),
  recursiveDepth: integer("recursive_depth").notNull().default(2),
  reuseFromUop: text("reuse_from_uop"), // uop_id reference, optional
  rawCode: text("raw_code").notNull(),
  manifestJson: text("manifest_json").notNull(), // parsed manifest summary
  uopInstructions: text("uop_instructions").notNull(), // generated rendered instructions
  validationStatus: text("validation_status").notNull().default("valid"), // valid|warnings|errors
  validationNotes: text("validation_notes"),
  status: text("status").notNull().default("deployed"), // draft|deployed|training|retired
  signature: text("signature").notNull(),
  publishedAt: text("published_at").notNull(),
  publishedBy: text("published_by").notNull(),
  webhookUrl: text("webhook_url"),    // nullable — client orchestrator endpoint to notify on deploy
  webhookSecret: text("webhook_secret"), // nullable — used for HMAC-SHA256 X-Webhook-Signature header
}, (t) => ({
  tenantIdx: index("agent_deployments_tenant_id_idx").on(t.tenantId),
  tenantStatusIdx: index("agent_deployments_tenant_status_idx").on(t.tenantId, t.status),
}));

export type AgentDeployment = typeof agentDeployments.$inferSelect;
export const insertAgentDeploymentSchema = createInsertSchema(agentDeployments).omit({ id: true });
export type InsertAgentDeployment = z.infer<typeof insertAgentDeploymentSchema>;

/* ============================================================
 * 7. Agent Registry  (Trust Governance, Patent Family 5)
 * ============================================================ */
export const agentRegistry = pgTable("agent_registry", {
  id: serial("id").primaryKey(),
  /** Stable id within a tenant; same value may repeat across different tenants. */
  agentId: text("agent_id").notNull(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  hyperscaler: text("hyperscaler").notNull(),
  model: text("model"),
  trustTier: text("trust_tier").notNull().default(DEFAULT_AGENT_TRUST_TIER), // T0..T4
  vendor: text("vendor"),
  workflowId: text("workflow_id"),
  humanBaselineMinutes: doublePrecision("human_baseline_minutes"),
  manualHourlyCostUsd: doublePrecision("manual_hourly_cost_usd"),
  status: text("status").notNull().default("green"), // green|amber|red
  createdAt: text("created_at").notNull(),
  /** Timestamp of the last trust tier change; used to enforce the 30-day cool-down. */
  tierUpdatedAt: timestamp("tier_updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("agent_registry_tenant_id_idx").on(t.tenantId),
  tenantStatusIdx: index("agent_registry_tenant_status_idx").on(t.tenantId, t.status),
  tenantAgentUnique: uniqueIndex("agent_registry_tenant_agent_unique").on(t.tenantId, t.agentId),
}));

/* ============================================================
 * 9. Tenant Health Probes  (Deployment server liveness polling)
 *    One row per poll tick per tenant. The latest row drives the
 *    real-time agent liveness display on the Live Monitor.
 * ============================================================ */
export const tenantHealthProbes = pgTable("tenant_health_probes", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  checkedAt: timestamp("checked_at").notNull().defaultNow(),
  isReachable: boolean("is_reachable").notNull(),
  httpStatus: integer("http_status"),
  responseMs: integer("response_ms"),
  activeAgents: integer("active_agents"),
}, (t) => ({
  tenantIdx: index("tenant_health_probes_tenant_id_idx").on(t.tenantId),
  checkedAtIdx: index("tenant_health_probes_checked_at_idx").on(t.checkedAt),
}));

export type TenantHealthProbe = typeof tenantHealthProbes.$inferSelect;
export type InsertTenantHealthProbe = typeof tenantHealthProbes.$inferInsert;

/* ============================================================
 * 8. Governance Rules  (Rules & Compliance — Governance Plane)
 *    Stores per-tenant toggle configurations surfaced in the UI.
 *    task_type is a loose VARCHAR so each tenant can name their
 *    own workforce tasks (e.g. 'intake_classification', 'patient_triage').
 * ============================================================ */
export const governanceRules = pgTable("governance_rules", {
  id: text("id").primaryKey(),                                      // e.g. 'R-001'
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),                                     // e.g. 'Override rate cap'
  description: text("description").notNull(),
  taskType: text("task_type").notNull(),                            // free-form workforce task string
  enforcementAction: text("enforcement_action").notNull(),          // 'BLOCK' | 'WARN' | 'LOG'
  isActive: boolean("is_active").notNull().default(true),           // master ON/OFF toggle
  referenceCode: text("reference_code"),                            // e.g. 'ISO/IEC 42001 §6.1.3'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("governance_rules_tenant_id_idx").on(t.tenantId),
  tenantTaskTypeIdx: index("governance_rules_tenant_task_type_idx").on(t.tenantId, t.taskType),
}));

export type GovernanceRule = typeof governanceRules.$inferSelect;
export type InsertGovernanceRule = typeof governanceRules.$inferInsert;
export const insertGovernanceRuleSchema = createInsertSchema(governanceRules);

/* ============================================================
 * 9. FMEA Risk Register  (Failure Mode & Effects Analysis)
 *    Tracks per-agent failure modes, risk scores, and mitigations.
 *    Linked to agent_registry via agent_registry_id FK.
 * ============================================================ */
export const fmeaItems = pgTable("fmea_items", {
  id: text("id").primaryKey(),                                         // e.g. "FMEA-101"
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  agentRegistryId: integer("agent_registry_id").references(() => agentRegistry.id),
  processScope: text("process_scope").notNull(),                       // e.g. "Sports Betting Analyst"
  failureMode: text("failure_mode").notNull(),                         // e.g. "Hallucinated odds outside book range"
  effect: text("effect").notNull(),
  rootCause: text("root_cause").notNull(),
  mitigation: text("mitigation").notNull(),
  severity: integer("severity").notNull(),                             // 1–10
  occurrence: integer("occurrence").notNull(),                         // 1–10
  detection: integer("detection").notNull(),                           // 1–10
  status: text("status").notNull().default("OPEN"),                    // OPEN|MITIGATED|CLOSED
  owner: text("owner").notNull(),                                      // e.g. "Marcus Webb"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("fmea_items_tenant_id_idx").on(t.tenantId),
  tenantStatusIdx: index("fmea_items_tenant_status_idx").on(t.tenantId, t.status),
  agentRegistryIdx: index("fmea_items_agent_registry_id_idx").on(t.agentRegistryId),
}));

export type FmeaItem = typeof fmeaItems.$inferSelect;
export type InsertFmeaItem = typeof fmeaItems.$inferInsert;
export const insertFmeaItemSchema = createInsertSchema(fmeaItems);

/* ============================================================
 * 10. Build vs Buy  (Insights — per-process Build vs Buy analysis)
 *    One row per process comparison (build cost/timeline/risk vs
 *    buy cost/timeline/risk + recommendation), plus a per-tenant
 *    weighted decision matrix stored as JSON (factor/weight/scores).
 * ============================================================ */
export const buildVsBuyComparisons = pgTable("build_vs_buy_comparisons", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  process: text("process").notNull(),
  buildCostUsd: doublePrecision("build_cost_usd").notNull(),
  buildTimeline: text("build_timeline").notNull(),
  buildRisk: text("build_risk").notNull(),          // Low|Medium|High
  buildControl: text("build_control").notNull(),
  buyCostUsd: doublePrecision("buy_cost_usd").notNull(),
  buyTimeline: text("buy_timeline").notNull(),
  buyRisk: text("buy_risk").notNull(),              // Low|Medium|High
  buyControl: text("buy_control").notNull(),
  recommendation: text("recommendation").notNull(), // BUILD|BUY
  rationale: text("rationale").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index("build_vs_buy_comparisons_tenant_id_idx").on(t.tenantId),
  tenantProcessUniq: uniqueIndex("build_vs_buy_comparisons_tenant_process_uniq").on(t.tenantId, t.process),
}));

export type BuildVsBuyComparison = typeof buildVsBuyComparisons.$inferSelect;
export type InsertBuildVsBuyComparison = typeof buildVsBuyComparisons.$inferInsert;
export const insertBuildVsBuyComparisonSchema = createInsertSchema(buildVsBuyComparisons).omit({ id: true, createdAt: true, updatedAt: true });

/** Per-tenant weighted decision matrix — one row, factors held as a JSON array of {factor, weight, build, buy}. */
export const buildVsBuyMatrices = pgTable("build_vs_buy_matrices", {
  id: serial("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id).unique(),
  factors: jsonb("factors").notNull().$type<{ factor: string; weight: number; build: number; buy: number }[]>(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BuildVsBuyMatrix = typeof buildVsBuyMatrices.$inferSelect;
export type InsertBuildVsBuyMatrix = typeof buildVsBuyMatrices.$inferInsert;
export const insertBuildVsBuyMatrixSchema = createInsertSchema(buildVsBuyMatrices).omit({ id: true, updatedAt: true });

/* ============================================================
 * Insert + Select types
 * ============================================================ */
export const insertTenantSchema = createInsertSchema(tenants);
export type InsertTenant = typeof tenants.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;

export const insertUserSchema = createInsertSchema(users).pick({ tenantId: true, username: true, passwordHash: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// NEW: Safe user type for API responses (strips the password hash)
export type SelectUser = Omit<User, "passwordHash">;

export const insertCanonicalEventSchema = createInsertSchema(canonicalEvents).omit({ id: true });
export type CanonicalEvent = typeof canonicalEvents.$inferSelect;
export type InsertCanonicalEvent = z.infer<typeof insertCanonicalEventSchema>;

export const insertLedgerRowSchema = createInsertSchema(ledgerRows).omit({ id: true });
export type LedgerRow = typeof ledgerRows.$inferSelect;
export type InsertLedgerRow = z.infer<typeof insertLedgerRowSchema>;

export const insertRecommendationSchema = createInsertSchema(recommendations).omit({ id: true });
export type Recommendation = typeof recommendations.$inferSelect;
export type InsertRecommendation = z.infer<typeof insertRecommendationSchema>;

export type EquationSnapshot = typeof equationSnapshots.$inferSelect;
export type GovernanceDecision = typeof governanceDecisions.$inferSelect;
export type CoverageEntry = typeof coverageManifest.$inferSelect;
export type AgentRecord = typeof agentRegistry.$inferSelect;
export type UoPLibraryEntry = typeof uopLibrary.$inferSelect;
export const insertUoPLibrarySchema = createInsertSchema(uopLibrary).omit({ id: true });
export type InsertUoPLibraryEntry = z.infer<typeof insertUoPLibrarySchema>;

export type InsertApiKey = typeof apiKeys.$inferInsert;
export type SelectApiKey = typeof apiKeys.$inferSelect;
