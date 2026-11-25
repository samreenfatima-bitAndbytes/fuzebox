"use client";

import type { ChartOptions } from "chart.js";
import type { ReactNode } from "react";
import { useMemo } from "react";
import "@/components/charts/chartjs-setup";
import { useChartTheme } from "@/hooks/useChartTheme";

/** Chart.js x-axis date labels (mm/dd). */
export function formatAxisDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}/${day}`;
  } catch {
    return iso.slice(0, 10);
  }
}

export function ChartBox({
  height = 320,
  children,
}: {
  height?: number;
  children: ReactNode;
}) {
  const { plotBg } = useChartTheme();

  return (
    <div
      className="min-w-0 w-full rounded-md"
      style={{
        height,
        minHeight: height,
        backgroundColor: plotBg,
        position: "relative",
      }}
    >
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

export function useChartJsTheme() {
  const theme = useChartTheme();

  return useMemo(() => {
    const tickColor = theme.tickFill;
    const gridColor = theme.gridStroke;
    const borderColor = theme.axisStroke;

    const scaleDefaults = {
      ticks: {
        color: tickColor,
        font: { size: 11 },
      },
      grid: {
        color: gridColor,
        drawBorder: false,
      },
      border: {
        color: borderColor,
      },
    };

    const basePlugins: ChartOptions["plugins"] = {
      legend: {
        position: "top",
        align: "start",
        labels: {
          color: theme.axisText,
          font: { size: 12 },
          boxWidth: 10,
          boxHeight: 10,
          padding: 12,
        },
      },
      tooltip: {
        backgroundColor: theme.tooltipStyle.backgroundColor as string,
        titleColor: theme.axisText,
        bodyColor: theme.axisText,
        borderColor: theme.tooltipStyle.border as string,
        borderWidth: 1,
        padding: 10,
        titleFont: { size: 12, weight: "bold" },
        bodyFont: { size: 12 },
      },
      datalabels: {
        display: false,
      },
    };

    const baseOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: basePlugins,
    };

    const categoryX = {
      ...scaleDefaults,
      grid: { ...scaleDefaults.grid, display: true },
    };

    const linearY = {
      ...scaleDefaults,
      beginAtZero: true,
    };

    function mergeOptions(extra: ChartOptions): ChartOptions {
      return {
        ...baseOptions,
        ...extra,
        plugins: {
          ...baseOptions.plugins,
          ...extra.plugins,
        },
        scales: {
          ...(baseOptions.scales ?? {}),
          ...(extra.scales ?? {}),
        },
      };
    }

    return {
      theme,
      tickColor,
      baseOptions,
      categoryX,
      linearY,
      mergeOptions,
    };
  }, [theme]);
}

export function datalabelsEnd(
  color: string,
  format: (v: number) => string,
): ChartOptions["plugins"] {
  return {
    datalabels: {
      display: true,
      anchor: "end",
      align: "end",
      offset: 4,
      color,
      font: { size: 11, weight: "bold" },
      formatter: (value: number) => format(Number(value)),
    },
  };
}

export function datalabelsTop(
  color: string,
  format: (v: number) => string,
): ChartOptions["plugins"] {
  return {
    datalabels: {
      display: true,
      anchor: "end",
      align: "top",
      offset: 2,
      color,
      font: { size: 11, weight: "bold" },
      formatter: (value: number) => format(Number(value)),
    },
  };
}
