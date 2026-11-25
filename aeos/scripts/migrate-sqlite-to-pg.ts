/**
 * Migration script: SQLite (data.db) → PostgreSQL (DATABASE_URL)
 *
 * Run with:
 *   DATABASE_URL=postgresql://... tsx scripts/migrate-sqlite-to-pg.ts
 *
 * Assumptions:
 *   - The PostgreSQL schema has already been pushed via `npm run db:push`
 *   - The target PostgreSQL tables are empty
 *   - data.db exists in the project root
 */

import Database from "better-sqlite3";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../shared/schema.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../data.db");
const BATCH_SIZE = 100;

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const sqlite = new Database(DB_PATH);
const pgClient = postgres(process.env.DATABASE_URL);
const pg = drizzle(pgClient, { schema });

// SQLite booleans are stored as 0/1 — convert to true/false for PostgreSQL
const toBool = (v: number | null | undefined): boolean | null =>
  v == null ? null : v !== 0;

async function migrateTable<T extends Record<string, unknown>>(
  tableName: string,
  pgTable: any,
  transform: (row: Record<string, unknown>) => T,
) {
  const rows = sqlite.prepare(`SELECT * FROM ${tableName}`).all() as Record<string, unknown>[];

  if (rows.length === 0) {
    console.log(`  ${tableName}: 0 rows — skipping`);
    return;
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map(transform);
    await pg.insert(pgTable).values(batch as any);
    inserted += batch.length;
  }
  console.log(`  ${tableName}: ${inserted} rows migrated`);
}

