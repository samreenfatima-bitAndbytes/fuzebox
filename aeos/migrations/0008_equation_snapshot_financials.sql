-- Add financial totals to equation_snapshots so the dashboard can use
-- one authoritative source for all economic KPIs (active-epoch window only).
ALTER TABLE "equation_snapshots"
  ADD COLUMN IF NOT EXISTS "labor_value_saved_usd" double precision,
  ADD COLUMN IF NOT EXISTS "amortized_cost_usd"    double precision,
  ADD COLUMN IF NOT EXISTS "net_savings_usd"        double precision,
  ADD COLUMN IF NOT EXISTS "weekly_run_rate_usd"    double precision;
