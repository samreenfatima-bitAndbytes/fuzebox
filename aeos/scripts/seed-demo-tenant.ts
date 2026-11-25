import "dotenv/config";
import { seedIfEmpty } from "../server/cognition";

const tenantId = process.argv[2];
if (!tenantId) {
  console.error("Usage: tsx scripts/seed-demo-tenant.ts <tenantId>");
  process.exit(1);
}

console.log(`Seeding demo data for tenant ${tenantId}...`);
await seedIfEmpty(tenantId);
console.log("Done.");
process.exit(0);
