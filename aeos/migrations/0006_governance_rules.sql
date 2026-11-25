-- Governance Rules table: per-tenant Rules & Compliance toggle configuration.
-- task_type is a loose VARCHAR (no enum) to support dynamic workforce task names.
CREATE TABLE "governance_rules" (
  "id"                 text PRIMARY KEY,
  "tenant_id"          text NOT NULL REFERENCES "tenants"("id"),
  "name"               text NOT NULL,
  "description"        text NOT NULL,
  "task_type"          text NOT NULL,
  "enforcement_action" text NOT NULL,
  "is_active"          boolean NOT NULL DEFAULT true,
  "reference_code"     text,
  "created_at"         timestamp NOT NULL DEFAULT now(),
  "updated_at"         timestamp NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX "governance_rules_tenant_id_idx" ON "governance_rules" ("tenant_id");--> statement-breakpoint
CREATE INDEX "governance_rules_tenant_task_type_idx" ON "governance_rules" ("tenant_id", "task_type");
