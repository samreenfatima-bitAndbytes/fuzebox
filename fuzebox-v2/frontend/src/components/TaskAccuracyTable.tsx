import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import type { AccuracyByTypeRow } from "@/lib/types";

export function TaskAccuracyTable({ rows }: { rows: AccuracyByTypeRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No task-type success data for this time range.
      </p>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          <th className="fb-data-table-cell">Task type</th>
          <th className="fb-data-table-cell text-right">Total</th>
          <th className="fb-data-table-cell text-right">Success</th>
          <th className="fb-data-table-cell text-right">Success rate</th>
        </tr>
      </DataTableHead>
      <DataTableBody>
        {rows.map((r) => (
          <DataTableRow key={r.task_type}>
            <DataTableCell className="font-medium">{r.task_type}</DataTableCell>
            <DataTableCell align="right">{r.total}</DataTableCell>
            <DataTableCell align="right">{r.success}</DataTableCell>
            <DataTableCell align="right">
              <div className="flex items-center justify-end gap-2">
                <div className="fb-track h-2 w-24 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full bg-brand-primary"
                    style={{
                      width: `${Math.min(100, r.success_rate * 100)}%`,
                    }}
                  />
                </div>
                {(r.success_rate * 100).toFixed(0)}%
              </div>
            </DataTableCell>
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
