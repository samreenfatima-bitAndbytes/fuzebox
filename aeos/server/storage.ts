import {
  users,
  tenants,
  apiKeys,
  canonicalEvents,
  ledgerRows,
  equationSnapshots,
  recommendations,
  governanceDecisions,
  coverageManifest,
  agentRegistry,
  tenantHealthProbes,
  uopLibrary,
  agentDeployments,
  TRUST_TIER_ORDER,
} from "@shared/schema";
import type {
  User, InsertUser,
  Tenant, InsertTenant,
  CanonicalEvent, InsertCanonicalEvent,
  LedgerRow, InsertLedgerRow,
  Recommendation, InsertRecommendation,
  EquationSnapshot,
  GovernanceDecision,
  CoverageEntry,
  AgentRecord,
  TenantHealthProbe,
  UoPLibraryEntry, InsertUoPLibraryEntry,
  AgentDeployment, InsertAgentDeployment,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc, and, gte, sql, avg, count, max, isNull, inArray } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);

export interface IStorage {
  listActiveTenantIds(): Promise<string[]>;
  getActiveTenantAgentIds(tenantId: string): Promise<string[]>;

  // user (template default)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // ECL
  appendCanonicalEvent(e: InsertCanonicalEvent): Promise<CanonicalEvent>;
  listCanonicalEvents(tenantId: string, limit?: number): Promise<CanonicalEvent[]>;
  /** Returns only events whose agentId is in the provided set. Empty agentIds → empty result. */
  listCanonicalEventsForAgents(tenantId: string, agentIds: string[], limit?: number): Promise<CanonicalEvent[]>;
  lastEventHash(tenantId: string): Promise<string | undefined>;

  upsertLedgerRow(row: InsertLedgerRow): Promise<LedgerRow>;
  getLedgerRow(decisionId: string): Promise<LedgerRow | undefined>;
  closeLedgerRow(decisionId: string, patch: Partial<LedgerRow>): Promise<LedgerRow | undefined>;
  listLedger(tenantId: string, limit?: number): Promise<LedgerRow[]>;
  /** Returns only ledger rows whose agentId is in the provided set. Empty agentIds → empty result. */
  listLedgerForAgents(tenantId: string, agentIds: string[], limit?: number): Promise<LedgerRow[]>;

  insertSnapshot(s: Omit<EquationSnapshot, "id">): Promise<EquationSnapshot>;
  listSnapshots(tenantId: string, hours: number): Promise<EquationSnapshot[]>;

  insertRec(r: InsertRecommendation): Promise<Recommendation>;
  listRecs(tenantId: string, status?: string): Promise<Recommendation[]>;
  decideRec(recId: string, status: string, decidedBy: string): Promise<Recommendation | undefined>;

  insertGovernance(g: Omit<GovernanceDecision, "id">): Promise<GovernanceDecision>;
  listGovernance(tenantId: string, limit?: number): Promise<GovernanceDecision[]>;

  upsertCoverage(c: Omit<CoverageEntry, "id">): Promise<CoverageEntry>;
  listCoverage(tenantId: string): Promise<CoverageEntry[]>;

  upsertAgent(a: Omit<AgentRecord, "id" | "tierUpdatedAt" | "humanBaselineMinutes" | "manualHourlyCostUsd"> & Partial<Pick<AgentRecord, "humanBaselineMinutes" | "manualHourlyCostUsd">>): Promise<AgentRecord>;
  /** Insert or touch model/workflowId/status when (tenantId, agentId) already exists (telemetry re-ingest). */
  registerOrRefreshAgent(a: Omit<AgentRecord, "id" | "tierUpdatedAt" | "humanBaselineMinutes" | "manualHourlyCostUsd"> & Partial<Pick<AgentRecord, "humanBaselineMinutes" | "manualHourlyCostUsd">>): Promise<AgentRecord>;
  getAgentById(agentId: string, tenantId: string): Promise<AgentRecord | undefined>;
  deleteAgent(agentId: string, tenantId: string): Promise<boolean>;
  listAgents(tenantId: string, probe?: TenantHealthProbe | null): Promise<{
    id: number;
    agentId: string;
    name: string;
    model: string | null;
    hyperscaler: string;
    trustTier: string;
    status: string;
    vendor: string | null;
    createdAt: string;
    runs: number;
    avgWallMs: string | null;
    cuow: number | null;
    mer: number | null;
    abt: number | null;
    ctr: number | null;
    tv: number | null;
    sigma: number | null;
    costPerRun: number;
    success: number;
    p95Latency: number;
    // Tenant-level deployment health (same for all agents of this tenant)
    lastCheckedAt: Date | null;
    isReachable: boolean | null;
    httpStatus: number | null;
    responseMs: number | null;
    activeAgents: number | null;
  }[]>;
  upsertTenantHealthProbe(tenantId: string, result: { isReachable: boolean; httpStatus: number | null; responseMs: number; activeAgents: number | null }): Promise<void>;
  latestTenantHealthProbe(tenantId: string): Promise<TenantHealthProbe | null>;
  setDeploymentHealthUrl(tenantId: string, url: string | null): Promise<void>;
  getTenant(tenantId: string): Promise<{ deploymentHealthUrl: string | null } | null>;

