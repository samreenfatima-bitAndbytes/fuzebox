import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import type { QualityKpis } from "@/lib/types";

export function QualityKpiGrid({
  kpis,
  days,
}: {
  kpis: QualityKpis;
  days: number;
}) {
  const items: { label: string; value: string; sub?: string }[] = [
    {
      label: "Total Tasks",
      value: String(kpis.total),
      sub: `last ${days} days`,
    },
    {
      label: "Completed",
      value: String(kpis.completed),
      sub: `${kpis.completed_pct}% success`,
    },
    {
      label: "Failed",
      value: String(kpis.failed),
      sub: `${kpis.failed_pct}% of runs`,
    },
    { label: "Running", value: String(kpis.running), sub: "currently in-flight" },
    {
      label: "Time Saved",
      value: `${kpis.time_saved_hours}h`,
      sub: "estimated",
    },
    {
      label: "Avg GSTI",
      value: String(kpis.avg_gsti),
      sub: "trust index, agent fleet",
    },
  ];

  return (
    <KpiGrid className="sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {items.map((item) => (
        <KpiCard key={item.label} {...item} />
      ))}
    </KpiGrid>
  );
}
