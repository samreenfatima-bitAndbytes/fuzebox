import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import type { ObservationKpis } from "@/lib/types";

type ObsKpiItem = {
  label: string;
  value: string;
  sub: string;
};

export function ObservationKpiGrid({ kpis }: { kpis: ObservationKpis }) {
  const queuedPct =
    kpis.total_events > 0
      ? Math.round((kpis.human_review_queued / kpis.total_events) * 1000) / 10
      : 0;

  const row1: ObsKpiItem[] = [
    {
      label: "Observed Events",
      value: kpis.total_events.toLocaleString(),
      sub: "events / hour throughput",
    },
    {
      label: "Active Surfaces",
      value: String(kpis.active_surfaces),
      sub: "capture rate — 0 gaps",
    },
    {
      label: "Threshold Pass Rate",
      value: `${kpis.pass_rate_pct}%`,
      sub: `${kpis.passed_count.toLocaleString()} / ${kpis.total_events.toLocaleString()} passed · ${kpis.human_review_queued} queued for review`,
    },
    {
      label: "Amortized Spend",
      value: `$${kpis.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      sub: `${kpis.total_tokens.toLocaleString()} tokens · $${kpis.total_saved.toLocaleString(undefined, { minimumFractionDigits: 2 })} value saved`,
    },
  ];

  const row2: ObsKpiItem[] = [
    {
      label: "Avg Latency",
      value: `${Math.round(kpis.p50_latency_ms ?? kpis.avg_latency_ms)} ms`,
      sub: "p50 wall-clock per canonical event",
    },
    {
      label: "Avg Tokens / Event",
      value: kpis.avg_tokens.toLocaleString(),
      sub: "input + output tokens metered",
    },
    {
      label: "Avg Cost / Event",
      value: `$${kpis.avg_cost.toFixed(4)}`,
      sub: "amortized vendor + 15% governance",
    },
    {
      label: "Human Review Queued",
      value: String(kpis.human_review_queued),
      sub: `${queuedPct}% of stream · drives CTR`,
    },
  ];

  return (
    <div className="space-y-3">
      <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
        {row1.map((item) => (
          <KpiCard key={item.label} {...item} size="lg" />
        ))}
      </KpiGrid>
      <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
        {row2.map((item) => (
          <KpiCard key={item.label} {...item} size="lg" />
        ))}
      </KpiGrid>
    </div>
  );
}
