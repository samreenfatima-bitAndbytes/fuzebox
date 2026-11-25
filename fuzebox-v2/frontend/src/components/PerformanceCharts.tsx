"use client";

import type { ChartData, ChartOptions } from "chart.js";
import { Chart } from "react-chartjs-2";
import {
  ChartBox,
  formatAxisDate,
  useChartJsTheme,
} from "@/components/charts/ChartJsTheme";
import { ChartGuideAside } from "@/components/charts/ChartGuideAside";
import { ChartLegendRow } from "@/components/charts/ChartLegendRow";
import { useChartTheme } from "@/hooks/useChartTheme";
import { emphasizeBarColor, scoreGradientColor } from "@/lib/chart-colors";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PerformanceSummary } from "@/lib/types";

export function ReliabilityHowToUse() {
  return (
    <ChartGuideAside title="How to use this" lead="A quick reliability readout.">
      <li>
        The dashed line marks the <strong className="font-medium text-brand-ink">80%</strong>{" "}
        success threshold.
      </li>
      <li>
        Use <strong className="font-medium text-brand-ink">Group</strong> +{" "}
        <strong className="font-medium text-brand-ink">Agents</strong> filters to
        compare teams.
      </li>
      <li>
        Switch to <strong className="font-medium text-brand-ink">Latency</strong> to
        see where time is spent.
      </li>
    </ChartGuideAside>
  );
}

export function CompletionRatesChart({
  rows,
}: {
  rows: PerformanceSummary["completion_rates"];
}) {
  const { dark, colors } = useChartTheme();
  const { mergeOptions, linearY, theme } = useChartJsTheme();

  if (rows.length === 0) {
    return <EmptyState message="No completion data for this period." size="chart" />;
  }

  const sorted = [...rows]
    .sort((a, b) => a.completion_rate - b.completion_rate)
    .slice(-16);

  const rates = sorted.map((r) => r.completion_rate);
  const minRate = Math.min(...rates);
  const maxRate = Math.max(...rates);
  const barColors = rates.map((rate) =>
    scoreGradientColor(rate, minRate, maxRate),
  );

  const chartData: ChartData<"bar"> = {
    labels: sorted.map((r) => r.agent),
    datasets: [
      {
        label: "Success rate",
        data: sorted.map((r) => Math.round(r.completion_rate * 1000) / 10),
        backgroundColor: barColors,
        hoverBackgroundColor: barColors.map((c) => emphasizeBarColor(c)),
        borderRadius: 4,
      },
    ],
  };

  const options = mergeOptions({
    indexAxis: "y",
    interaction: {
      mode: "nearest",
      intersect: true,
      axis: "y",
    },
    scales: {
      x: {
        ...linearY,
        min: 0,
        max: 100,
        title: {
          display: true,
          text: "Success rate",
          color: theme.axisText,
          font: { size: 12, weight: "bold" },
        },
        ticks: {
          ...linearY.ticks,
          callback: (v) => `${v}%`,
        },
      },
      y: {
        ...linearY,
        grid: { display: false },
      },
    },
    plugins: {
      legend: { display: false },
      annotation: {
        annotations: {
          target80: {
            type: "line",
            xMin: 80,
            xMax: 80,
            borderColor: dark ? "#484f58" : "#94a3b8",
            borderWidth: 1,
            borderDash: [4, 4],
          },
        },
      },
      tooltip: {
        intersect: true,
        callbacks: {
          title: (items) => items[0]?.label ?? "",
          label: (ctx) => `Success rate: ${Number(ctx.parsed.x).toFixed(1)}%`,
        },
      },
    },
  });

  const thresholdColor = dark ? "#484f58" : "#94a3b8";

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[
          { label: "Success rate", color: colors.success, kind: "bar" },
          { label: "80%", color: thresholdColor, kind: "line-dashed" },
        ]}
      />
      <ChartBox height={360}>
        <Chart type="bar" data={chartData} options={options} />
      </ChartBox>
    </div>
  );
}

