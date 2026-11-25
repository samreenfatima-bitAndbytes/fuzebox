import Link from "next/link";
import { AgentStatusBadge } from "@/components/ui/StatusBadge";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { formatCapabilityLabel } from "@/lib/agent-labels";
import type { AgentRegistryItem } from "@/lib/types";

export function AgentsTable({
  agents,
  canWrite = true,
  showScenarioLink = false,
  showEdit = true,
  onEdit,
  onDelete,
  highlightAgentId,
}: {
  agents: AgentRegistryItem[];
  canWrite?: boolean;
  /** Link to Scenario Builder with agent pre-selected */
  showScenarioLink?: boolean;
  /** Show edit action in the Actions column (registry page sets false). */
  showEdit?: boolean;
  onEdit?: (agentId: string) => void;
  onDelete?: (agent: AgentRegistryItem) => void;
  highlightAgentId?: string | null;
}) {
  const showActionsColumn = canWrite && (showEdit || onDelete);
  if (agents.length === 0) {
    return (
      <DataTable
        empty={{
          message:
            "No agents registered. Run python seed_agents.py on the backend.",
        }}
      >
        <tbody />
      </DataTable>
    );
  }

  return (
    <DataTable>
      <DataTableHead>
        <tr>
          {showScenarioLink && <th className="fb-data-table-cell w-10" />}
          <th className="fb-data-table-cell">Name</th>
          <th className="fb-data-table-cell">Group</th>
          <th className="fb-data-table-cell">Status</th>
          <th className="fb-data-table-cell">Model</th>
          <th className="fb-data-table-cell text-right">Skills</th>
          <th className="fb-data-table-cell text-right">Permissions</th>
          <th className="fb-data-table-cell text-right">Input $/1K</th>
          <th className="fb-data-table-cell text-right">Output $/1K</th>
          {showActionsColumn ? (
            <th className="fb-data-table-cell text-right">Actions</th>
          ) : null}
        </tr>
      </DataTableHead>
      <DataTableBody>
        {agents.map((a) => (
          <DataTableRow
            key={a.agent_id}
            className={
              highlightAgentId === a.agent_id
                ? "bg-[color-mix(in_srgb,var(--brand-primary)_8%,var(--surface))]"
                : undefined
            }
          >
            {showScenarioLink && (
              <DataTableCell align="center">
                <Link
                  href={`/scenario-builder?agent=${encodeURIComponent(a.agent_id)}`}
                  title="Open in Scenario Builder"
                  className="font-medium text-brand-primary hover:underline"
                >
                  ↗
                </Link>
              </DataTableCell>
            )}
            <DataTableCell className="font-medium">{a.name}</DataTableCell>
            <DataTableCell className="text-brand-muted">
              {formatCapabilityLabel(a.group)}
            </DataTableCell>
            <DataTableCell>
              <AgentStatusBadge status={a.status} />
            </DataTableCell>
            <DataTableCell className="font-mono text-xs">{a.model_name}</DataTableCell>
            <DataTableCell align="right">{a.skills_count}</DataTableCell>
            <DataTableCell align="right">{a.permissions_count}</DataTableCell>
            <DataTableCell align="right">
              {a.cost_per_1k_input.toFixed(5)}
            </DataTableCell>
            <DataTableCell align="right">
              {a.cost_per_1k_output.toFixed(5)}
            </DataTableCell>
            {showActionsColumn ? (
              <DataTableCell align="right">
                <div className="flex flex-wrap justify-end gap-2">
                  {showEdit ? (
                    onEdit ? (
                      <button
                        type="button"
                        onClick={() => onEdit(a.agent_id)}
                        className="text-xs font-medium text-brand-primary hover:underline"
                      >
                        Edit
                      </button>
                    ) : (
                      <Link
                        href={`/agents/${encodeURIComponent(a.agent_id)}/edit`}
                        className="text-xs font-medium text-brand-primary hover:underline"
                      >
                        Edit
                      </Link>
                    )
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => onDelete(a)}
                      className="text-xs font-medium text-[var(--alert-error-text)] hover:underline"
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </DataTableCell>
            ) : null}
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