  publishUoP(u: InsertUoPLibraryEntry): Promise<UoPLibraryEntry>;
  listUoPLibrary(tenantId: string): Promise<UoPLibraryEntry[]>;
  getUoP(uopId: string): Promise<UoPLibraryEntry | undefined>;
  bumpUoPReuse(uopId: string): Promise<void>;

  insertDeployment(d: InsertAgentDeployment): Promise<AgentDeployment>;
  listDeployments(tenantId: string): Promise<AgentDeployment[]>;
  getDeployment(deploymentId: string): Promise<AgentDeployment | undefined>;
  setDeploymentStatus(deploymentId: string, status: string): Promise<AgentDeployment | undefined>;

  createApiKey(tenantId: string, label: string): Promise<string>;
  resolveTenantFromApiKey(rawKey: string): Promise<string | null>;
  revokeApiKey(id: number): Promise<void>;
}

/**
 * Parses the target trust tier from a recommendation rationale string.
 * Promotion rationale ends with "promote to <tier>."
 * Demotion rationale ends with "demotion to <tier>."
 */
function extractTargetTier(rationale: string, template: string): string | null {
  const tierSet = new Set<string>(TRUST_TIER_ORDER as readonly string[]);
  const marker = template === "trust_promotion" ? "promote to " : "demotion to ";
  const idx = rationale.lastIndexOf(marker);
  if (idx === -1) return null;
  const candidate = rationale.slice(idx + marker.length).replace(/\.$/, "").trim();
  return tierSet.has(candidate) ? candidate : null;
}

export class DatabaseStorage implements IStorage {

