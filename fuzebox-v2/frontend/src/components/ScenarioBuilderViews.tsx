"use client";

import { useEffect, useMemo, useState } from "react";
import { AgentForm } from "@/components/AgentForm";
import { AgentsTable } from "@/components/AgentsTable";
import { useShell } from "@/components/ShellProvider";
import { Alert } from "@/components/ui/Alert";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui/Modal";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { FormField, FormTextarea } from "@/components/ui/FormField";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { Select, SelectField } from "@/components/ui/Select";
import {
  EXTRA_PERMISSIONS,
  SCENARIO_STATUS_OPTIONS,
  SCENARIO_STATUS_SELECT_OPTIONS,
  TASK_TYPES,
} from "@/lib/constants";
import { ApiError, createAgent, deleteAgent, fetchAgent, updateAgent } from "@/lib/api";
import { openGenerateRequest } from "@/lib/generate-request";
import {
  computeCostPreview,
  inheritedPermissions,
  newStep,
  type PipelineStepDraft,
  type ScenarioDraft,
} from "@/lib/scenario-draft";
import { formatScenarioUpdatedAt } from "@/lib/format";
import type {
  AgentDetail,
  AgentRegistryItem,
  ScenarioCost,
  ScenarioSummary,
} from "@/lib/types";

