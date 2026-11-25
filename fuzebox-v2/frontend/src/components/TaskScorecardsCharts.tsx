"use client";

import type { ChartData, ChartOptions } from "chart.js";
import { Chart } from "react-chartjs-2";
import {
  ChartBox,
  datalabelsEnd,
  useChartJsTheme,
} from "@/components/charts/ChartJsTheme";
import { ChartLegendRow } from "@/components/charts/ChartLegendRow";
import { useChartTheme } from "@/hooks/useChartTheme";
import { emphasizeBarColor } from "@/lib/chart-colors";
import { EmptyState } from "@/components/ui/EmptyState";
import type { AccuracyByTypeRow } from "@/lib/types";

function successRateBarColor(
  rate: number,
  bars: { success: string; warning: string; danger: string },
): string {
  if (rate >= 0.8) return bars.success;
  if (rate >= 0.6) return bars.warning;
  return bars.danger;
}

export function TaskAccuracyByTypeChart({
  rows,
}: {
  rows: AccuracyByTypeRow[];
}) {
  const { bars, textFill } = useChartTheme();
  const { mergeOptions, linearY, theme } = useChartJsTheme();

  if (rows.length === 0) {
    return (
      <EmptyState
        message="No task-type success data for this time range."
        size="chart"
      />
    );
  }

  const sorted = [...rows].sort((a, b) => a.success_rate - b.success_rate);
  const rates = sorted.map((r) => r.success_rate);
  const barColors = rates.map((rate) => successRateBarColor(rate, bars));

  const chartData: ChartData<"bar"> = {
    labels: sorted.map((r) => r.task_type),
    datasets: [
      {
        label: "Success rate",
        data: sorted.map((r) => Math.round(r.success_rate * 1000) / 10),
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
      ...datalabelsEnd(textFill, (v) => `${v.toFixed(0)}%`),
      legend: { display: false },
      tooltip: {
        intersect: true,
        callbacks: {
          title: (items) => String(items[0]?.label ?? ""),
          label: (ctx) => {
            const row = sorted[ctx.dataIndex];
            if (!row) return "";
            return [
              `Success rate: ${(row.success_rate * 100).toFixed(1)}%`,
              `Success: ${row.success} / ${row.total}`,
            ];
          },
        },
      },
    },
  }) as ChartOptions<"bar">;

  const chartHeight = Math.max(280, sorted.length * 36 + 48);

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[
          { label: "≥ 80%", color: bars.success, kind: "bar" },
          { label: "60–79%", color: bars.warning, kind: "bar" },
          { label: "< 60%", color: bars.danger, kind: "bar" },
        ]}
      />
      <ChartBox height={chartHeight}>
        <Chart type="bar" data={chartData} options={options} />
      </ChartBox>
    </div>
  );
}
