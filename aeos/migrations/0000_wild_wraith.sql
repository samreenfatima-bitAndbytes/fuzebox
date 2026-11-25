CREATE TABLE "agent_deployments" (
	"id" serial PRIMARY KEY NOT NULL,
	"deployment_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"code_language" text NOT NULL,
	"agent_kind" text DEFAULT 'agent' NOT NULL,
	"classification" text DEFAULT 'AI-Primary' NOT NULL,
	"trust_tier" text DEFAULT 'T2_supervised' NOT NULL,
	"rop_target" double precision DEFAULT 3 NOT NULL,
	"recursive_depth" integer DEFAULT 2 NOT NULL,
	"reuse_from_uop" text,
	"raw_code" text NOT NULL,
	"manifest_json" text NOT NULL,
	"uop_instructions" text NOT NULL,
	"validation_status" text DEFAULT 'valid' NOT NULL,
	"validation_notes" text,
	"status" text DEFAULT 'deployed' NOT NULL,
	"signature" text NOT NULL,
	"published_at" text NOT NULL,
	"published_by" text NOT NULL,
	CONSTRAINT "agent_deployments_deployment_id_unique" UNIQUE("deployment_id")
);
--> statement-breakpoint
CREATE TABLE "agent_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"hyperscaler" text NOT NULL,
	"model" text,
	"trust_tier" text DEFAULT 'T2_supervised' NOT NULL,
	"vendor" text,
	"workflow_id" text,
	"status" text DEFAULT 'green' NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "agent_registry_agent_id_unique" UNIQUE("agent_id")
);
--> statement-breakpoint
CREATE TABLE "canonical_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"schema_version" text DEFAULT 'fbx-canonical-v1.0' NOT NULL,
	"captured_at" text NOT NULL,
	"tenant_id" text NOT NULL,
	"workspace_id" text,
	"decision_id" text NOT NULL,
	"hyperscaler" text NOT NULL,
	"endpoint" text NOT NULL,
	"transport" text NOT NULL,
	"vendor_request_id" text,
	"captured_via" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_kind" text NOT NULL,
	"model" text,
	"human_user_id" text,
	"parent_agent_id" text,
	"workflow_id" text,
	"skill" text,
	"skill_version" text,
	"trigger" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"tool_calls_json" text,
	"wall_ms" integer DEFAULT 0 NOT NULL,
	"vendor_cost_usd" double precision DEFAULT 0 NOT NULL,
	"amortized_cost_usd" double precision DEFAULT 0 NOT NULL,
	"passed_thresholds" boolean DEFAULT true NOT NULL,
	"confidence" double precision,
	"human_review" text DEFAULT 'auto',
	"rework_minutes" double precision DEFAULT 0,
	"ledger_account" text,
	"cost_center" text,
	"human_baseline_minutes" double precision,
	"manual_hourly_cost_usd" double precision,
	"labor_value_saved_usd" double precision DEFAULT 0,
	"uop_id" text,
	"rop_value" double precision,
	"cuow_value" double precision,
	"mer_value" double precision,
	"policy_id" text,
	"policy_outcome" text,
	"trust_tier" text DEFAULT 'T2_supervised',
	"audit_hash" text NOT NULL,
	"prev_event_hash" text,
	"raw_payload_ref" text,
	CONSTRAINT "canonical_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "coverage_manifest" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"hyperscaler" text NOT NULL,
	"surface" text NOT NULL,
	"status" text NOT NULL,
	"activated_at" text,
	"last_telemetry_at" text,
	"signed_at" text,
	"signature" text
);
--> statement-breakpoint
CREATE TABLE "equation_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"workflow_id" text,
	"agent_id" text,
	"computed_at" text NOT NULL,
	"window_seconds" integer DEFAULT 3600 NOT NULL,
	"cuow" double precision,
	"abt" double precision,
	"mer" double precision,
	"ctr" double precision,
	"tv" double precision,
	"rop" double precision,
	"tuop" double precision,
	"huop" double precision,
	"auop" double precision,
	"synergy_s" double precision,
	"task_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "governance_decisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"decision_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"fired_at" text NOT NULL,
	"policy_id" text NOT NULL,
	"policy_outcome" text NOT NULL,
	"rationale" text,
	"prev_trust_tier" text,
	"new_trust_tier" text,
	"reroute_from_model" text,
	"reroute_to_model" text
);
--> statement-breakpoint
CREATE TABLE "ledger_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"decision_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"workflow_id" text,
	"skill_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text NOT NULL,
	"closed_at" text,
	"predicted_cost_usd" double precision NOT NULL,
	"predicted_outcome_usd" double precision NOT NULL,
	"predicted_signature" text NOT NULL,
	"predicted_signed_at" text NOT NULL,
	"uef_capability_fit" double precision,
	"uef_gsti_score" double precision,
	"uef_gsti_classification" text,
	"uef_uop_value" double precision,
	"uef_coordination_tax" double precision,
	"uef_governance_score" double precision,
	"uef_runtime_fit" double precision,
	"uef_economic_value" double precision,
	"uef_risk_penalty" double precision,
	"stale_signal_flag" boolean DEFAULT false,
	"actual_cost_usd" double precision,
	"actual_outcome_usd" double precision,
	"actual_source_sor" text,
	"fuzebox_sig" text,
	"rpotential_sig" text,
	"cosign_status" text DEFAULT 'pending',
	"tech_variance_sigma" double precision,
	"tech_error_rate" double precision,
	"econ_win_rate_delta" double precision,
	"econ_cost_delta" double precision,
	"attribution_bucket" text,
	"attribution_confidence" double precision,
	"correction_type" text,
	"correction_ref" text,
	"correction_applied_at" text,
	"row_hash" text NOT NULL,
	"prev_row_hash" text,
	CONSTRAINT "ledger_rows_decision_id_unique" UNIQUE("decision_id")
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"rec_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"generated_at" text NOT NULL,
	"template" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"rationale" text NOT NULL,
	"agent_id" text,
	"workflow_id" text,
	"predicted_delta_usd" double precision,
	"confidence" double precision,
	"status" text DEFAULT 'new' NOT NULL,
	"decided_at" text,
	"decided_by" text,
	CONSTRAINT "recommendations_rec_id_unique" UNIQUE("rec_id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'starter' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "uop_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"uop_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"workflow_id" text,
	"agent_id" text,
	"published_at" text NOT NULL,
	"published_by" text NOT NULL,
	"classification" text NOT NULL,
	"description" text,
	"labor_value_saved_usd" double precision NOT NULL,
	"amortized_cost_usd" double precision NOT NULL,
	"rop_value" double precision NOT NULL,
	"cuow" double precision NOT NULL,
	"mer" double precision NOT NULL,
	"huop_share" double precision,
	"auop_share" double precision,
	"synergy_share" double precision,
	"trust_tier" text NOT NULL,
	"signature" text NOT NULL,
	"status" text DEFAULT 'published' NOT NULL,
	"reuse_count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "uop_library_uop_id_unique" UNIQUE("uop_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_registry" ADD CONSTRAINT "agent_registry_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_events" ADD CONSTRAINT "canonical_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coverage_manifest" ADD CONSTRAINT "coverage_manifest_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equation_snapshots" ADD CONSTRAINT "equation_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "governance_decisions" ADD CONSTRAINT "governance_decisions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_rows" ADD CONSTRAINT "ledger_rows_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uop_library" ADD CONSTRAINT "uop_library_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_deployments_tenant_id_idx" ON "agent_deployments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "agent_deployments_tenant_status_idx" ON "agent_deployments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "agent_registry_tenant_id_idx" ON "agent_registry" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "agent_registry_tenant_status_idx" ON "agent_registry" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "canonical_events_tenant_id_idx" ON "canonical_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "canonical_events_tenant_captured_at_idx" ON "canonical_events" USING btree ("tenant_id","captured_at");--> statement-breakpoint
CREATE INDEX "coverage_manifest_tenant_id_idx" ON "coverage_manifest" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coverage_manifest_tenant_hyperscaler_surface_uniq" ON "coverage_manifest" USING btree ("tenant_id","hyperscaler","surface");--> statement-breakpoint
CREATE INDEX "equation_snapshots_tenant_id_idx" ON "equation_snapshots" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "equation_snapshots_tenant_computed_at_idx" ON "equation_snapshots" USING btree ("tenant_id","computed_at");--> statement-breakpoint
CREATE INDEX "governance_decisions_tenant_id_idx" ON "governance_decisions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "governance_decisions_tenant_fired_at_idx" ON "governance_decisions" USING btree ("tenant_id","fired_at");--> statement-breakpoint
CREATE INDEX "ledger_rows_tenant_id_idx" ON "ledger_rows" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "ledger_rows_tenant_status_idx" ON "ledger_rows" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "recommendations_tenant_id_idx" ON "recommendations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "recommendations_tenant_status_idx" ON "recommendations" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "uop_library_tenant_id_idx" ON "uop_library" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "uop_library_tenant_status_idx" ON "uop_library" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_tenant_username_uniq" ON "users" USING btree ("tenant_id","username");--> statement-breakpoint
CREATE INDEX "users_tenant_id_idx" ON "users" USING btree ("tenant_id");