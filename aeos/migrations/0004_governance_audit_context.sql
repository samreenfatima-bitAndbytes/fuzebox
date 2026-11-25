ALTER TABLE "governance_decisions" ADD COLUMN IF NOT EXISTS "subject" text;--> statement-breakpoint
ALTER TABLE "governance_decisions" ADD COLUMN IF NOT EXISTS "actor" text;--> statement-breakpoint
ALTER TABLE "governance_decisions" ADD COLUMN IF NOT EXISTS "related_rec_id" text;
