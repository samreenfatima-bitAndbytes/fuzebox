CREATE TABLE IF NOT EXISTS "fmea_items" (
  "id"                text PRIMARY KEY,
  "tenant_id"         text NOT NULL REFERENCES "tenants"("id"),
  "agent_registry_id" integer REFERENCES "agent_registry"("id"),
  "process_scope"     text NOT NULL,
  "failure_mode"      text NOT NULL,
  "effect"            text NOT NULL,
  "root_cause"        text NOT NULL,
  "mitigation"        text NOT NULL,
  "severity"          integer NOT NULL,
  "occurrence"        integer NOT NULL,
  "detection"         integer NOT NULL,
  "status"            text NOT NULL DEFAULT 'OPEN',
  "owner"             text NOT NULL,
  "created_at"        timestamp NOT NULL DEFAULT now(),
  "updated_at"        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "fmea_items_tenant_id_idx"         ON "fmea_items" ("tenant_id");
CREATE INDEX IF NOT EXISTS "fmea_items_tenant_status_idx"     ON "fmea_items" ("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "fmea_items_agent_registry_id_idx" ON "fmea_items" ("agent_registry_id");
