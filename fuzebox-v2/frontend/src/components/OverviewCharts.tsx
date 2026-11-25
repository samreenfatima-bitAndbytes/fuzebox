"use client";

import type { ChartData, ChartOptions } from "chart.js";
import Link from "next/link";
import { Chart } from "react-chartjs-2";
import {
  ChartBox,
  datalabelsEnd,
  formatAxisDate,
  useChartJsTheme,
} from "@/components/charts/ChartJsTheme";
import { useChartTheme } from "@/hooks/useChartTheme";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { PageSection } from "@/components/ui/PageSection";
import { ChartGuideAside } from "@/components/charts/ChartGuideAside";
import { ChartLegendRow } from "@/components/charts/ChartLegendRow";
import {
  emphasizeBarColor,
  SCORE_SCALE,
  scoreGradientColor,
} from "@/lib/chart-colors";
import type { LeaderboardRow, OverviewSummary } from "@/lib/types";

function chartAxisTitle(text: string, tickColor?: string) {
  return {
    display: true as const,
    text,
    color: tickColor,
    font: { size: 12, weight: "bold" as const },
  };
}

export function LeaderboardHowToRead() {
  return (
    <ChartGuideAside
      title="How to read this"
      lead="Use it to spot best/worst performers quickly."
    >
      <li>
        <strong className="font-medium text-brand-ink">Score</strong> blends
        success, quality, latency, and cost.
      </li>
      <li>
        Switch the <strong className="font-medium text-brand-ink">time range</strong>{" "}
        to see trend effects.
      </li>
      <li>
        Open{" "}
        <Link href="/performance?tab=leaderboard" className="font-medium text-brand-primary hover:underline">
          Performance → Leaderboard
        </Link>{" "}
        for the full ranked table — click a row to open Observation Plane.
      </li>
    </ChartGuideAside>
  );
}

export function OverviewKpiGrid({ kpis }: { kpis: OverviewSummary["kpis"] }) {
  const exec = [
    { label: "Total tasks", value: kpis.total_tasks.toLocaleString() },
    { label: "Success rate", value: `${(kpis.success_rate * 100).toFixed(1)}%` },
    { label: "Avg quality", value: kpis.avg_quality.toFixed(2) },
    { label: "Avg latency", value: `${kpis.avg_latency_ms.toLocaleString()} ms` },
    { label: "Total cost", value: `$${kpis.total_cost.toFixed(2)}` },
    { label: "Active agents", value: String(kpis.active_agents) },
  ];
  const ops = [
    { label: "Workflows", value: kpis.total_workflows.toLocaleString() },
    {
      label: "Workflow success",
      value: `${(kpis.workflow_success_rate * 100).toFixed(1)}%`,
    },
    { label: "P90 latency", value: `${kpis.p90_latency_ms.toLocaleString()} ms` },
    { label: "Avg cost / task", value: `$${kpis.avg_cost_per_task.toFixed(4)}` },
  ];

  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)]">
      <PageSection
        unstyled
        className="min-w-0"
        title="Executive snapshot"
        subtitle="The six numbers you check first."
      >
        <KpiGrid className="sm:grid-cols-2 xl:grid-cols-3">
          {exec.map((m) => (
            <KpiCard key={m.label} label={m.label} value={m.value} />
          ))}
        </KpiGrid>
      </PageSection>
      <PageSection
        unstyled
        className="min-w-0"
        title="Ops signals"
        subtitle="Workflow health, tail latency, and unit cost."
      >
        <KpiGrid className="grid-cols-2 xl:grid-cols-1 min-[1440px]:grid-cols-2">
          {ops.map((m) => (
            <KpiCard key={m.label} label={m.label} value={m.value} />
          ))}
        </KpiGrid>
      </PageSection>
    </div>
  );
}

export function CostTrendChart({
  points,
}: {
  points: OverviewSummary["cost_time_series"];
}) {
  const { colors, areaPrimary } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();
  const tickColor =
    typeof linearY.ticks?.color === "string" ? linearY.ticks.color : undefined;

  if (!points.length) {
    return (
      <EmptyState message="No cost data for this period." size="chart" />
    );
  }

  const labels = points.map((p) => formatAxisDate(p.date));

  const data: ChartData<"line"> = {
    labels,
    datasets: [
      {
        type: "line",
        label: "Daily cost",
        data: points.map((p) => p.total_cost_usd),
        borderColor: colors.primary,
        backgroundColor: areaPrimary,
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 6,
        pointHitRadius: 12,
        pointHoverBorderWidth: 2,
        pointHoverBorderColor: colors.primary,
        pointHoverBackgroundColor: colors.primary,
        yAxisID: "y",
      },
      {
        type: "line",
        label: "Cumulative",
        data: points.map((p) => p.cumulative_cost_usd),
        borderColor: colors.rose,
        backgroundColor: "transparent",
        borderDash: [4, 4],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHitRadius: 12,
        tension: 0.3,
        yAxisID: "y1",
      },
    ],
  };

  const options = mergeOptions({
    scales: {
      x: {
        ...categoryX,
        title: chartAxisTitle("Date", tickColor),
      },
      y: {
        ...linearY,
        position: "left",
        title: chartAxisTitle("Daily cost ($)", tickColor),
        ticks: {
          ...linearY.ticks,
          callback: (v) => `$${Number(v).toFixed(2)}`,
        },
      },
      y1: {
        ...linearY,
        position: "right",
        grid: { drawOnChartArea: false },
        title: chartAxisTitle("Cumulative total ($)", tickColor),
        ticks: {
          ...linearY.ticks,
          callback: (v) => `$${Number(v).toFixed(2)}`,
        },
      },
    },
    plugins: {
      legend: { display: false },
    },
  });

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[
          { label: "Daily cost", color: colors.primary, kind: "line" },
          { label: "Cumulative total", color: colors.rose, kind: "line-dashed" },
        ]}
      />
      <ChartBox height={320}>
        <Chart type="line" data={data} options={options} />
      </ChartBox>
    </div>
  );
}

