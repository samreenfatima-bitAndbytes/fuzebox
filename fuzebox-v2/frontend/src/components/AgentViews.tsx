"use client";

import { useMemo, useState } from "react";
import { AgentsTable } from "@/components/AgentsTable";
import { useShell } from "@/components/ShellProvider";
import { Alert } from "@/components/ui/Alert";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { DownloadCsvButton } from "@/components/ui/DownloadCsvButton";
import { PageLoading } from "@/components/ui/PageLoading";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select } from "@/components/ui/Select";
import {
  AGENT_REGISTRY_SORT_OPTIONS,
  sortAgentRegistry,
  type AgentRegistrySort,
} from "@/lib/agents-registry";
import {
  formatCapabilityLabel,
  formatTaskResultLabel,
} from "@/lib/agent-labels";
import { downloadCsv } from "@/lib/csv";
import { ApiError, deleteAgent } from "@/lib/api";
import type {
  AgentMatrix,
  AgentRegistryItem,
  AgentViolation,
} from "@/lib/types";

export function AgentFilterBar({
  agents,
  selectedIds,
  onChange,
}: {
  agents: AgentRegistryItem[];
  /** Empty = all agents (matches backend when agent_ids is omitted). */
  selectedIds: string[];
  onChange: (agentIds: string[]) => void;
}) {
  const options = agents.map((a) => ({
    value: a.agent_id,
    label: a.name,
  }));

  return (
    <div className="max-w-sm">
      <label
        htmlFor="agents-matrix-filter"
        className="fb-field-label mb-1 block text-xs uppercase tracking-wide text-brand-muted"
      >
        Filter agents (matrices)
      </label>
      <MultiSelect
        id="agents-matrix-filter"
        values={selectedIds}
        onChange={onChange}
        options={options}
        placeholder="All agents"
        aria-label="Filter agents for skills and permissions matrices"
      />
      <p className="mt-1.5 text-xs text-brand-muted">
        Limits matrix rows; registry tab always shows the full fleet.
      </p>
    </div>
  );
}

const REGISTRY_PAGE_SIZE = 15;

export function AgentsRegistryTab({
  agents,
  canWrite,
  onRefresh,
}: {
  agents: AgentRegistryItem[];
  canWrite: boolean;
  onRefresh?: () => Promise<void>;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<AgentRegistrySort>("name-asc");
  const { showToast } = useShell();
  const [deleteTarget, setDeleteTarget] = useState<AgentRegistryItem | null>(
    null,
  );
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sortedAgents = useMemo(
    () => sortAgentRegistry(agents, sort),
    [agents, sort],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(sortedAgents.length / REGISTRY_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages - 1);
  const pageAgents = useMemo(
    () =>
      sortedAgents.slice(
        safePage * REGISTRY_PAGE_SIZE,
        (safePage + 1) * REGISTRY_PAGE_SIZE,
      ),
    [sortedAgents, safePage],
  );

  const csvRows = sortedAgents.map((a) => ({
    Name: a.name,
    Group: a.group,
    Status: a.status,
    Model: a.model_name,
    Skills: a.skills_count,
    Permissions: a.permissions_count,
    "Input $/1K": a.cost_per_1k_input,
    "Output $/1K": a.cost_per_1k_output,
  }));

  return (
    <div className="space-y-4">
      {deleteError ? (
        <Alert variant="error" role="alert">
          {deleteError}
        </Alert>
      ) : null}
      <ChartPanel
        title="Agent registry"
        subtitle="High-level inventory of configured agents. ↗ opens Scenario Builder → Agents tab for that agent."
        action={
          agents.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                id="agents-registry-sort"
                aria-label="Sort agents"
                size="sm"
                value={sort}
                onChange={(value) => {
                  setSort(value as AgentRegistrySort);
                  setPage(0);
                }}
                options={AGENT_REGISTRY_SORT_OPTIONS}
                className="min-w-[10.5rem]"
              />
              <DownloadCsvButton
                onClick={() => downloadCsv("agents_registry.csv", csvRows)}
              />
            </div>
          ) : undefined
        }
      >
        <AgentsTable
          agents={pageAgents}
          canWrite={canWrite}
          showScenarioLink
          onDelete={canWrite ? (agent) => setDeleteTarget(agent) : undefined}
        />

        {sortedAgents.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-brand-muted">
            <span>
              Showing{" "}
              {`${safePage * REGISTRY_PAGE_SIZE + 1}–${Math.min((safePage + 1) * REGISTRY_PAGE_SIZE, sortedAgents.length)}`}{" "}
              of {sortedAgents.length} agents
            </span>
            {sortedAgents.length > REGISTRY_PAGE_SIZE ? (
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
        ) : null}
      </ChartPanel>

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => {
          if (deletingAgent) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) return;
          void (async () => {
            setDeletingAgent(true);
            setDeleteError(null);
            try {
              await deleteAgent(deleteTarget.agent_id);
              showToast(`Agent “${deleteTarget.name}” deleted.`);
              setDeleteTarget(null);
              if (onRefresh) await onRefresh();
            } catch (err) {
              setDeleteError(
                err instanceof ApiError
                  ? err.message
                  : "Failed to delete agent",
              );
            } finally {
              setDeletingAgent(false);
            }
          })();
        }}
        title={
          deleteTarget
            ? `Delete agent "${deleteTarget.name}"?`
            : "Delete agent?"
        }
        description="This cannot be undone. The agent will be removed from the registry and scenario teams."
        confirmLabel="Delete agent"
        loadingLabel="Deleting…"
        loading={deletingAgent}
        destructive
        titleId="agents-registry-delete-title"
      />
    </div>
  );
}

