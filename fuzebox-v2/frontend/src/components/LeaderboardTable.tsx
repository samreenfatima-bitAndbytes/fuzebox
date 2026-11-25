"use client";

import { useRouter } from "next/navigation";
import { useChartTheme } from "@/hooks/useChartTheme";
import { scoreGradientColor } from "@/lib/chart-colors";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import type { LeaderboardRow } from "@/lib/types";

function scoreBandBg(score: number, dark: boolean): string {
  if (score >= 0.7) return dark ? "rgba(63,185,80,0.28)" : "#dcfce7";
  if (score >= 0.5) return dark ? "rgba(210,153,34,0.28)" : "#fef3c7";
  return dark ? "rgba(248,81,73,0.22)" : "#fee2e2";
}

export function LeaderboardTable({
  rows,
  rankLabel = "#",
  scrollClassName = "fb-cov-table-scroll",
  scoreStyle = "gradient",
}: {
  rows: LeaderboardRow[];
  rankLabel?: string;
  scrollClassName?: string;
  scoreStyle?: "gradient" | "bands";
}) {
  const router = useRouter();
  const { dark } = useChartTheme();

  if (!rows.length) {
    return (
      <EmptyState message="No leaderboard data for this time range." size="chart" />
    );
  }

  const openAgent = (agent: string) => {
    router.push(`/observation-plane?agent=${encodeURIComponent(agent)}`);
  };

  return (
    <div className={scrollClassName}>
      <DataTable className="min-w-[56rem] shadow-none">
        <DataTableHead>
          <tr>
            <th className="fb-data-table-cell w-12">{rankLabel}</th>
            <th className="fb-data-table-cell">Agent</th>
            <th className="fb-data-table-cell">Group</th>
            <th className="fb-data-table-cell">Model</th>
            <th className="fb-data-table-cell text-right">Tasks</th>
            <th className="fb-data-table-cell text-right">Success Rate</th>
            <th className="fb-data-table-cell text-right">Avg Quality</th>
            <th className="fb-data-table-cell text-right">Avg Latency (ms)</th>
            <th className="fb-data-table-cell text-right">Total Cost ($)</th>
            <th className="fb-data-table-cell text-right">Score</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {rows.map((r) => (
            <DataTableRow
              key={r.rank}
              className="cursor-pointer"
              onClick={() => openAgent(r.agent)}
            >
              <DataTableCell className="text-brand-muted">{r.rank}</DataTableCell>
              <DataTableCell className="font-medium text-brand-primary">
                {r.agent}
              </DataTableCell>
              <DataTableCell className="text-brand-muted">
                {r.group || "—"}
              </DataTableCell>
              <DataTableCell className="text-brand-muted">
                {r.model || "—"}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {r.tasks}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {(r.success_rate * 100).toFixed(1)}%
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {r.avg_quality.toFixed(2)}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {Math.round(r.avg_latency_ms).toLocaleString()}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                ${r.total_cost_usd.toFixed(4)}
              </DataTableCell>
              <DataTableCell
                align="right"
                className="font-medium tabular-nums"
                style={{
                  backgroundColor:
                    scoreStyle === "bands"
                      ? scoreBandBg(r.score, dark)
                      : scoreGradientColor(r.score, 0, 1),
                }}
              >
                {r.score.toFixed(3)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
