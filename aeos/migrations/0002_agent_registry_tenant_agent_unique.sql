ALTER TABLE "agent_registry" DROP CONSTRAINT IF EXISTS "agent_registry_agent_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agent_registry_tenant_agent_unique" ON "agent_registry" USING btree ("tenant_id","agent_id");
