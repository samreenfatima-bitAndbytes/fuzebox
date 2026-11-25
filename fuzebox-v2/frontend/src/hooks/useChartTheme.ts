"use client";

import { useMemo } from "react";
import { useShell } from "@/components/ShellProvider";

const LIGHT = {
  primary: "#2563eb",
  secondary: "#0d9488",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
  rose: "#f472b6",
  pie: ["#2563eb", "#0d9488", "#60a5fa", "#34d399", "#f59e0b", "#f472b6"],
  barLow: "#fee2e2",
};

const DARK = {
  primary: "#60a5fa",
  secondary: "#2dd4bf",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  rose: "#fb7185",
  pie: ["#60a5fa", "#2dd4bf", "#93c5fd", "#5eead4", "#fbbf24", "#fb7185"],
  barLow: "#490202",
};

function barFill(r: number, g: number, b: number, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const LIGHT_BARS = {
  primary: barFill(37, 99, 235, 0.38),
  rose: barFill(244, 114, 182, 0.38),
  success: barFill(45, 164, 78, 0.38),
  warning: barFill(217, 119, 6, 0.38),
  danger: barFill(220, 38, 38, 0.38),
};

const DARK_BARS = {
  primary: barFill(96, 165, 250, 0.45),
  rose: barFill(251, 113, 133, 0.45),
  success: barFill(63, 185, 80, 0.45),
  warning: barFill(251, 191, 36, 0.48),
  danger: barFill(248, 113, 113, 0.48),
};

export function useChartTheme() {
  const { resolvedTheme } = useShell();
  const dark = resolvedTheme === "dark";

  return useMemo(() => {
    const colors = dark ? DARK : LIGHT;
    const plotBg = dark ? "#161b22" : "#ffffff";
    const axisText = dark ? "#e6edf3" : "#0b1220";
    const tickFill = dark ? "#adbac7" : "#4b5563";

    return {
      dark,
      colors,
      plotBg,
      axisText,
      tickFill,
      gridStroke: dark ? "rgba(148,163,184,0.22)" : "rgba(15,23,42,0.12)",
      axisStroke: dark ? "#6e7681" : "#9ca3af",
      textFill: axisText,
      tickStyle: { fontSize: 11, fill: tickFill },
      tickStyleMd: { fontSize: 12, fill: tickFill },
      tooltipStyle: {
        backgroundColor: dark ? "#161b22" : "#ffffff",
        border: `1px solid ${dark ? "rgba(148,163,184,0.35)" : "rgba(15,23,42,0.12)"}`,
        borderRadius: 8,
        color: axisText,
        fontSize: 12,
      },
      legendStyle: { fontSize: 12, color: axisText },
      areaPrimary: dark ? "rgba(96,165,250,0.22)" : "rgba(37,99,235,0.16)",
      /** Soft fills for bar charts (legends still use `colors.*`). */
      bars: dark ? DARK_BARS : LIGHT_BARS,
      /** @deprecated use `bars.success` */
      barSuccess: dark ? DARK_BARS.success : LIGHT_BARS.success,
    };
  }, [dark]);
}
