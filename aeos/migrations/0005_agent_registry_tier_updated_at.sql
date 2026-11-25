-- Add tier_updated_at column to agent_registry for the 30-day cool-down rule.
ALTER TABLE "agent_registry" ADD COLUMN "tier_updated_at" timestamp DEFAULT now() NOT NULL;
