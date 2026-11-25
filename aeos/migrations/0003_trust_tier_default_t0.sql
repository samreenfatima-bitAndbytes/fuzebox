ALTER TABLE "agent_registry" ALTER COLUMN "trust_tier" SET DEFAULT 'T0_unverified';--> statement-breakpoint
ALTER TABLE "agent_deployments" ALTER COLUMN "trust_tier" SET DEFAULT 'T0_unverified';--> statement-breakpoint
ALTER TABLE "canonical_events" ALTER COLUMN "trust_tier" SET DEFAULT 'T0_unverified';
