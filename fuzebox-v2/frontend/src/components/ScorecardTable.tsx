"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableToolbar,
} from "@/components/ui/DataTable";
import { Select } from "@/components/ui/Select";
import { SORT_DIRECTION_OPTIONS } from "@/lib/constants";
import type { ScorecardRow } from "@/lib/types";

const SORT_COLUMNS = [
  "agent",
  "group",
  "tasks",
  "success_count",
  "fail_count",
  "success_rate",
  "failure_rate",
  "avg_quality",
] as const;

type SortKey = (typeof SORT_COLUMNS)[number];

function rateCellClass(rate: number): string {
  if (rate >= 0.8) return "fb-heatmap-low";
  if (rate >= 0.6) return "fb-heatmap-mid";
  return "fb-heatmap-high";
}

export function ScorecardTable({ rows }: { rows: ScorecardRow[] }) {
  const router = useRouter();
  const [sortCol, setSortCol] = useState<SortKey>("success_rate");
  const [sortAsc, setSortAsc] = useState(false);

  const openAgent = (agent: string) => {
    router.push(`/observation-plane?agent=${encodeURIComponent(agent)}`);
  };

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let av: string | number = a[sortCol] as string | number;
      let bv: string | number = b[sortCol] as string | number;
      if (typeof av === "string") {
        return sortAsc
          ? av.localeCompare(String(bv))
          : String(bv).localeCompare(av);
      }
      return sortAsc
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number);
    });
    return copy;
  }, [rows, sortCol, sortAsc]);

  if (rows.length === 0) {
    return (
      <DataTable
        empty={{
          message:
            "No task scorecards for this range. Try a broader time range or seed demo data.",
        }}
      >
        <tbody />
      </DataTable>
    );
  }

  return (
    <div className="space-y-3">
      <DataTableToolbar>
        <Select
          value={sortCol}
          onChange={(v) => setSortCol(v as SortKey)}
          size="sm"
          options={[
            { value: "agent", label: "Agent" },
            { value: "group", label: "Group" },
            { value: "tasks", label: "Tasks" },
            { value: "success_count", label: "Success" },
            { value: "fail_count", label: "Fail" },
            { value: "success_rate", label: "Success rate" },
            { value: "failure_rate", label: "Failure rate" },
            { value: "avg_quality", label: "Avg quality" },
          ]}
          aria-label="Sort column"
        />
        <Select
          value={sortAsc ? "Asc" : "Desc"}
          onChange={(v) => setSortAsc(v === "Asc")}
          size="sm"
          options={[...SORT_DIRECTION_OPTIONS]}
          aria-label="Sort direction"
        />
        <span className="fb-text-caption">
          Sorted by {sortCol.replace("_", " ")} {sortAsc ? "↑" : "↓"}
        </span>
      </DataTableToolbar>

      <DataTable>
        <DataTableHead>
          <tr>
            <th className="fb-data-table-cell">Agent</th>
            <th className="fb-data-table-cell">Group</th>
            <th className="fb-data-table-cell text-right">Tasks</th>
            <th className="fb-data-table-cell text-right">Success</th>
            <th className="fb-data-table-cell text-right">Fail</th>
            <th className="fb-data-table-cell text-right">Success rate</th>
            <th className="fb-data-table-cell text-right">Failure rate</th>
            <th className="fb-data-table-cell text-right">Avg quality</th>
            <th className="fb-data-table-cell">Issues</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {sorted.map((r) => (
            <DataTableRow
              key={`${r.agent}-${r.group}`}
              className="cursor-pointer"
              onClick={() => openAgent(r.agent)}
            >
              <DataTableCell className="font-medium text-brand-primary">
                {r.agent}
              </DataTableCell>
              <DataTableCell className="text-brand-muted">{r.group}</DataTableCell>
              <DataTableCell align="right">{r.tasks}</DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {r.success_count ?? 0}
              </DataTableCell>
              <DataTableCell align="right" className="tabular-nums">
                {r.fail_count ?? 0}
              </DataTableCell>
              <DataTableCell
                align="right"
                className={rateCellClass(r.success_rate)}
              >
                {(r.success_rate * 100).toFixed(1)}%
              </DataTableCell>
              <DataTableCell align="right">
                {(r.failure_rate * 100).toFixed(1)}%
              </DataTableCell>
              <DataTableCell align="right">
                {r.avg_quality.toFixed(2)}
              </DataTableCell>
              <DataTableCell
                className="max-w-xs truncate text-xs text-brand-muted"
                title={r.issues}
              >
                {r.issues || "—"}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>
    </div>
  );
}
