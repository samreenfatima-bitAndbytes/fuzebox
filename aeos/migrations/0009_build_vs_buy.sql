CREATE TABLE "build_vs_buy_comparisons" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"process" text NOT NULL,
	"build_cost_usd" double precision NOT NULL,
	"build_timeline" text NOT NULL,
	"build_risk" text NOT NULL,
	"build_control" text NOT NULL,
	"buy_cost_usd" double precision NOT NULL,
	"buy_timeline" text NOT NULL,
	"buy_risk" text NOT NULL,
	"buy_control" text NOT NULL,
	"recommendation" text NOT NULL,
	"rationale" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "build_vs_buy_comparisons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "build_vs_buy_comparisons_tenant_process_uniq" ON "build_vs_buy_comparisons" USING btree ("tenant_id","process");
--> statement-breakpoint
CREATE INDEX "build_vs_buy_comparisons_tenant_id_idx" ON "build_vs_buy_comparisons" USING btree ("tenant_id");
--> statement-breakpoint
CREATE TABLE "build_vs_buy_matrices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"factors" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "build_vs_buy_matrices_tenant_id_unique" UNIQUE("tenant_id"),
	CONSTRAINT "build_vs_buy_matrices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
);
