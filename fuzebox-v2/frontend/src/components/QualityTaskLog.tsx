"use client";

import { useMemo, useState } from "react";
import { CreateTaskModal } from "@/components/CreateTaskModal";
import { useShell } from "@/components/ShellProvider";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableToolbar,
} from "@/components/ui/DataTable";
import { Alert } from "@/components/ui/Alert";
import { FilterChipGroup } from "@/components/ui/FilterChipGroup";
import { ApiError, runQualityTask } from "@/lib/api";
import { setPendingWorkflow } from "@/lib/pending-workflow";
import type { QualityTaskRow } from "@/lib/types";

const PAGE_SIZE = 12;

const STATUS_FILTERS = [
  { id: "All" as const, label: "All" },
  { id: "Completed" as const, label: "Completed" },
  { id: "Failed" as const, label: "Failed" },
  { id: "Running" as const, label: "Running" },
];

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "Completed"
      ? "fb-badge-success"
      : status === "Failed"
        ? "fb-badge-muted text-[var(--alert-error-text)]"
        : "fb-badge-warn";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}
    >
      {status}
    </span>
  );
}

export function QualityTaskLog({
  tasks,
  total,
  canWrite = true,
  onPipelineStarted,
  onTaskQueued,
}: {
  tasks: QualityTaskRow[];
  total: number;
  canWrite?: boolean;
  onPipelineStarted?: (requestId: string) => void;
  onTaskQueued?: () => void;
}) {
  const { showToast } = useShell();
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_FILTERS)[number]["id"]>("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const showRunColumn = canWrite && tasks.some((t) => t.can_run);

  async function handleRun(taskId: string) {
    setRunError(null);
    setRunningId(taskId);
    try {
      const result = await runQualityTask(taskId);
      setPendingWorkflow(result.request_id);
      onPipelineStarted?.(result.request_id);
      onTaskQueued?.();
      showToast("Queued task started.");
    } catch (err) {
      setRunError(
        err instanceof ApiError ? err.message : "Failed to start queued task.",
      );
    } finally {
      setRunningId(null);
    }
  }

  const filtered = useMemo(() => {
    let rows = tasks;
    if (statusFilter !== "All") {
      rows = rows.filter((t) => t.status === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (t) =>
          t.agent.toLowerCase().includes(q) ||
          t.task.toLowerCase().includes(q) ||
          t.task_type.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [tasks, statusFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  const toolbar = (
    <DataTableToolbar>
      {tasks.length > 0 ? (
        <FilterChipGroup
          options={STATUS_FILTERS}
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setPage(0);
          }}
          ariaLabel="Task status"
        />
      ) : null}
      <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-2">
        {tasks.length > 0 ? (
          <input
            type="search"
            placeholder="Search agent or task…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="fb-input w-48 sm:w-64"
            aria-label="Search tasks"
          />
        ) : null}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="fb-btn-primary inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm"
          data-testid="button-new-task"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
          New task
        </button>
      </div>
    </DataTableToolbar>
  );

  if (tasks.length === 0) {
    return (
      <div className="space-y-4">
        {toolbar}
        <DataTable
          empty={{
            title: "No tasks yet",
            message: "No task data found yet for Quality view.",
          }}
        >
          <tbody />
        </DataTable>
        <CreateTaskModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          canWrite={canWrite}
          onPipelineStarted={onPipelineStarted}
          onTaskQueued={onTaskQueued}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toolbar}
      {runError ? (
        <Alert variant="error" role="alert">
          {runError}
        </Alert>
      ) : null}

      <DataTable>
          <DataTableHead>
            <tr>
              <th className="fb-data-table-cell">Agent</th>
              <th className="fb-data-table-cell">Task</th>
              <th className="fb-data-table-cell">Status</th>
              <th className="fb-data-table-cell">Duration</th>
              <th className="fb-data-table-cell text-right">Time saved (m)</th>
              <th className="fb-data-table-cell">Timestamp</th>
              {showRunColumn ? (
                <th className="fb-data-table-cell text-right">Actions</th>
              ) : null}
            </tr>
          </DataTableHead>
          <DataTableBody>
            {pageRows.map((t, i) => (
              <DataTableRow key={`${t.agent}-${t.timestamp}-${safePage}-${i}`}>
                <DataTableCell className="font-mono text-xs">
                  {t.agent}
                </DataTableCell>
                <DataTableCell
                  className="max-w-xs truncate"
                  title={t.task}
                >
                  {t.task}
                </DataTableCell>
                <DataTableCell>
                  <StatusBadge status={t.status} />
                </DataTableCell>
                <DataTableCell className="text-brand-muted">
                  {t.duration}
                </DataTableCell>
                <DataTableCell align="right">{t.time_saved_m}</DataTableCell>
                <DataTableCell className="whitespace-nowrap text-xs text-brand-muted">
                  {t.timestamp}
                </DataTableCell>
                {showRunColumn ? (
                  <DataTableCell align="right">
                    {t.can_run && t.task_id ? (
                      <button
                        type="button"
                        className="fb-btn-primary text-xs"
                        disabled={runningId === t.task_id}
                        onClick={() => void handleRun(t.task_id!)}
                      >
                        {runningId === t.task_id ? "Running…" : "Run"}
                      </button>
                    ) : null}
                  </DataTableCell>
                ) : null}
              </DataTableRow>
            ))}
          </DataTableBody>
      </DataTable>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-brand-muted">
        <span>
          Showing{" "}
          {filtered.length === 0
            ? 0
            : `${safePage * PAGE_SIZE + 1}–${Math.min((safePage + 1) * PAGE_SIZE, filtered.length)}`}{" "}
          of {filtered.length} filtered · {total} total
        </span>
        {filtered.length > PAGE_SIZE ? (
          <div className="flex gap-2">
            <button
              type="button"
              className="fb-btn text-xs"
              disabled={safePage === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="self-center tabular-nums">
              Page {safePage + 1} of {totalPages}
            </span>
            <button
              type="button"
              className="fb-btn text-xs"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        canWrite={canWrite}
        onPipelineStarted={onPipelineStarted}
        onTaskQueued={onTaskQueued}
      />
    </div>
  );
}