export function LatencyByAgentChart({
  rows,
}: {
  rows: PerformanceSummary["latency_by_agent"];
}) {
  const { colors } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();

  if (rows.length === 0) {
    return <EmptyState message="No latency data for this period." size="chart" />;
  }

  const chartData: ChartData<"bar"> = {
    labels: rows.map((r) => r.agent),
    datasets: [
      {
        label: "P50 (ms)",
        data: rows.map((r) => r.p50_ms),
        backgroundColor: colors.primary,
        hoverBackgroundColor: emphasizeBarColor(colors.primary),
        borderRadius: 4,
      },
      {
        label: "P90 (ms)",
        data: rows.map((r) => r.p90_ms),
        backgroundColor: colors.rose,
        hoverBackgroundColor: emphasizeBarColor(colors.rose),
        borderRadius: 4,
      },
    ],
  };

  const options = mergeOptions({
    interaction: {
      mode: "index",
      intersect: false,
      axis: "x",
    },
    scales: {
      x: {
        ...categoryX,
        ticks: {
          ...categoryX.ticks,
          maxRotation: 35,
          minRotation: 35,
        },
      },
      y: {
        ...linearY,
        title: {
          display: true,
          text: "Latency (ms)",
          color: linearY.ticks?.color,
          font: { size: 12, weight: "bold" },
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          title: (items) => items[0]?.label ?? "",
          label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString()} ms`,
        },
      },
    },
  });

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[
          { label: "P50", color: colors.primary, kind: "bar" },
          { label: "P90", color: colors.rose, kind: "bar" },
        ]}
      />
      <ChartBox height={360}>
        <Chart type="bar" data={chartData} options={options} />
      </ChartBox>
    </div>
  );
}

export function LatencyHistogramChart({
  histogram,
}: {
  histogram: PerformanceSummary["latency_histogram"];
}) {
  const { colors, dark } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();

  if (!histogram.bins.length) {
    return <EmptyState message="No latency measurements in this range." size="chart" />;
  }

  const stats = histogram.stats;
  const barFill = dark
    ? "rgba(96, 165, 250, 0.65)"
    : "rgba(31, 111, 235, 0.65)";
  const chartData: ChartData<"bar"> = {
    labels: histogram.bins.map(
      (b) => `${Math.round(b.start_ms)}–${Math.round(b.end_ms)}`,
    ),
    datasets: [
      {
        label: "Count",
        data: histogram.bins.map((b) => b.count),
        backgroundColor: barFill,
        hoverBackgroundColor: emphasizeBarColor(barFill),
        borderRadius: 4,
      },
    ],
  };

  const options = mergeOptions({
    interaction: {
      mode: "index",
      intersect: false,
      axis: "x",
    },
    scales: {
      x: categoryX,
      y: {
        ...linearY,
        title: {
          display: true,
          text: "Count",
          color: linearY.ticks?.color,
          font: { size: 12, weight: "bold" },
        },
        ticks: { ...linearY.ticks, precision: 0 },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const label = items[0]?.label ?? "";
            return label ? `${label} ms` : "";
          },
          label: (ctx) => `Count: ${Number(ctx.parsed.y).toLocaleString()}`,
        },
      },
    },
  });

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[{ label: "Tasks", color: colors.primary, kind: "bar" }]}
      />
      {stats.p50_ms != null && (
        <p className="mb-3 text-sm font-medium text-brand-ink/80">
          P50: {stats.p50_ms} ms · P90: {stats.p90_ms} ms · P99: {stats.p99_ms} ms
        </p>
      )}
      <ChartBox height={320}>
        <Chart type="bar" data={chartData} options={options} />
      </ChartBox>
    </div>
  );
}

export function ThroughputChart({
  points,
}: {
  points: PerformanceSummary["throughput"];
}) {
  const { colors, barSuccess } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();
  const taskBarColor = barSuccess;

  if (points.length === 0) {
    return <EmptyState message="No throughput data for this period." size="chart" />;
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
    interaction: {
      mode: "index",
      intersect: false,
      axis: "x",
    },
    scales: {
      x: categoryX,
      y: {
        ...linearY,
        position: "left",
        title: { display: true, text: "Tasks", color: linearY.ticks?.color, font: { size: 12, weight: "bold" } },
        ticks: { ...linearY.ticks, precision: 0 },
      },
      y1: {
        ...linearY,
        position: "right",
        min: 0,
        max: 1.05,
        grid: { drawOnChartArea: false },
        title: { display: true, text: "Success", color: linearY.ticks?.color, font: { size: 12, weight: "bold" } },
        ticks: {
          ...linearY.ticks,
          callback: (v) => `${(Number(v) * 100).toFixed(0)}%`,
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label: (ctx) => {
            const label = ctx.dataset.label ?? "";
            const raw = Number(ctx.parsed.y);
            if (label === "Success rate") {
              return `${label}: ${(raw * 100).toFixed(1)}%`;
            }
            return `${label}: ${raw.toLocaleString()}`;
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
      <ChartBox height={340}>
        <Chart type="bar" data={data} options={options} />
      </ChartBox>
    </div>
  );
}

