/** T0–T4 trust ladder (Patent Family 5). Levels align with `agents.trust_level` in the API. */

export const TRUST_LADDER = [
  {
    level: 0,
    code: "T0",
    title: "Unverified",
    blurb: "no telemetry; observe-only",
  },
  {
    level: 1,
    code: "T1",
    title: "Observed",
    blurb: "events captured; no autonomy",
  },
  {
    level: 2,
    code: "T2",
    title: "Supervised",
    blurb: "human-gated decisions",
  },
  {
    level: 3,
    code: "T3",
    title: "Trusted",
    blurb: "autonomous within budget",
  },
  {
    level: 4,
    code: "T4",
    title: "Autonomous",
    blurb: "delegated full envelope",
  },
] as const;

export type RosterHealth = "green" | "amber" | "red";

export function normalizeTrustLevel(level: number): number {
  return Math.max(0, Math.min(4, Math.floor(level || 0)));
}

/** Display label, e.g. `T1 · observed` */
export function trustTierDisplay(level: number): string {
  const n = normalizeTrustLevel(level);
  const row = TRUST_LADDER[n];
  return `${row.code} · ${row.title.toLowerCase()}`;
}

/** Parse API `trustTier` strings (`T1_observed`, etc.) to a level. */
export function trustLevelFromTierString(tier: string): number | null {
  const m = tier.match(/T(\d)/i);
  if (!m) return null;
  return normalizeTrustLevel(parseInt(m[1], 10));
}

/** Human label from enriched API `trustTier` (`T1_observed`) or numeric level. */
export function formatTrustTierFromApi(
  tier: string | undefined,
  trustLevel: number,
): string {
  if (tier?.includes("·")) return tier;
  const parsed = tier ? trustLevelFromTierString(tier) : null;
  return trustTierDisplay(parsed ?? trustLevel);
}

export function sigmaFromSuccessRate(
  rate: number | undefined,
  totalRuns = 0,
): string {
  if (totalRuns <= 0) return "—";
  const r =
    rate == null || Number.isNaN(rate)
      ? 0
      : rate > 1
        ? rate / 100
        : rate;
  const clamped = Math.max(0, Math.min(1, r));
  return `${(clamped * 4.1).toFixed(1)}Σ`;
}

export function rosterHealthFromAgent(
  status: string,
  successRate: number | undefined,
  totalRuns: number,
): RosterHealth {
  const s = status.toLowerCase();
  if (s === "inactive" || s === "disabled" || s === "error") return "red";
  if (totalRuns === 0) return "amber";
  const rate = successRate == null ? 1 : successRate > 1 ? successRate / 100 : successRate;
  if (rate < 0.7) return "red";
  if (rate < 0.9) return "amber";
  return "green";
}

export function rosterStatusLabel(
  registryStatus: string,
  totalRuns: number,
  successRatePct: number | null,
): string {
  const s = registryStatus.toLowerCase();
  if (s === "inactive" || s === "disabled" || s === "error") return "INACTIVE";
  if (totalRuns <= 0) return "NO DATA";
  const pct = successRatePct ?? 0;
  if (pct >= 90) return "PASSING";
  if (pct >= 70) return "WATCH";
  return "FAILING";
}

export function rosterHealthLabel(health: RosterHealth, totalRuns = 0): string {
  if (totalRuns <= 0 && health === "amber") return "NO DATA";
  return health.toUpperCase();
}
