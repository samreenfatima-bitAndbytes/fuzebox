/** Decimal places for USD — extends precision when cents would round to $0.00. */
export function usdDecimalPlaces(n: number): number {
  const abs = Math.abs(n);
  if (!Number.isFinite(abs) || abs === 0) return 2;
  if (abs >= 10) return 0;
  if (abs >= 0.01) return 2;
  // Show at least two non-zero fractional digits (e.g. $0.000084, not $0.00).
  return Math.min(8, Math.max(2, Math.ceil(-Math.log10(abs)) + 1));
}

export const usd = (n: number | null | undefined, opts: { sign?: boolean; decimals?: number } = {}) => {
  if (n == null || isNaN(n)) return "—";
  const decimals = opts.decimals ?? usdDecimalPlaces(n);
  const v = n.toLocaleString("en-US", { style: "currency", currency: "USD",
    minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return opts.sign && n > 0 ? `+${v}` : v;
};
export const num = (n: number | null | undefined, decimals = 2) =>
  n == null || isNaN(n) ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
export const pct = (n: number | null | undefined, decimals = 0) =>
  n == null || isNaN(n) ? "—" : `${(n * 100).toFixed(decimals)}%`;
export const sigma = (n: number | null | undefined) =>
  n == null || isNaN(n) ? "—" : `${n.toFixed(1)}σ`;

export const ago = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};