function MatrixTable({
  title,
  subtitle,
  matrix,
  yesColor,
}: {
  title: string;
  subtitle: string;
  matrix: AgentMatrix;
  yesColor: string;
}) {
  const detail = `${matrix.rows.length} agent${matrix.rows.length === 1 ? "" : "s"} · ${matrix.columns.length} column${matrix.columns.length === 1 ? "" : "s"}`;

  if (matrix.rows.length === 0) {
    return (
      <ChartPanel title={title} subtitle={subtitle}>
        <p className="text-sm text-brand-muted">No data for the selected agents.</p>
      </ChartPanel>
    );
  }

  return (
    <ChartPanel title={title} subtitle={`${subtitle} ${detail}.`}>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-brand-border">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-b bg-[var(--surface)] px-2 py-2 text-left font-medium">
                Agent
              </th>
              {matrix.columns.map((col) => (
                <th
                  key={col}
                  className="border-b px-1 py-2 text-center font-medium text-brand-muted"
                  title={col}
                >
                  <span className="inline-block max-w-[5.5rem] text-[10px] leading-tight">
                    {formatCapabilityLabel(col)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.agent_id} className="border-b border-brand-border/50">
                <td className="sticky left-0 z-10 bg-[var(--surface)] px-2 py-1.5 font-medium whitespace-nowrap">
                  {row.agent}
                </td>
                {matrix.columns.map((col) => {
                  const on = row.cells[col];
                  const label = formatCapabilityLabel(col);
                  return (
                    <td key={col} className="px-0.5 py-0.5 text-center">
                      <span
                        className="inline-block h-6 w-6 rounded"
                        style={{
                          backgroundColor: on ? yesColor : "var(--surface-muted, #e5e7eb)",
                          opacity: on ? 1 : 0.6,
                        }}
                        title={`${label}: ${on ? "Yes" : "No"}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartPanel>
  );
}

export function AgentsMatricesTab({
  agents,
  matrixFilterIds,
  onMatrixFilterChange,
  skills,
  permissions,
  loading,
}: {
  agents: AgentRegistryItem[];
  matrixFilterIds: string[];
  onMatrixFilterChange: (agentIds: string[]) => void;
  skills: AgentMatrix | null;
  permissions: AgentMatrix | null;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <AgentFilterBar
        agents={agents}
        selectedIds={matrixFilterIds}
        onChange={onMatrixFilterChange}
      />

      {loading ? (
        <PageLoading message="Loading matrices…" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {skills ? (
            <MatrixTable
              title="Skills matrix"
              subtitle="Which skills each agent can use."
              matrix={skills}
              yesColor="#4CAF50"
            />
          ) : null}
          {permissions ? (
            <MatrixTable
              title="Permissions matrix"
              subtitle="What each agent is allowed to do."
              matrix={permissions}
              yesColor="#2196F3"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

const VIOLATIONS_PAGE_SIZE = 10;

export function AgentsViolationsTab({
  violations,
  loading,
}: {
  violations: AgentViolation[];
  loading: boolean;
}) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(
    1,
    Math.ceil(violations.length / VIOLATIONS_PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () =>
      violations.slice(
        safePage * VIOLATIONS_PAGE_SIZE,
        (safePage + 1) * VIOLATIONS_PAGE_SIZE,
      ),
    [violations, safePage],
  );

  if (loading) {
    return <PageLoading message="Checking violations…" />;
  }

  if (violations.length === 0) {
    return (
      <Alert variant="success" role="status">
        No permission or skill violations detected.
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert variant="warn" role="status">
        Found {violations.length} permission/skill violation
        {violations.length === 1 ? "" : "s"}
      </Alert>
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="fb-data-table-cell">Agent</th>
            <th className="fb-data-table-cell">Task type</th>
            <th className="fb-data-table-cell">Task ID</th>
            <th className="fb-data-table-cell">Result</th>
            <th className="fb-data-table-cell">Missing permissions</th>
            <th className="fb-data-table-cell">Missing skills</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {pageRows.map((v, i) => (
            <DataTableRow key={`${v.task_id}-${safePage}-${i}`}>
              <DataTableCell>{v.agent}</DataTableCell>
              <DataTableCell className="text-sm">
                {formatCapabilityLabel(v.task_type)}
              </DataTableCell>
              <DataTableCell className="font-mono text-xs">{v.task_id}</DataTableCell>
              <DataTableCell>{formatTaskResultLabel(v.result)}</DataTableCell>
              <DataTableCell className="text-xs">
                {v.missing_permissions.length
                  ? v.missing_permissions
                      .map((p) => formatCapabilityLabel(p))
                      .join(", ")
                  : "—"}
              </DataTableCell>
              <DataTableCell className="text-xs">
                {v.missing_skills.length
                  ? v.missing_skills.map((s) => formatCapabilityLabel(s)).join(", ")
                  : "—"}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-brand-muted">
        <span>
          Showing{" "}
          {violations.length === 0
            ? 0
            : `${safePage * VIOLATIONS_PAGE_SIZE + 1}–${Math.min((safePage + 1) * VIOLATIONS_PAGE_SIZE, violations.length)}`}{" "}
          of {violations.length}
        </span>
        {violations.length > VIOLATIONS_PAGE_SIZE ? (
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
    </div>
  );
}
