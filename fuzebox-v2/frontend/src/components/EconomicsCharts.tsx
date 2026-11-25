"use client";

import type { ChartData, ChartOptions } from "chart.js";
import { Chart } from "react-chartjs-2";
import {
  ChartBox,
  datalabelsEnd,
  datalabelsTop,
  formatAxisDate,
  useChartJsTheme,
} from "@/components/charts/ChartJsTheme";
import { ChartLegendRow } from "@/components/charts/ChartLegendRow";
import { useChartTheme } from "@/hooks/useChartTheme";
import { EmptyState } from "@/components/ui/EmptyState";
import type { EconomicsSummary } from "@/lib/types";

export function CostByAgentChart({ rows }: { rows: EconomicsSummary["cost_by_agent"] }) {
  const { colors, textFill } = useChartTheme();
  const { mergeOptions, linearY, theme } = useChartJsTheme();

  if (!rows.length) return <EmptyState message="No cost by agent data." size="chart" />;

  const data = [...rows].sort((a, b) => a.total_cost_usd - b.total_cost_usd).slice(-12);

  const chartData: ChartData<"bar"> = {
    labels: data.map((d) => d.agent),
    datasets: [
      {
        label: "Total cost",
        data: data.map((d) => d.total_cost_usd),
        backgroundColor: colors.primary,
        borderRadius: 4,
      },
    ],
  };

  const options = mergeOptions({
    indexAxis: "y",
    scales: {
      x: {
        ...linearY,
        beginAtZero: true,
        title: {
          display: true,
          text: "Total cost ($)",
          color: theme.axisText,
          font: { size: 12, weight: "bold" },
        },
        ticks: {
          ...linearY.ticks,
          callback: (v) => `$${Number(v).toFixed(2)}`,
        },
      },
      y: {
        ...linearY,
        grid: { display: false },
      },
    },
    plugins: {
      ...datalabelsEnd(textFill, (v) => `$${v.toFixed(2)}`),
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `Total cost: $${Number(ctx.parsed.x).toFixed(4)}`,
        },
      },
    },
  });

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[{ label: "Cost", color: colors.primary, kind: "bar" }]}
      />
      <ChartBox height={360}>
        <Chart type="bar" data={chartData} options={options} />
      </ChartBox>
    </div>
  );
}

export function CostByTaskTypePie({ rows }: { rows: EconomicsSummary["cost_by_task_type"] }) {
  const { colors } = useChartTheme();
  const { mergeOptions, theme } = useChartJsTheme();

  if (!rows.length) return <EmptyState message="No task-type spend data." size="chart" />;

  const data = [...rows]
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
    .slice(0, 10);

  const chartData: ChartData<"doughnut"> = {
    labels: data.map((r) => r.task_type),
    datasets: [
      {
        data: data.map((r) => r.total_cost_usd),
        backgroundColor: data.map((_, i) => colors.pie[i % colors.pie.length]),
        borderWidth: 0,
      },
    ],
  };

  const options = {
    ...mergeOptions({
      plugins: {
        datalabels: {
          display: (ctx: { dataset: { data: number[] }; dataIndex: number }) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const v = Number(ctx.dataset.data[ctx.dataIndex]);
            return total > 0 && v / total >= 0.04;
          },
          color: theme.axisText,
          font: { size: 11, weight: "normal" as const },
          formatter: (
            value: number,
            ctx: {
              dataset: { data: number[] };
              dataIndex: number;
              chart: { data: { labels?: string[] } };
            },
          ) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(0) : "0";
            return `${ctx.chart.data.labels?.[ctx.dataIndex] ?? ""} ${pct}%`;
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx: { label?: string; parsed: number }) => {
              const v = Number(ctx.parsed);
              return `${ctx.label}: $${v.toFixed(4)}`;
            },
          },
        },
      } as ChartOptions["plugins"],
    }),
    cutout: "45%",
  } as ChartOptions<"doughnut">;

  return (
    <ChartBox height={360}>
      <Chart type="doughnut" data={chartData} options={options} />
    </ChartBox>
  );
}

