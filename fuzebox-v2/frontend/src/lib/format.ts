/** Client-side display formatting — prefer raw API fields over backend *_label values. */

export function daysToTimeRangeLabel(days: number | null | undefined): string {
  if (days == null || days <= 0) return "All time";
  if (days === 7) return "Last 7 days";
  if (days === 14) return "Last 14 days";
  if (days === 30) return "Last 30 days";
  return `Last ${days} days`;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

export function formatRunStartedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatStudioStartedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min} UTC`;
}

export function formatScenarioUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

export function formatSigma(sigma: number): string {
  return `${sigma.toFixed(1)}σ`;
}

export function formatAvgSigma(avg: number): string {
  return `${avg.toFixed(1)}σ avg`;
}

export function shortSignature(text: string, keep = 12): string {
  if (!text) return "—";
  return text.length > keep ? `${text.slice(0, keep)}…` : text;
}

export function tunedPillLabel(isV2Tuned: boolean): string {
  return isV2Tuned ? "Tuned" : "Untuned";
}

export function formatCognitionSnapshot(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${m}-${day}T${h}:${min}`;
}
