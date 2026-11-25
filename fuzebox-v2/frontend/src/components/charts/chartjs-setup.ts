"use client";

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  RadialLinearScale,
  RadarController,
  Tooltip,
} from "chart.js";
import annotationPlugin from "chartjs-plugin-annotation";
import ChartDataLabels from "chartjs-plugin-datalabels";

let registered = false;

/** Register Chart.js controllers/scales/plugins once (client-only). */
export function ensureChartJsRegistered() {
  if (registered) return;
  ChartJS.register(
    CategoryScale,
    LinearScale,
    RadialLinearScale,
    RadarController,
    BarController,
    BarElement,
    LineController,
    LineElement,
    PointElement,
    ArcElement,
    DoughnutController,
    Filler,
    Legend,
    Tooltip,
    annotationPlugin,
    ChartDataLabels,
  );
  registered = true;
}

// Must run before first <Chart /> render (useEffect in ChartBox is too late).
ensureChartJsRegistered();