export function OverviewThroughputChart({
  points,
}: {
  points: OverviewSummary["throughput"];
}) {
  const { colors, barSuccess } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();
  const tickColor =
    typeof linearY.ticks?.color === "string" ? linearY.ticks.color : undefined;
  const taskBarColor = barSuccess;

  if (!points.length) {
    return (
      <EmptyState message="No throughput data for this period." size="chart" />
    );
  }

  const labels = points.map((p) => formatAxisDate(p.date));

  const data: ChartData<"bar" | "line"> = {
    labels,
    datasets: [
      {
        type: "bar",
        label: "Tasks",
        data: points.map((p) => p.task_count),
        backgroundColor: taskBarColor,
        hoverBackgroundColor: emphasizeBarColor(taskBarColor),
        borderColor: "transparent",
        hoverBorderColor: colors.success,
        borderWidth: 0,
        hoverBorderWidth: 2,
        borderRadius: 4,
        yAxisID: "y",
      },
      {
        type: "line",
        label: "Success rate",
        data: points.map((p) => p.success_rate),
        borderColor: colors.warning,
        backgroundColor: colors.warning,
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 5,
        tension: 0.3,
        yAxisID: "y1",
      },
    ],
  };

  const options = mergeOptions({
    scales: {
      x: {
        ...categoryX,
        title: chartAxisTitle("Date", tickColor),
      },
      y: {
        ...linearY,
        position: "left",
        title: chartAxisTitle("Tasks", tickColor),
        ticks: { ...linearY.ticks, precision: 0 },
      },
      y1: {
        ...linearY,
        position: "right",
        min: 0,
        max: 1.05,
        grid: { drawOnChartArea: false },
        title: chartAxisTitle("Success rate", tickColor),
        ticks: {
          ...linearY.ticks,
          callback: (v) => `${(Number(v) * 100).toFixed(0)}%`,
        },
      },
    },
    interaction: {
      mode: "index",
      intersect: false,
      axis: "x",
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset.label ?? "";
            const raw = Number(ctx.parsed.y ?? ctx.parsed.x);
            if (label === "Success rate") {
              return `${label}: ${(raw * 100).toFixed(1)}%`;
            }
            return `${label}: ${raw}`;
          },
        },
      },
    },
  });

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[
          { label: "Tasks", color: taskBarColor, kind: "bar" },
          { label: "Success rate", color: colors.warning, kind: "line" },
        ]}
      />
      <ChartBox height={320}>
        <Chart type="bar" data={data} options={options} />
      </ChartBox>
    </div>
  );
}

export function TopAgentsChart({ rows }: { rows: LeaderboardRow[] }) {
  const { textFill } = useChartTheme();
  const { mergeOptions, linearY } = useChartJsTheme();

  if (!rows.length) {
    return <EmptyState message="No leaderboard data." size="chart" />;
  }

  const data = [...rows]
    .sort((a, b) => a.score - b.score)
    .slice(-10);

  const scores = data.map((d) => Number(d.score));
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const barColors = data.map((entry) =>
    scoreGradientColor(Number(entry.score), minScore, maxScore),
  );
  const barHoverColors = barColors.map((c) => emphasizeBarColor(c));

  const chartData: ChartData<"bar"> = {
    labels: data.map((d) => d.agent),
    datasets: [
      {
        label: "Score",
        data: data.map((d) =>
          Number.isFinite(Number(d.score)) ? Number(d.score) : 0,
        ),
        backgroundColor: barColors,
        hoverBackgroundColor: barHoverColors,
        borderRadius: 4,
      },
    ],
  };

  const axisMax = Math.max(0.01, maxScore);

  const options = mergeOptions({
    indexAxis: "y",
    scales: {
      x: {
        ...linearY,
        min: 0,
        max: axisMax * 1.08,
        title: {
          display: true,
          text: "Score",
          color: linearY.ticks?.color,
          font: { size: 12, weight: "bold" },
        },
        ticks: {
          ...linearY.ticks,
          callback: (v) => Number(v).toFixed(2),
        },
      },
      y: {
        ...linearY,
        grid: { display: false },
        title: {
          display: true,
          text: "Agent",
          color: linearY.ticks?.color,
          font: { size: 12, weight: "bold" },
        },
      },
    },
    interaction: {
      mode: "nearest",
      intersect: true,
      axis: "y",
    },
    plugins: {
      ...datalabelsEnd(textFill, (v) => v.toFixed(2)),
      legend: { display: false },
      tooltip: {
        intersect: true,
        callbacks: {
          title: (items) => items[0]?.label ?? "",
          label: (ctx) => `Score: ${Number(ctx.parsed.x).toFixed(3)}`,
        },
      },
    },
  });

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[
          { label: "Low score", color: SCORE_SCALE[0], kind: "bar" },
          { label: "High score", color: SCORE_SCALE[2], kind: "bar" },
        ]}
      />
      <ChartBox height={360}>
        <Chart type="bar" data={chartData} options={options} />
      </ChartBox>
    </div>
  );
}

