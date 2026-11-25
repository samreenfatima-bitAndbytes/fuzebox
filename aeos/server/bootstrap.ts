import { randomUUID } from "node:crypto";
import { storage } from "./storage";
import { hashPassword } from "./auth";
import { seedIfEmpty } from "./cognition";

const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "changeme";
const DEFAULT_TENANT_SLUG = "default";
const DEFAULT_TENANT_NAME = "Default Workspace";

/**
 * First-run bootstrap: makes sure a default workspace and admin account exist so a
 * fresh clone can sign in without registering (mirrors fuzebox-v2's bootstrap admin).
 *
 * Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD and default to
 * admin / changeme. In production nothing is created unless ADMIN_PASSWORD is set
 * explicitly, so the well-known default password never reaches a deployed instance.
 * An existing user with that username is left untouched.
 *
 * Outside production the new workspace is also filled with the synthetic demo dataset
 * (agents, ledger, events, recommendations) so the dashboards are not empty. Set
 * SEED_DEMO_DATA=false to skip that.
 */
export async function bootstrapDefaultAdmin(log: (message: string, source?: string) => void) {
  const isProduction = process.env.NODE_ENV === "production";
  const username = process.env.ADMIN_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD || (isProduction ? "" : DEFAULT_ADMIN_PASSWORD);

  if (!password) {
    log("ADMIN_PASSWORD not set; skipping default admin bootstrap in production", "auth");
    return;
  }

  try {
    const existingUser = await storage.getUserByGlobalUsername(username);
    if (existingUser) return;

    const tenant =
      (await storage.getTenantBySlug(DEFAULT_TENANT_SLUG)) ??
      (await storage.createTenant({
        id: randomUUID(),
        name: DEFAULT_TENANT_NAME,
        slug: DEFAULT_TENANT_SLUG,
        plan: "starter",
        status: "active",
        createdAt: new Date().toISOString(),
      }));

    await storage.createUser({
      tenantId: tenant.id,
      username,
      passwordHash: await hashPassword(password),
    });

    log(`first run: created account "${username}" in workspace "${tenant.name}"`, "auth");
    if (password === DEFAULT_ADMIN_PASSWORD) {
      log(`default password "${DEFAULT_ADMIN_PASSWORD}" in use; local development only`, "auth");
    }

    if (!isProduction && process.env.SEED_DEMO_DATA !== "false") {
      // Not awaited: seeding takes a while and must not delay server startup.
      seedIfEmpty(tenant.id)
        .then(() => log(`demo data seeded for workspace "${tenant.name}"`, "seed"))
        .catch((err) => log(`demo data seed failed: ${err}`, "seed"));
    }
  } catch (err) {
    // Most likely the schema has not been pushed yet (npm run db:push).
    log(`default admin bootstrap failed: ${err}`, "auth");
  }
}