  // 1. Used during Login (finds user by username within a specific tenant)
  async getUserByUsernameAndTenant(username: string, tenantId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.username, username),
          eq(users.tenantId, tenantId)
        )
      );
    return user;
  }

  // 2. Used during Session Validation /me (verifies user still exists in tenant)
  async getUserById(id: number, tenantId: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, id),
          eq(users.tenantId, tenantId)
        )
      );
    return user;
  }

  async listActiveTenantIds(): Promise<string[]> {
    const rows = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));
    return rows.map((r) => r.id);
  }

  async getActiveTenantAgentIds(tenantId: string): Promise<string[]> {
    const rows = await db
      .select({ agentId: agentRegistry.agentId })
      .from(agentRegistry)
      .where(eq(agentRegistry.tenantId, tenantId));
    return rows.map((r) => r.agentId);
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug));
    return tenant;
  }

  async createTenant(insertTenant: InsertTenant): Promise<Tenant> {
    const [tenant] = await db
      .insert(tenants)
      .values(insertTenant)
      .returning();
    return tenant;
  }

  async getUser(id: number) {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row;
  }

  async getUserByUsername(username: string) {
    const [row] = await db.select().from(users).where(eq(users.username, username));
    return row;
  }

  async getUserByGlobalUsername(username: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.username, username));
    return row;
  }

  // async createUser(insertUser: InsertUser) {
  //   const [row] = await db.insert(users).values(insertUser).returning();
  //   return row;
  // }

  // In server/storage.ts
  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async appendCanonicalEvent(e: InsertCanonicalEvent) {
    const [row] = await db.insert(canonicalEvents).values(e).returning();
    return row;
  }

  async listCanonicalEvents(tenantId: string, limit = 200) {
    return db.select().from(canonicalEvents)
      .where(eq(canonicalEvents.tenantId, tenantId))
      .orderBy(desc(canonicalEvents.capturedAt))
      .limit(limit);
  }

  async listCanonicalEventsForAgents(tenantId: string, agentIds: string[], limit = 200) {
    if (agentIds.length === 0) return [];
    return db.select().from(canonicalEvents)
      .where(and(eq(canonicalEvents.tenantId, tenantId), inArray(canonicalEvents.agentId, agentIds)))
      .orderBy(desc(canonicalEvents.capturedAt))
      .limit(limit);
  }

  async lastEventHash(tenantId: string) {
    const [r] = await db.select().from(canonicalEvents)
      .where(eq(canonicalEvents.tenantId, tenantId))
      .orderBy(desc(canonicalEvents.id))
      .limit(1);
    return r?.auditHash;
  }

  async upsertLedgerRow(row: InsertLedgerRow) {
    const [existing] = await db.select().from(ledgerRows).where(eq(ledgerRows.decisionId, row.decisionId));
    if (existing) return existing;
    const [inserted] = await db.insert(ledgerRows).values(row).returning();
    return inserted;
  }

  async getLedgerRow(decisionId: string) {
    const [row] = await db.select().from(ledgerRows).where(eq(ledgerRows.decisionId, decisionId));
    return row;
  }

  async closeLedgerRow(decisionId: string, patch: Partial<LedgerRow>) {
    const [existing] = await db.select().from(ledgerRows).where(eq(ledgerRows.decisionId, decisionId));
    if (!existing) return undefined;
    const { id: _id, ...patchWithoutId } = patch;
    const [updated] = await db.update(ledgerRows)
      .set(patchWithoutId)
      .where(eq(ledgerRows.decisionId, decisionId))
      .returning();
    return updated;
  }

  async listLedger(tenantId: string, limit = 100) {
    return db.select().from(ledgerRows)
      .where(eq(ledgerRows.tenantId, tenantId))
      .orderBy(desc(ledgerRows.createdAt))
      .limit(limit);
  }

  async listLedgerForAgents(tenantId: string, agentIds: string[], limit = 100) {
    if (agentIds.length === 0) return [];
    return db.select().from(ledgerRows)
      .where(and(eq(ledgerRows.tenantId, tenantId), inArray(ledgerRows.agentId, agentIds)))
      .orderBy(desc(ledgerRows.createdAt))
      .limit(limit);
  }

  async insertSnapshot(s: Omit<EquationSnapshot, "id">) {
    const [row] = await db.insert(equationSnapshots).values(s).returning();
    return row;
  }

  async listSnapshots(tenantId: string, hours: number) {
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    return db.select().from(equationSnapshots)
      .where(and(eq(equationSnapshots.tenantId, tenantId), gte(equationSnapshots.computedAt, since)))
      .orderBy(equationSnapshots.computedAt);
  }

  async insertRec(r: InsertRecommendation) {
    const [row] = await db.insert(recommendations).values(r).returning();
    return row;
  }

  async listRecs(tenantId: string, status?: string) {
    if (status) {
      return db.select().from(recommendations)
        .where(and(eq(recommendations.tenantId, tenantId), eq(recommendations.status, status)))
        .orderBy(desc(recommendations.generatedAt));
    }
    return db.select().from(recommendations)
      .where(eq(recommendations.tenantId, tenantId))
      .orderBy(desc(recommendations.generatedAt));
  }

  async decideRec(recId: string, status: string, decidedBy: string) {
    const decidedAt = new Date().toISOString();
    const [row] = await db.update(recommendations)
      .set({ status, decidedAt, decidedBy })
      .where(eq(recommendations.recId, recId))
      .returning();
    if (!row) return undefined;
    // Execute trust tier change when a trust_promotion or trust_demotion is adopted.
    let prevTrustTier: string | null = null;
    let newTrustTier: string | null = null;

    if (
      status === "adopted" &&
      (row.template === "trust_promotion" || row.template === "trust_demotion") &&
      row.agentId
    ) {
      const targetTier = extractTargetTier(row.rationale, row.template);
      if (targetTier) {
        const agentRow = await db
          .select()
          .from(agentRegistry)
          .where(and(eq(agentRegistry.agentId, row.agentId), eq(agentRegistry.tenantId, row.tenantId)))
          .limit(1)
          .then((rows) => rows[0]);

        if (agentRow) {
          prevTrustTier = agentRow.trustTier;
          newTrustTier = targetTier;
          await db
            .update(agentRegistry)
            .set({ trustTier: targetTier, tierUpdatedAt: new Date() })
            .where(
              and(
                eq(agentRegistry.agentId, row.agentId),
                eq(agentRegistry.tenantId, row.tenantId),
              ),
            );
        }
      }
    }

    if (status === "adopted" || status === "rejected") {
      await this.insertGovernance({
        decisionId: `rec-${recId}-${Date.now().toString(36)}`,
        tenantId: row.tenantId,
        firedAt: decidedAt,
        policyId: status === "adopted" ? "RECOMMENDATION_ADOPT" : "RECOMMENDATION_REJECT",
        policyOutcome: status,
        rationale: row.rationale,
        prevTrustTier,
        newTrustTier,
        rerouteFromModel: null,
        rerouteToModel: null,
        subject: row.title,
        actor: decidedBy,
        relatedRecId: recId,
      });
    }
    return row;
  }

  async insertGovernance(g: Omit<GovernanceDecision, "id">) {
    const [row] = await db.insert(governanceDecisions).values(g).returning();
    return row;
  }

  async listGovernance(tenantId: string, limit = 50) {
    return db.select().from(governanceDecisions)
      .where(eq(governanceDecisions.tenantId, tenantId))
      .orderBy(desc(governanceDecisions.firedAt))
      .limit(limit);
  }

  async upsertCoverage(c: Omit<CoverageEntry, "id">) {
    const [existing] = await db.select().from(coverageManifest)
      .where(and(
        eq(coverageManifest.tenantId, c.tenantId),
        eq(coverageManifest.hyperscaler, c.hyperscaler),
        eq(coverageManifest.surface, c.surface),
      ));
    if (existing) {
      const [updated] = await db.update(coverageManifest)
        .set(c)
        .where(eq(coverageManifest.id, existing.id))
        .returning();
      return updated;
    }
    const [row] = await db.insert(coverageManifest).values(c).returning();
    return row;
  }

  async listCoverage(tenantId: string) {
    return db.select().from(coverageManifest).where(eq(coverageManifest.tenantId, tenantId));
  }

  /**
   * Telemetry re-ingest: insert or refresh model/workflowId/status for this tenant+agent.
   * Uses a manual upsert so it works before and after migration 0002; after 0002, the same
   * agent_id string may exist for different tenants (composite unique on tenant_id + agent_id).
   */
  async registerOrRefreshAgent(a: Omit<AgentRecord, "id" | "tierUpdatedAt" | "humanBaselineMinutes" | "manualHourlyCostUsd"> & Partial<Pick<AgentRecord, "humanBaselineMinutes" | "manualHourlyCostUsd">>) {
    const [existing] = await db
      .select()
      .from(agentRegistry)
      .where(and(eq(agentRegistry.agentId, a.agentId), eq(agentRegistry.tenantId, a.tenantId)));
    if (existing) {
      const [updated] = await db
        .update(agentRegistry)
        .set({
          model: a.model,
          workflowId: a.workflowId,
          status: a.status,
          trustTier: a.trustTier,
          name: a.name,
          hyperscaler: a.hyperscaler,
          vendor: a.vendor,
        })
        .where(eq(agentRegistry.id, existing.id))
        .returning();
      return updated!;
    }
    const [row] = await db.insert(agentRegistry).values(a).returning();
    return row;
  }

  async upsertAgent(a: Omit<AgentRecord, "id" | "tierUpdatedAt" | "humanBaselineMinutes" | "manualHourlyCostUsd"> & Partial<Pick<AgentRecord, "humanBaselineMinutes" | "manualHourlyCostUsd">>) {
    const [existing] = await db.select().from(agentRegistry)
      .where(and(eq(agentRegistry.agentId, a.agentId), eq(agentRegistry.tenantId, a.tenantId)));
    if (existing) {
      const [updated] = await db.update(agentRegistry)
        .set(a)
        .where(eq(agentRegistry.id, existing.id))
        .returning();
      return updated;
    }
    const [row] = await db.insert(agentRegistry).values(a).returning();
    return row;
  }

  async getAgentById(agentId: string, tenantId: string) {
    const [row] = await db.select().from(agentRegistry)
      .where(and(eq(agentRegistry.agentId, agentId), eq(agentRegistry.tenantId, tenantId)));
    return row;
  }

  async deleteAgent(agentId: string, tenantId: string): Promise<boolean> {
    const deleted = await db
      .delete(agentRegistry)
      .where(and(eq(agentRegistry.agentId, agentId), eq(agentRegistry.tenantId, tenantId)))
      .returning({ id: agentRegistry.id });
    return deleted.length > 0;
  }

  async listAgents(tenantId: string, probe?: TenantHealthProbe | null) {
    // Subquery to get the latest snapshot ID per agent (avoids double-counting in joins)
    const latestSnapshotSq = db
      .select({
        agentId: equationSnapshots.agentId,
        maxId: sql<number>`max(${equationSnapshots.id})`.as("max_id"),
      })
      .from(equationSnapshots)
      .where(eq(equationSnapshots.tenantId, tenantId))
      .groupBy(equationSnapshots.agentId)
      .as("latest_snapshot_sq");

    const rows = await db
      .select({
        // Base Registry Fields
        id: agentRegistry.id,
        tenantId: agentRegistry.tenantId,
        agentId: agentRegistry.agentId,
        name: agentRegistry.name,
        model: agentRegistry.model,
        hyperscaler: agentRegistry.hyperscaler,
        trustTier: agentRegistry.trustTier,
        status: agentRegistry.status,
        vendor: agentRegistry.vendor,
        createdAt: agentRegistry.createdAt,
        tierUpdatedAt: agentRegistry.tierUpdatedAt,
        // Aggregates from Canonical Events
        runs: count(canonicalEvents.id),
        avgWallMs: avg(canonicalEvents.wallMs),
        // Real Economic Metrics from Snapshots
        cuow: equationSnapshots.cuow,
        mer: equationSnapshots.mer,
        abt: equationSnapshots.abt,
        ctr: equationSnapshots.ctr,
        tv: equationSnapshots.tv,
        // Quality from Ledger
        sigma: max(ledgerRows.techVarianceSigma),
      })
      .from(agentRegistry)
      .leftJoin(
        canonicalEvents,
        and(
          eq(canonicalEvents.agentId, agentRegistry.agentId),
          eq(canonicalEvents.tenantId, agentRegistry.tenantId),
        ),
      )
      .leftJoin(
        ledgerRows,
        and(
          eq(ledgerRows.agentId, agentRegistry.agentId),
          eq(ledgerRows.tenantId, agentRegistry.tenantId),
        ),
      )
      .leftJoin(latestSnapshotSq, eq(latestSnapshotSq.agentId, agentRegistry.agentId))
      .leftJoin(equationSnapshots, eq(equationSnapshots.id, latestSnapshotSq.maxId))
      .where(eq(agentRegistry.tenantId, tenantId))
      .groupBy(
        agentRegistry.id,
        agentRegistry.tenantId,
        agentRegistry.hyperscaler,
        agentRegistry.trustTier,
        agentRegistry.status,
        agentRegistry.vendor,
        agentRegistry.createdAt,
        agentRegistry.tierUpdatedAt,
        equationSnapshots.id,
      );

    // Merge tenant-level probe into every agent row (same values for all)
    const lastCheckedAt = probe?.checkedAt ?? null;
    const isReachable = probe?.isReachable ?? null;
    const httpStatus = probe?.httpStatus ?? null;
    const responseMs = probe?.responseMs ?? null;
    const activeAgents = probe?.activeAgents ?? null;

    return rows.map((r) => ({
      ...r,
      costPerRun: r.cuow != null ? Number(r.cuow) : 0,
      success: r.mer != null ? Number(r.mer) : 0,
      sigma: r.sigma != null ? Number(r.sigma) : 0,
      p95Latency: r.avgWallMs != null ? Number(r.avgWallMs) : 400,
      runs: Number(r.runs),
      abt: Number(r.abt || 0),
      ctr: Number(r.ctr || 0),
      tv: Number(r.tv || 0),
      lastCheckedAt,
      isReachable,
      httpStatus,
      responseMs,
      activeAgents,
    }));
  }

  async upsertTenantHealthProbe(tenantId: string, result: { isReachable: boolean; httpStatus: number | null; responseMs: number; activeAgents: number | null }) {
    await db.insert(tenantHealthProbes).values({
      tenantId,
      isReachable: result.isReachable,
      httpStatus: result.httpStatus,
      responseMs: result.responseMs,
      activeAgents: result.activeAgents,
    });
  }

  async latestTenantHealthProbe(tenantId: string): Promise<TenantHealthProbe | null> {
    const [row] = await db
      .select()
      .from(tenantHealthProbes)
      .where(eq(tenantHealthProbes.tenantId, tenantId))
      .orderBy(desc(tenantHealthProbes.id))
      .limit(1);
    return row ?? null;
  }

  async setDeploymentHealthUrl(tenantId: string, url: string | null) {
    await db.update(tenants).set({ deploymentHealthUrl: url }).where(eq(tenants.id, tenantId));
  }

  async getTenant(tenantId: string): Promise<{ deploymentHealthUrl: string | null } | null> {
    const [row] = await db
      .select({ deploymentHealthUrl: tenants.deploymentHealthUrl })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    return row ?? null;
  }

  async publishUoP(u: InsertUoPLibraryEntry) {
    const [existing] = await db.select().from(uopLibrary).where(eq(uopLibrary.uopId, u.uopId));
    if (existing) {
      const [updated] = await db.update(uopLibrary)
        .set({ ...u, status: "published" })
        .where(eq(uopLibrary.id, existing.id))
        .returning();
      return updated;
    }
    const [row] = await db.insert(uopLibrary).values(u).returning();
    return row;
  }

  async listUoPLibrary(tenantId: string) {
    return db.select().from(uopLibrary)
      .where(eq(uopLibrary.tenantId, tenantId))
      .orderBy(desc(uopLibrary.publishedAt));
  }

  async getUoP(uopId: string) {
    const [row] = await db.select().from(uopLibrary).where(eq(uopLibrary.uopId, uopId));
    return row;
  }

  async bumpUoPReuse(uopId: string) {
    await db.update(uopLibrary)
      .set({ reuseCount: sql`${uopLibrary.reuseCount} + 1` })
      .where(eq(uopLibrary.uopId, uopId));
  }

  async insertDeployment(d: InsertAgentDeployment) {
    const [row] = await db.insert(agentDeployments).values(d).returning();
    return row;
  }

  async listDeployments(tenantId: string) {
    return db.select().from(agentDeployments)
      .where(eq(agentDeployments.tenantId, tenantId))
      .orderBy(desc(agentDeployments.publishedAt));
  }

  async getDeployment(deploymentId: string) {
    const [row] = await db.select().from(agentDeployments).where(eq(agentDeployments.deploymentId, deploymentId));
    return row;
  }

  async setDeploymentStatus(deploymentId: string, status: string) {
    const [row] = await db.update(agentDeployments)
      .set({ status })
      .where(eq(agentDeployments.deploymentId, deploymentId))
      .returning();
    return row;
  }

  async createApiKey(tenantId: string, label: string): Promise<string> {
    const rawKey = `ecl_${randomBytes(16).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey, "utf8").digest("hex");

    await db.insert(apiKeys).values({
      keyHash,
      tenantId,
      label,
    });

    return rawKey;
  }

  async resolveTenantFromApiKey(rawKey: string): Promise<string | null> {
    const keyHash = createHash("sha256").update(rawKey, "utf8").digest("hex");

    const [row] = await db
      .select({ tenantId: apiKeys.tenantId })
      .from(apiKeys)
      .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
      .limit(1);

    return row?.tenantId ?? null;
  }

  async revokeApiKey(id: number): Promise<void> {
    await db
      .update(apiKeys)
      .set({ revokedAt: sql<Date>`now()` })
      .where(eq(apiKeys.id, id));
  }
}

export const storage = new DatabaseStorage();
