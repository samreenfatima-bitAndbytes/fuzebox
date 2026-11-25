ALTER TABLE "agent_registry"
  DROP COLUMN IF EXISTS "deleted_at",
  DROP COLUMN IF EXISTS "registration_epoch",
  DROP COLUMN IF EXISTS "epoch_started_at";

DROP INDEX IF EXISTS "agent_registry_tenant_active_idx";
