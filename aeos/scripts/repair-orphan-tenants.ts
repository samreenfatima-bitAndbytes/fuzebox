/**
 * Insert stub rows into `tenants` for any `tenant_id` referenced by app tables
 * but missing from `tenants`. Fixes FK violations that block `drizzle-kit push`.
 *
 * Run: DATABASE_URL=postgresql://... npm run db:repair-tenants
 */
import postgres from "postgres";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = postgres(process.env.DATABASE_URL);

  try {
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO tenants (id, slug, name, plan, status, created_at)
      SELECT DISTINCT x.tenant_id,
        'stub-' || md5(x.tenant_id),
        'Recovered tenant (FK repair)',
        'starter',
        'active',
        to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      FROM (
        SELECT tenant_id FROM coverage_manifest
        UNION SELECT tenant_id FROM agent_registry
        UNION SELECT tenant_id FROM agent_deployments
        UNION SELECT tenant_id FROM canonical_events
        UNION SELECT tenant_id FROM ledger_rows
        UNION SELECT tenant_id FROM equation_snapshots
        UNION SELECT tenant_id FROM governance_decisions
        UNION SELECT tenant_id FROM recommendations
        UNION SELECT tenant_id FROM uop_library
        UNION SELECT tenant_id FROM users
      ) x
      WHERE x.tenant_id IS NOT NULL
        AND trim(x.tenant_id) <> ''
        AND NOT EXISTS (SELECT 1 FROM tenants t WHERE t.id = x.tenant_id)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;
    console.log(`Inserted ${inserted.length} stub tenant(s):`, inserted.map((r) => r.id).join(", ") || "(none needed)");
    console.log("You can run npm run db:push again.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main();