export function CumulativeCostChart({
  points,
}: {
  points: EconomicsSummary["cost_time_series"];
}) {
  const { colors, areaPrimary } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();

  if (!points.length) return <EmptyState message="No cost trend data." size="chart" />;

  const chartData: ChartData<"line"> = {
    labels: points.map((p) => formatAxisDate(p.date)),
    datasets: [
      {
        label: "Cumulative",
        data: points.map((p) => p.cumulative_cost_usd),
        borderColor: colors.primary,
        backgroundColor: areaPrimary,
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointRadius: 2,
      },
    ],
  };

  const options = mergeOptions({
    scales: {
      x: categoryX,
      y: {
        ...linearY,
        title: {
          display: true,
          text: "Cumulative ($)",
          color: linearY.ticks?.color,
          font: { size: 12, weight: "bold" },
        },
        ticks: {
          ...linearY.ticks,
          callback: (v) => `$${Number(v).toFixed(2)}`,
        },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `Cumulative: $${Number(ctx.parsed.y).toFixed(4)}`,
        },
      },
    },
  });

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[
          { label: "Cumulative total", color: colors.primary, kind: "area" },
        ]}
      />
      <ChartBox height={320}>
        <Chart type="line" data={chartData} options={options} />
      </ChartBox>
    </div>
  );
}

export function TokenDistributionPie({ tokens }: { tokens: EconomicsSummary["token_usage"] }) {
  const { colors } = useChartTheme();
  const { mergeOptions, theme } = useChartJsTheme();

  if (!tokens.total_tokens) return <EmptyState message="No token data." size="chart" />;

  const chartData: ChartData<"doughnut"> = {
    labels: ["Input", "Output"],
    datasets: [
      {
        data: [tokens.total_input_tokens, tokens.total_output_tokens],
        backgroundColor: [colors.primary, colors.rose],
        borderWidth: 0,
      },
    ],
  };

  const options = {
    ...mergeOptions({
      plugins: {
        datalabels: {
          display: true,
          color: theme.axisText,
          font: { size: 11, weight: "normal" as const },
          formatter: (
            value: number,
            ctx: {
              dataset: { data: number[] };
              dataIndex: number;
              chart: { data: { labels?: string[] } };
            },
          ) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
            const pct = total > 0 ? ((Number(value) / total) * 100).toFixed(0) : "0";
            return `${ctx.chart.data.labels?.[ctx.dataIndex] ?? ""} ${pct}%`;
          },
        },
      } as ChartOptions["plugins"],
    }),
    cutout: "50%",
  } as ChartOptions<"doughnut">;

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[
          { label: "Input", color: colors.primary, kind: "swatch" },
          { label: "Output", color: colors.rose, kind: "swatch" },
        ]}
      />
      <ChartBox height={320}>
        <Chart type="doughnut" data={chartData} options={options} />
      </ChartBox>
    </div>
  );
}

export function TokensByOutcomeChart({ tokens }: { tokens: EconomicsSummary["token_usage"] }) {
  const { colors, textFill } = useChartTheme();
  const { mergeOptions, categoryX, linearY } = useChartJsTheme();

  const chartData: ChartData<"bar"> = {
    labels: ["Per success", "Per failure"],
    datasets: [
      {
        label: "Avg tokens",
        data: [tokens.avg_tokens_per_success, tokens.avg_tokens_per_failure],
        backgroundColor: [colors.success, colors.danger],
        borderRadius: 4,
      },
    ],
  };

  const options = mergeOptions({
    scales: {
      x: categoryX,
      y: {
        ...linearY,
        title: {
          display: true,
          text: "Avg tokens",
          color: linearY.ticks?.color,
          font: { size: 12, weight: "bold" },
        },
      },
    },
    plugins: {
      ...datalabelsTop(textFill, (v) => v.toLocaleString()),
      legend: { display: false },
    },
  });

  return (
    <div>
      <ChartLegendRow
        className="mb-3"
        items={[
          { label: "Success", color: colors.success, kind: "bar" },
          { label: "Failure", color: colors.danger, kind: "bar" },
        ]}
      />
      <ChartBox height={320}>
        <Chart type="bar" data={chartData} options={options} />
      </ChartBox>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
}: {
  columns: { key: string; label: string; align?: "left" | "right" }[];
  rows: Record<string, string | number>[];
}) {
  if (!rows.length) return null;
  return (
    <div className="fb-card-accent-top">
      <table className="min-w-full text-left text-sm text-brand-ink">
        <thead className="fb-table-head">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-4 py-2 ${c.align === "right" ? "text-right" : ""}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border">
          {rows.map((r, i) => (
            <tr key={i} className="fb-table-row">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-4 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                >
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
