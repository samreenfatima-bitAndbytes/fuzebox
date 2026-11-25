import type { ScorecardRow } from "./types";

/** Column names for task scorecard CSV export. */
export function scorecardRowsToCsv(rows: ScorecardRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    Agent: r.agent,
    Group: r.group,
    Tasks: r.tasks,
    Success: r.success_count,
    Fail: r.fail_count,
    "Success Rate": r.success_rate,
    "Failure Rate": r.failure_rate,
    "Avg Quality": r.avg_quality,
    Issues: r.issues,
  }));
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