async function main() {
  console.log(`\nFuzeBox ECL — SQLite → PostgreSQL Migration`);
  console.log(`Source: ${DB_PATH}`);
  console.log(`Target: ${process.env.DATABASE_URL!.replace(/:\/\/.*@/, "://<credentials>@")}\n`);

  // ── users ──────────────────────────────────────────────────────────────────
  await migrateTable("users", schema.users, (r) => ({
    username: r.username as string,
    password: r.password as string,
  }));

  // ── canonical_events ───────────────────────────────────────────────────────
  await migrateTable("canonical_events", schema.canonicalEvents, (r) => ({
    eventId: r.event_id as string,
    schemaVersion: r.schema_version as string,
    capturedAt: r.captured_at as string,
    tenantId: r.tenant_id as string,
    workspaceId: r.workspace_id as string | null,
    decisionId: r.decision_id as string,
    hyperscaler: r.hyperscaler as string,
    endpoint: r.endpoint as string,
    transport: r.transport as string,
    vendorRequestId: r.vendor_request_id as string | null,
    capturedVia: r.captured_via as string,
    agentId: r.agent_id as string,
    agentKind: r.agent_kind as string,
    model: r.model as string | null,
    humanUserId: r.human_user_id as string | null,
    parentAgentId: r.parent_agent_id as string | null,
    workflowId: r.workflow_id as string | null,
    skill: r.skill as string | null,
    skillVersion: r.skill_version as string | null,
    trigger: r.trigger as string | null,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    toolCallsJson: r.tool_calls_json as string | null,
    wallMs: r.wall_ms as number,
    vendorCostUsd: r.vendor_cost_usd as number,
    amortizedCostUsd: r.amortized_cost_usd as number,
    passedThresholds: toBool(r.passed_thresholds as number) ?? true,
    confidence: r.confidence as number | null,
    humanReview: r.human_review as string | null,
    reworkMinutes: r.rework_minutes as number | null,
    ledgerAccount: r.ledger_account as string | null,
    costCenter: r.cost_center as string | null,
    humanBaselineMinutes: r.human_baseline_minutes as number | null,
    manualHourlyCostUsd: r.manual_hourly_cost_usd as number | null,
    laborValueSavedUsd: r.labor_value_saved_usd as number | null,
    uopId: r.uop_id as string | null,
    ropValue: r.rop_value as number | null,
    cuowValue: r.cuow_value as number | null,
    merValue: r.mer_value as number | null,
    policyId: r.policy_id as string | null,
    policyOutcome: r.policy_outcome as string | null,
    trustTier: r.trust_tier as string | null,
    auditHash: r.audit_hash as string,
    prevEventHash: r.prev_event_hash as string | null,
    rawPayloadRef: r.raw_payload_ref as string | null,
  }));

  // ── ledger_rows ────────────────────────────────────────────────────────────
  await migrateTable("ledger_rows", schema.ledgerRows, (r) => ({
    decisionId: r.decision_id as string,
    tenantId: r.tenant_id as string,
    agentId: r.agent_id as string,
    workflowId: r.workflow_id as string | null,
    skillId: r.skill_id as string | null,
    status: r.status as string,
    createdAt: r.created_at as string,
    closedAt: r.closed_at as string | null,
    predictedCostUsd: r.predicted_cost_usd as number,
    predictedOutcomeUsd: r.predicted_outcome_usd as number,
    predictedSignature: r.predicted_signature as string,
    predictedSignedAt: r.predicted_signed_at as string,
    uefCapabilityFit: r.uef_capability_fit as number | null,
    uefGstiScore: r.uef_gsti_score as number | null,
    uefGstiClassification: r.uef_gsti_classification as string | null,
    uefUopValue: r.uef_uop_value as number | null,
    uefCoordinationTax: r.uef_coordination_tax as number | null,
    uefGovernanceScore: r.uef_governance_score as number | null,
    uefRuntimeFit: r.uef_runtime_fit as number | null,
    uefEconomicValue: r.uef_economic_value as number | null,
    uefRiskPenalty: r.uef_risk_penalty as number | null,
    staleSignalFlag: toBool(r.stale_signal_flag as number),
    actualCostUsd: r.actual_cost_usd as number | null,
    actualOutcomeUsd: r.actual_outcome_usd as number | null,
    actualSourceSor: r.actual_source_sor as string | null,
    fuzeboxSig: r.fuzebox_sig as string | null,
    rpotentialSig: r.rpotential_sig as string | null,
    cosignStatus: r.cosign_status as string | null,
    techVarianceSigma: r.tech_variance_sigma as number | null,
    techErrorRate: r.tech_error_rate as number | null,
    econWinRateDelta: r.econ_win_rate_delta as number | null,
    econCostDelta: r.econ_cost_delta as number | null,
    attributionBucket: r.attribution_bucket as string | null,
    attributionConfidence: r.attribution_confidence as number | null,
    correctionType: r.correction_type as string | null,
    correctionRef: r.correction_ref as string | null,
    correctionAppliedAt: r.correction_applied_at as string | null,
    rowHash: r.row_hash as string,
    prevRowHash: r.prev_row_hash as string | null,
  }));

  // ── equation_snapshots ─────────────────────────────────────────────────────
  await migrateTable("equation_snapshots", schema.equationSnapshots, (r) => ({
    tenantId: r.tenant_id as string,
    workflowId: r.workflow_id as string | null,
    agentId: r.agent_id as string | null,
    computedAt: r.computed_at as string,
    windowSeconds: r.window_seconds as number,
    cuow: r.cuow as number | null,
    abt: r.abt as number | null,
    mer: r.mer as number | null,
    ctr: r.ctr as number | null,
    tv: r.tv as number | null,
    rop: r.rop as number | null,
    tuop: r.tuop as number | null,
    huop: r.huop as number | null,
    auop: r.auop as number | null,
    synergyS: r.synergy_s as number | null,
    taskCount: r.task_count as number | null,
  }));

  // ── recommendations ────────────────────────────────────────────────────────
  await migrateTable("recommendations", schema.recommendations, (r) => ({
    recId: r.rec_id as string,
    tenantId: r.tenant_id as string,
    generatedAt: r.generated_at as string,
    template: r.template as string,
    severity: r.severity as string,
    title: r.title as string,
    rationale: r.rationale as string,
    agentId: r.agent_id as string | null,
    workflowId: r.workflow_id as string | null,
    predictedDeltaUsd: r.predicted_delta_usd as number | null,
    confidence: r.confidence as number | null,
    status: r.status as string,
    decidedAt: r.decided_at as string | null,
    decidedBy: r.decided_by as string | null,
  }));

  // ── governance_decisions ───────────────────────────────────────────────────
  await migrateTable("governance_decisions", schema.governanceDecisions, (r) => ({
    decisionId: r.decision_id as string,
    tenantId: r.tenant_id as string,
    firedAt: r.fired_at as string,
    policyId: r.policy_id as string,
    policyOutcome: r.policy_outcome as string,
    rationale: r.rationale as string | null,
    prevTrustTier: r.prev_trust_tier as string | null,
    newTrustTier: r.new_trust_tier as string | null,
    rerouteFromModel: r.reroute_from_model as string | null,
    rerouteToModel: r.reroute_to_model as string | null,
    subject: (r.subject as string | null) ?? null,
    actor: (r.actor as string | null) ?? null,
    relatedRecId: (r.related_rec_id as string | null) ?? null,
  }));

  // ── coverage_manifest ──────────────────────────────────────────────────────
  await migrateTable("coverage_manifest", schema.coverageManifest, (r) => ({
    tenantId: r.tenant_id as string,
    hyperscaler: r.hyperscaler as string,
    surface: r.surface as string,
    status: r.status as string,
    activatedAt: r.activated_at as string | null,
    lastTelemetryAt: r.last_telemetry_at as string | null,
    signedAt: r.signed_at as string | null,
    signature: r.signature as string | null,
  }));

  // ── agent_registry ─────────────────────────────────────────────────────────
  await migrateTable("agent_registry", schema.agentRegistry, (r) => ({
    agentId: r.agent_id as string,
    tenantId: r.tenant_id as string,
    name: r.name as string,
    hyperscaler: r.hyperscaler as string,
    model: r.model as string | null,
    trustTier: r.trust_tier as string,
    vendor: r.vendor as string | null,
    workflowId: r.workflow_id as string | null,
    status: r.status as string,
    createdAt: r.created_at as string,
  }));

  // ── uop_library ────────────────────────────────────────────────────────────
  await migrateTable("uop_library", schema.uopLibrary, (r) => ({
    uopId: r.uop_id as string,
    tenantId: r.tenant_id as string,
    name: r.name as string,
    workflowId: r.workflow_id as string | null,
    agentId: r.agent_id as string | null,
    publishedAt: r.published_at as string,
    publishedBy: r.published_by as string,
    classification: r.classification as string,
    description: r.description as string | null,
    laborValueSavedUsd: r.labor_value_saved_usd as number,
    amortizedCostUsd: r.amortized_cost_usd as number,
    ropValue: r.rop_value as number,
    cuow: r.cuow as number,
    mer: r.mer as number,
    huopShare: r.huop_share as number | null,
    auopShare: r.auop_share as number | null,
    synergyShare: r.synergy_share as number | null,
    trustTier: r.trust_tier as string,
    signature: r.signature as string,
    status: r.status as string,
    reuseCount: r.reuse_count as number,
  }));

  // ── agent_deployments ──────────────────────────────────────────────────────
  await migrateTable("agent_deployments", schema.agentDeployments, (r) => ({
    deploymentId: r.deployment_id as string,
    tenantId: r.tenant_id as string,
    name: r.name as string,
    codeLanguage: r.code_language as string,
    agentKind: r.agent_kind as string,
    classification: r.classification as string,
    trustTier: r.trust_tier as string,
    ropTarget: r.rop_target as number,
    recursiveDepth: r.recursive_depth as number,
    reuseFromUop: r.reuse_from_uop as string | null,
    rawCode: r.raw_code as string,
    manifestJson: r.manifest_json as string,
    uopInstructions: r.uop_instructions as string,
    validationStatus: r.validation_status as string,
    validationNotes: r.validation_notes as string | null,
    status: r.status as string,
    signature: r.signature as string,
    publishedAt: r.published_at as string,
    publishedBy: r.published_by as string,
  }));

  console.log("\nMigration complete.\n");
  await pgClient.end();
  sqlite.close();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