function ScenarioSaveDetails({
  draft,
  onChange,
  disabled = false,
}: {
  draft: ScenarioDraft;
  onChange: (patch: Partial<ScenarioDraft>) => void;
  disabled?: boolean;
}) {
  const statusHint =
    SCENARIO_STATUS_SELECT_OPTIONS.find((o) => o.value === draft.status)?.hint ??
    "Controls whether this scenario is draft, published, or retired.";

  return (
    <div className="space-y-4 border-b border-brand-border pb-6">
      <div>
        <h4 className="text-sm font-semibold text-brand-ink">Scenario details</h4>
        <p className="mt-1 text-xs text-brand-muted">
          These fields are saved with the workflow. They identify the scenario in
          the library and downstream surfaces (UoP, health, runnable lists).
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <FormField
          id="scenario-name"
          label="Scenario name"
          hint="Short label shown in the library and when picking workflows to run."
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Customer Complaint Resolution"
          required
          disabled={disabled}
        />
        <FormTextarea
          id="scenario-description"
          label="Description"
          hint="Optional summary for your team — what business process or trigger this workflow covers."
          value={draft.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="e.g. Classify inbound complaints, route to the right agent team, and draft a first response."
          disabled={disabled}
        />
      </div>
      <SelectField
        label="Lifecycle status"
        hint={statusHint}
        value={draft.status}
        onChange={(status) => onChange({ status })}
        className="max-w-md"
        disabled={disabled}
        options={SCENARIO_STATUS_SELECT_OPTIONS.map((o) => ({
          value: o.value,
          label: o.label,
        }))}
      />
    </div>
  );
}

export function ScenarioAgentsTab({
  agents,
  canWrite,
  focusAgentId,
  onRefresh,
}: {
  agents: AgentRegistryItem[];
  canWrite: boolean;
  focusAgentId?: string | null;
  onRefresh: () => Promise<void>;
}) {
  const { showToast } = useShell();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editAgent, setEditAgent] = useState<AgentDetail | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentRegistryItem | null>(
    null,
  );
  const [deletingAgent, setDeletingAgent] = useState(false);

  useEffect(() => {
    if (!editId) {
      setEditAgent(null);
      return;
    }
    let cancelled = false;
    setEditLoading(true);
    fetchAgent(editId)
      .then((a) => {
        if (!cancelled) setEditAgent(a);
      })
      .catch(() => {
        if (!cancelled) setEditAgent(null);
      })
      .finally(() => {
        if (!cancelled) setEditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-brand-muted">
          Manage agents in the registry. Changes apply to all scenarios.
        </p>
        {canWrite ? (
          <button
            type="button"
            className="fb-btn-primary"
            onClick={() => setCreateOpen(true)}
          >
            Create agent
          </button>
        ) : null}
      </div>

      {agents.length === 0 ? (
        <PageEmpty
          title="No agents yet"
          message="Create your first agent to build scenarios."
          action={
            canWrite
              ? { label: "Create agent", onClick: () => setCreateOpen(true) }
              : undefined
          }
        />
      ) : (
        <AgentsTable
          agents={agents}
          canWrite={canWrite}
          showScenarioLink
          highlightAgentId={focusAgentId}
          onEdit={canWrite ? (id) => setEditId(id) : undefined}
          onDelete={canWrite ? (agent) => setDeleteTarget(agent) : undefined}
        />
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} size="lg">
        <ModalHeader
          title="Create agent"
          description="Register a new agent in the database."
          onClose={() => setCreateOpen(false)}
          titleId="sb-create-agent-title"
        />
        <ModalBody className="max-h-[70vh] overflow-y-auto p-0">
          <AgentForm
            embedded
            mode="create"
            canWrite={canWrite}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (values) => {
              const created = await createAgent(values);
              setCreateOpen(false);
              showToast(`Agent “${created.name}” created.`);
              await onRefresh();
            }}
          />
        </ModalBody>
      </Modal>

      <Modal
        open={editId !== null}
        onClose={() => setEditId(null)}
        size="lg"
      >
        <ModalHeader
          title="Edit agent"
          description={editId ?? ""}
          onClose={() => setEditId(null)}
          titleId="sb-edit-agent-title"
        />
        <ModalBody className="max-h-[70vh] overflow-y-auto p-0">
          {editLoading || !editAgent ? (
            <p className="p-4 text-sm text-brand-muted">Loading agent…</p>
          ) : (
            <AgentForm
              embedded
              mode="edit"
              initial={editAgent}
              canWrite={canWrite}
              onCancel={() => setEditId(null)}
              onSubmit={async (values) => {
                const updated = await updateAgent(editAgent.agent_id, values);
                setEditId(null);
                showToast(`Agent “${updated.name}” updated.`);
                await onRefresh();
              }}
              onDelete={async () => {
                await deleteAgent(editAgent.agent_id);
                setEditId(null);
                showToast(`Agent “${editAgent.name}” deleted.`);
                await onRefresh();
              }}
            />
          )}
        </ModalBody>
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => {
          if (deletingAgent) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) return;
          void (async () => {
            setDeletingAgent(true);
            try {
              await deleteAgent(deleteTarget.agent_id);
              showToast(`Agent “${deleteTarget.name}” deleted.`);
              setDeleteTarget(null);
              await onRefresh();
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
        titleId="sb-delete-agent-title"
      />
    </div>
  );
}

export function ScenarioTeamTab({
  draft,
  agents,
  agentDetails,
  onChange,
}: {
  draft: ScenarioDraft;
  agents: AgentRegistryItem[];
  agentDetails: AgentDetail[];
  onChange: (patch: Partial<ScenarioDraft>) => void;
}) {
  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.agent_id, a])),
    [agents],
  );

  const inherited = useMemo(
    () => inheritedPermissions(draft.teamAgentIds, agentDetails),
    [draft.teamAgentIds, agentDetails],
  );

  const permissionOptions = useMemo(
    () =>
      EXTRA_PERMISSIONS.filter((p) => !inherited.includes(p)).map((p) => ({
        value: p,
        label: p,
      })),
    [inherited],
  );

  if (agents.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No agents registered. Add agents in the Agents tab first.
      </p>
    );
  }

  const roles = [
    ...new Set(
      draft.teamAgentIds
        .map((id) => agentMap.get(id)?.group)
        .filter(Boolean) as string[],
    ),
  ];

  const agentOptions = agents.map((a) => ({
    value: a.agent_id,
    label: `${a.name} [${a.group}]`,
  }));

  return (
    <div className="fb-surface-panel space-y-4 p-4 sm:p-5">
      <h3 className="fb-section-title">Team configuration</h3>
      <div className="max-w-xl">
        <label
          htmlFor="scenario-team-agents"
          className="fb-field-label mb-1 block text-sm text-brand-muted"
        >
          Agents in this team
        </label>
        <MultiSelect
          id="scenario-team-agents"
          values={draft.teamAgentIds}
          onChange={(teamAgentIds) => onChange({ teamAgentIds })}
          options={agentOptions}
          placeholder="Select agents…"
          aria-label="Agents in this team"
        />
      </div>

      {draft.teamAgentIds.length > 0 && (
        <>
          <p className="text-xs text-brand-muted">
            Selected: {draft.teamAgentIds.length} agent(s) · Groups:{" "}
            {roles.join(", ") || "—"} · Total permissions:{" "}
            {inherited.length + draft.extraPermissions.length}
          </p>
          <div>
            <p className="text-xs font-medium text-brand-ink">
              Inherited permissions
            </p>
            {inherited.length > 0 ? (
              <p className="mt-1 font-mono text-xs text-brand-muted">
                {inherited.map((p) => `\`${p}\``).join(", ")}
              </p>
            ) : (
              <p className="mt-1 text-xs text-brand-muted">none</p>
            )}
          </div>
          <div className="max-w-xl">
            <label
              htmlFor="scenario-extra-permissions"
              className="fb-field-label mb-1 block text-sm text-brand-muted"
            >
              Additional permissions
            </label>
            <MultiSelect
              id="scenario-extra-permissions"
              values={draft.extraPermissions}
              onChange={(extraPermissions) => onChange({ extraPermissions })}
              options={permissionOptions}
              placeholder="Select permissions…"
              aria-label="Additional permissions"
            />
          </div>
          <p className="text-xs text-brand-muted">
            Additional permissions are merged with inherited set on save. Edit
            agents in the Agents tab to change inherited permissions.
          </p>
        </>
      )}
    </div>
  );
}

export function ScenarioPipelineTab({
  draft,
  agents,
  onChange,
}: {
  draft: ScenarioDraft;
  agents: AgentRegistryItem[];
  onChange: (pipeline: PipelineStepDraft[]) => void;
}) {
  const agentOptions = [
    { id: "", label: "(any free agent)" },
    ...agents.map((a) => ({ id: a.agent_id, label: a.name })),
  ];

  function updateStep(uid: string, patch: Partial<PipelineStepDraft>) {
    onChange(
      draft.pipeline.map((s) => (s.uid === uid ? { ...s, ...patch } : s)),
    );
  }

  function removeStep(uid: string) {
    const next = draft.pipeline
      .filter((s) => s.uid !== uid)
      .map((s, i) => ({ ...s, step_number: i + 1 }));
    onChange(next.length > 0 ? next : [newStep(1)]);
  }

  function addStep() {
    const n = draft.pipeline.length + 1;
    onChange([
      ...draft.pipeline,
      {
        uid: Math.random().toString(36).slice(2, 10),
        step_number: n,
        name: `Step ${n}`,
        agent_id: null,
        task_type: "general_inquiry",
        expected_latency_ms: 5000,
        expected_quality: 0.85,
        input_tokens: 1000,
        output_tokens: 500,
      },
    ]);
  }

  return (
    <div className="space-y-4">
      {draft.pipeline.map((step, idx) => (
        <details
          key={step.uid}
          open
          className="fb-surface-panel fb-details-panel"
        >
          <summary>
            Step {idx + 1}: {step.name}
          </summary>
          <div className="space-y-3 border-t border-brand-border px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Step name
                <input
                  value={step.name}
                  onChange={(e) => updateStep(step.uid, { name: e.target.value })}
                  className="fb-input mt-1 block w-full"
                />
              </label>
              <SelectField
                label="Task type"
                value={step.task_type}
                onChange={(task_type) => updateStep(step.uid, { task_type })}
                className="w-full min-w-0"
                options={TASK_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Assigned agent"
                value={step.agent_id ?? ""}
                onChange={(v) =>
                  updateStep(step.uid, { agent_id: v || null })
                }
                className="w-full min-w-0"
                options={agentOptions.map((o) => ({
                  value: o.id,
                  label: o.label,
                }))}
              />
              <label className="text-sm">
                Expected quality ({step.expected_quality.toFixed(2)})
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={step.expected_quality}
                  onChange={(e) =>
                    updateStep(step.uid, {
                      expected_quality: Number(e.target.value),
                    })
                  }
                  className="mt-2 w-full"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-sm">
                Input tokens
                <input
                  type="number"
                  min={50}
                  max={50000}
                  step={50}
                  value={step.input_tokens}
                  onChange={(e) =>
                    updateStep(step.uid, {
                      input_tokens: Number(e.target.value),
                    })
                  }
                  className="fb-input mt-1 block w-full"
                />
              </label>
              <label className="text-sm">
                Output tokens
                <input
                  type="number"
                  min={50}
                  max={20000}
                  step={50}
                  value={step.output_tokens}
                  onChange={(e) =>
                    updateStep(step.uid, {
                      output_tokens: Number(e.target.value),
                    })
                  }
                  className="fb-input mt-1 block w-full"
                />
              </label>
              <label className="text-sm">
                Latency (ms)
                <input
                  type="number"
                  min={100}
                  max={60000}
                  step={100}
                  value={step.expected_latency_ms}
                  onChange={(e) =>
                    updateStep(step.uid, {
                      expected_latency_ms: Number(e.target.value),
                    })
                  }
                  className="fb-input mt-1 block w-full"
                />
              </label>
            </div>
            {draft.pipeline.length > 1 && (
              <button
                type="button"
                onClick={() => removeStep(step.uid)}
                className="text-sm text-red-600 hover:underline"
              >
                Remove step
              </button>
            )}
          </div>
        </details>
      ))}
      <button
        type="button"
        onClick={addStep}
        className="fb-add-step-btn"
      >
        + Add step
      </button>
    </div>
  );
}

export function ScenarioCostTab({
  draft,
  onChange,
}: {
  draft: ScenarioDraft;
  onChange: (cost: ScenarioCost) => void;
}) {
  const { est, manualPerTask, manualTotal, roi } = computeCostPreview(
    draft.pipeline,
    draft.cost,
  );
  const stepCount = Math.max(draft.pipeline.length, 1);
  const c = draft.cost;

  function patch(p: Partial<ScenarioCost>) {
    onChange({ ...c, ...p });
  }

  return (
    <div className="fb-surface-panel space-y-6 p-4 sm:p-5">
      <div>
        <h3 className="fb-section-title">Token pricing</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Input price / 1K tokens ($)
            <input
              type="number"
              min={0}
              step={0.0001}
              value={c.price_per_1k_input}
              onChange={(e) =>
                patch({ price_per_1k_input: Number(e.target.value) })
              }
              className="fb-input mt-1 block w-full"
            />
          </label>
          <label className="text-sm">
            Output price / 1K tokens ($)
            <input
              type="number"
              min={0}
              step={0.0001}
              value={c.price_per_1k_output}
              onChange={(e) =>
                patch({ price_per_1k_output: Number(e.target.value) })
              }
              className="fb-input mt-1 block w-full"
            />
          </label>
        </div>
      </div>
      <div>
        <h3 className="fb-section-title">Human baseline</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Human baseline (minutes)
            <input
              type="number"
              min={0.1}
              step={1}
              value={c.human_baseline_minutes}
              onChange={(e) =>
                patch({ human_baseline_minutes: Number(e.target.value) })
              }
              className="fb-input mt-1 block w-full"
            />
          </label>
          <label className="text-sm">
            Manual hourly rate ($/hr)
            <input
              type="number"
              min={0}
              step={5}
              value={c.manual_hourly_cost_usd}
              onChange={(e) =>
                patch({ manual_hourly_cost_usd: Number(e.target.value) })
              }
              className="fb-input mt-1 block w-full"
            />
          </label>
        </div>
      </div>
      <div>
        <h3 className="fb-section-title">GL / cost centre</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Cost centre
            <input
              value={c.cost_center}
              onChange={(e) => patch({ cost_center: e.target.value })}
              placeholder="e.g. technical_support"
              className="fb-input mt-1 block w-full"
            />
          </label>
          <label className="text-sm">
            Ledger account
            <input
              value={c.ledger_account}
              onChange={(e) => patch({ ledger_account: e.target.value })}
              placeholder="e.g. GL_AI_OPS"
              className="fb-input mt-1 block w-full"
            />
          </label>
        </div>
      </div>
      {draft.pipeline.length > 0 ? (
        <>
          <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard compact label="Predicted LLM cost" value={`$${est.toFixed(4)}`} />
            <KpiCard
              compact
              label="Predicted outcome"
              value={`$${manualPerTask.toFixed(2)}`}
            />
            <KpiCard compact label="Cost reduction" value={`${roi}×`} />
            <KpiCard
              compact
              label="Manual baseline"
              value={`${c.human_baseline_minutes.toFixed(0)} min`}
            />
          </KpiGrid>
          <p className="text-xs text-brand-muted">
            Cost reduction matches the scenario library: manual $
            {manualTotal.toFixed(2)} ({stepCount} step
            {stepCount === 1 ? "" : "s"} × ${manualPerTask.toFixed(2)}/task) ÷
            LLM ${est.toFixed(4)}.
          </p>
        </>
      ) : (
        <p className="text-sm text-brand-muted">
          Add pipeline steps to see the live cost estimate.
        </p>
      )}
    </div>
  );
}

function EditPricesModal({
  scenario,
  open,
  onClose,
  onSaved,
}: {
  scenario: ScenarioSummary;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useShell();
  const [cost, setCost] = useState({
    price_per_1k_input: 0.0008,
    price_per_1k_output: 0.004,
    human_baseline_minutes: 60,
    manual_hourly_cost_usd: 75,
    cost_center: "",
    ledger_account: "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    import("@/lib/api").then(({ fetchScenario }) => {
      fetchScenario(scenario.scenario_id).then((d) => {
        if (!cancelled) setCost(d.cost);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, scenario.scenario_id]);

  const manual =
    (cost.human_baseline_minutes / 60) * cost.manual_hourly_cost_usd;

  return (
    <Modal open={open} onClose={onClose} labelledBy="edit-prices-title">
      <ModalHeader
        titleId="edit-prices-title"
        title={`Edit prices — ${scenario.name}`}
        description={scenario.scenario_id}
        onClose={onClose}
      />
      <ModalBody>
        {err ? (
          <div className="mb-3">
            <Alert variant="error">{err}</Alert>
          </div>
        ) : null}
        <div className="mt-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              Input $/1K
              <input
                type="number"
                step={0.0001}
                value={cost.price_per_1k_input}
                onChange={(e) =>
                  setCost({ ...cost, price_per_1k_input: Number(e.target.value) })
                }
                className="fb-input mt-1 block w-full"
              />
            </label>
            <label>
              Output $/1K
              <input
                type="number"
                step={0.0001}
                value={cost.price_per_1k_output}
                onChange={(e) =>
                  setCost({
                    ...cost,
                    price_per_1k_output: Number(e.target.value),
                  })
                }
                className="fb-input mt-1 block w-full"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              Baseline (min)
              <input
                type="number"
                step={1}
                value={cost.human_baseline_minutes}
                onChange={(e) =>
                  setCost({
                    ...cost,
                    human_baseline_minutes: Number(e.target.value),
                  })
                }
                className="fb-input mt-1 block w-full"
              />
            </label>
            <label>
              Hourly rate ($/hr)
              <input
                type="number"
                step={5}
                value={cost.manual_hourly_cost_usd}
                onChange={(e) =>
                  setCost({
                    ...cost,
                    manual_hourly_cost_usd: Number(e.target.value),
                  })
                }
                className="fb-input mt-1 block w-full"
              />
            </label>
          </div>
          <p className="text-brand-muted">
            Computed manual cost / task: ${manual.toFixed(2)}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label>
              Cost centre
              <input
                value={cost.cost_center}
                onChange={(e) =>
                  setCost({ ...cost, cost_center: e.target.value })
                }
                className="fb-input mt-1 block w-full"
              />
            </label>
            <label>
              Ledger account
              <input
                value={cost.ledger_account}
                onChange={(e) =>
                  setCost({ ...cost, ledger_account: e.target.value })
                }
                className="fb-input mt-1 block w-full"
              />
            </label>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className="fb-btn flex-1">
          Cancel
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            setErr(null);
            try {
              const { patchScenarioCost } = await import("@/lib/api");
              await patchScenarioCost(scenario.scenario_id, cost);
              showToast(`Prices updated for “${scenario.name}”.`);
              onSaved();
              onClose();
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Save failed");
            } finally {
              setLoading(false);
            }
          }}
          className="fb-btn-primary flex-1"
        >
          Save
        </button>
      </ModalFooter>
    </Modal>
  );
}

export function ScenarioLibrary({
  library,
  canWrite,
  onLoad,
  onRefresh,
}: {
  library: ScenarioSummary[];
  canWrite: boolean;
  onLoad: (id: string) => void;
  onRefresh: () => void;
}) {
  const { showToast } = useShell();
  const [priceEdit, setPriceEdit] = useState<ScenarioSummary | null>(null);
  const [statusPick, setStatusPick] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<ScenarioSummary | null>(
    null,
  );
  const [deletingScenario, setDeletingScenario] = useState(false);

  if (library.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No saved scenarios. Configure and save above.
      </p>
    );
  }

  return (
    <>
      <DataTable>
        <DataTableHead>
          <tr>
            <th className="fb-data-table-cell">Name</th>
            <th className="fb-data-table-cell">Status</th>
            <th className="fb-data-table-cell text-right">Steps</th>
            <th className="fb-data-table-cell text-right">Agents</th>
            <th className="fb-data-table-cell text-right">Est. cost</th>
            <th className="fb-data-table-cell text-right">ROI</th>
            <th className="fb-data-table-cell">Updated</th>
          </tr>
        </DataTableHead>
        <DataTableBody>
          {library.map((sc) => (
            <DataTableRow key={sc.scenario_id}>
              <DataTableCell className="font-medium">{sc.name}</DataTableCell>
              <DataTableCell>{sc.status}</DataTableCell>
              <DataTableCell align="right">{sc.step_count}</DataTableCell>
              <DataTableCell align="right">{sc.agent_count}</DataTableCell>
              <DataTableCell align="right">
                ${sc.estimated_cost_usd.toFixed(4)}
              </DataTableCell>
              <DataTableCell align="right">
                {sc.roi_multiplier.toFixed(0)}×
              </DataTableCell>
              <DataTableCell className="text-brand-muted">
                {formatScenarioUpdatedAt(sc.updated_at)}
              </DataTableCell>
            </DataTableRow>
          ))}
        </DataTableBody>
      </DataTable>

      <div className="mt-6 space-y-3">
        {library.map((sc) => {
          const nextStatuses = SCENARIO_STATUS_OPTIONS.filter(
            (s) => s !== sc.status,
          );
          return (
            <details
              key={sc.scenario_id}
              className="fb-surface-panel fb-details-panel"
            >
              <summary>
                <span className="font-medium">{sc.name}</span>
                <span className="ml-2 text-xs text-brand-muted">[{sc.status}]</span>
              </summary>
              <div className="border-t border-brand-border px-4 py-4">
                {sc.description && (
                  <p className="mb-3 text-sm text-brand-muted">{sc.description}</p>
                )}
                <div className="mb-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>Steps: {sc.step_count}</div>
                  <div>Agents: {sc.agent_count}</div>
                  <div>Est: ${sc.estimated_cost_usd.toFixed(4)}</div>
                  <div>ROI: {sc.roi_multiplier.toFixed(0)}×</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onLoad(sc.scenario_id)}
                    className="fb-btn text-xs"
                  >
                    Load & edit
                  </button>
                  {canWrite && (
                    <>
                      <button
                        type="button"
                        onClick={() => setPriceEdit(sc)}
                        className="fb-btn text-xs"
                      >
                        Edit prices
                      </button>
                      {nextStatuses.length > 0 && (
                        <>
                          <Select
                            size="sm"
                            value={
                              statusPick[sc.scenario_id] ?? nextStatuses[0]
                            }
                            onChange={(v) =>
                              setStatusPick({
                                ...statusPick,
                                [sc.scenario_id]: v,
                              })
                            }
                            className="min-w-[7rem]"
                            options={nextStatuses.map((s) => ({
                              value: s,
                              label: s,
                            }))}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const { updateScenarioStatus } = await import(
                                "@/lib/api"
                              );
                              await updateScenarioStatus(
                                sc.scenario_id,
                                statusPick[sc.scenario_id] ?? nextStatuses[0],
                              );
                              showToast(
                                `Scenario “${sc.name}” status updated.`,
                              );
                              onRefresh();
                            }}
                            className="fb-btn text-xs"
                          >
                            Update status
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(sc)}
                        className="fb-btn text-xs border-[var(--alert-error-border)] text-[var(--alert-error-text)] hover:bg-[var(--alert-error-bg)]"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </details>
          );
        })}
      </div>

      {priceEdit && (
        <EditPricesModal
          scenario={priceEdit}
          open={!!priceEdit}
          onClose={() => setPriceEdit(null)}
          onSaved={onRefresh}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => {
          if (deletingScenario) return;
          setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (!deleteTarget) return;
          void (async () => {
            setDeletingScenario(true);
            try {
              const { deleteScenario } = await import("@/lib/api");
              await deleteScenario(deleteTarget.scenario_id);
              showToast(`Scenario “${deleteTarget.name}” deleted.`);
              setDeleteTarget(null);
              onRefresh();
            } finally {
              setDeletingScenario(false);
            }
          })();
        }}
        title={
          deleteTarget
            ? `Delete scenario "${deleteTarget.name}"?`
            : "Delete scenario?"
        }
        description="This cannot be undone. Saved pipeline, team, and cost configuration will be permanently removed."
        confirmLabel="Delete scenario"
        loadingLabel="Deleting…"
        loading={deletingScenario}
        destructive
        titleId="sb-delete-scenario-title"
      />
    </>
  );
}

export function ScenarioSavePanel({
  draft,
  canWrite,
  saving,
  message,
  onChange,
  onSave,
  onNew,
}: {
  draft: ScenarioDraft;
  canWrite: boolean;
  saving: boolean;
  message: string | null;
  onChange: (patch: Partial<ScenarioDraft>) => void;
  onSave: () => void;
  onNew: () => void;
}) {
  return (
    <div className="fb-surface-panel p-4 sm:p-5">
      <h3 className="fb-section-title">Save scenario</h3>
      <p className="mt-1 text-xs text-brand-muted">
        {draft.editingId ? (
          <>
            Updating saved scenario{" "}
            <code className="text-xs">{draft.editingId}</code>
          </>
        ) : (
          "New scenario — not saved yet."
        )}
      </p>

      <div className="mt-5">
        <ScenarioSaveDetails
          draft={draft}
          onChange={onChange}
          disabled={!canWrite}
        />
      </div>

      {message && (
        <p
          className="mt-4 text-sm text-[var(--alert-error-text)]"
          role="alert"
        >
          {message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        {canWrite && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="fb-btn-primary disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
        {canWrite ? (
          <button
            type="button"
            onClick={openGenerateRequest}
            className="fb-btn shadow-sm"
          >
            Generate request
          </button>
        ) : null}
        {draft.editingId && (
          <button
            type="button"
            onClick={onNew}
            className="fb-btn"
          >
            New scenario
          </button>
        )}
      </div>
    </div>
  );
}
