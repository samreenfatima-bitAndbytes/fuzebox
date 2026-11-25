"use client";

import { FormEvent, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FormField, FormTextarea } from "@/components/ui/FormField";
import { PageSection } from "@/components/ui/PageSection";
import { SelectField } from "@/components/ui/Select";
import {
  DEFAULT_COST_IN,
  DEFAULT_COST_OUT,
  MODEL_OPTIONS,
  PERMISSION_OPTIONS,
  SKILL_OPTIONS,
  STATUS_OPTIONS,
} from "@/lib/constants";
import type { AgentDetail, AgentWriteBody } from "@/lib/types";

export type AgentFormValues = AgentWriteBody;

type AgentFormProps = {
  mode: "create" | "edit";
  initial?: AgentDetail;
  canWrite: boolean;
  /** Drop outer card chrome when embedded in a modal */
  embedded?: boolean;
  onSubmit: (values: AgentFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
};

function mergeOptions(known: readonly string[], selected: string[]): string[] {
  const extra = selected.filter((s) => !known.includes(s));
  return [...known, ...extra];
}

function ChipToggle({
  label,
  selected,
  disabled,
  onToggle,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={[
        "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        selected
          ? "border-[var(--nav-active-border)] bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]"
          : "border-brand-border text-brand-muted hover:border-brand-primary/40 hover:text-brand-ink",
        disabled && "cursor-not-allowed opacity-60",
      ].join(" ")}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={selected}
        disabled={disabled}
        onChange={onToggle}
      />
      {label}
    </label>
  );
}

export function AgentForm({
  mode,
  initial,
  canWrite,
  embedded = false,
  onSubmit,
  onDelete,
  onCancel,
}: AgentFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [group, setGroup] = useState(initial?.group ?? "");
  const [modelName, setModelName] = useState(
    initial?.model_name ?? MODEL_OPTIONS[0],
  );
  const [status, setStatus] = useState(initial?.status ?? "active");
  const [costIn, setCostIn] = useState(
    initial?.cost_per_1k_input ?? DEFAULT_COST_IN,
  );
  const [costOut, setCostOut] = useState(
    initial?.cost_per_1k_output ?? DEFAULT_COST_OUT,
  );
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? []);
  const [permissions, setPermissions] = useState<string[]>(
    initial?.permissions ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const skillOptions = mergeOptions(SKILL_OPTIONS, skills);
  const permOptions = mergeOptions(PERMISSION_OPTIONS, permissions);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        name,
        description,
        group,
        model_name: modelName,
        cost_per_1k_input: costIn,
        cost_per_1k_output: costOut,
        skills,
        permissions,
        status: mode === "create" ? "active" : status,
      });
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setLoading(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!onDelete || !canWrite) return;
    setError(null);
    setDeleting(true);
    try {
      await onDelete();
      setDeleteOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  function toggleInList(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((x) => x !== value)
      : [...list, value];
  }

  const modelSelectOptions = [
    ...MODEL_OPTIONS.map((m) => ({ value: m, label: m })),
    ...(!MODEL_OPTIONS.includes(modelName as (typeof MODEL_OPTIONS)[number])
      ? [{ value: modelName, label: modelName }]
      : []),
  ];

  return (
    <div className={embedded ? "min-w-0" : "fb-card-accent-top max-w-3xl"}>
      <form onSubmit={handleSubmit} className="divide-y divide-brand-border">
        {mode === "edit" && initial && (
          <div className="border-b border-brand-border bg-gradient-to-r from-[color-mix(in_srgb,var(--brand-primary)_6%,var(--surface-muted))] to-[var(--surface-muted)] px-4 py-3 sm:px-6">
            <p className="fb-text-caption">Agent ID</p>
            <p className="mt-0.5 font-mono text-sm text-brand-ink">
              {initial.agent_id}
            </p>
          </div>
        )}

        <div className="space-y-8 p-4 sm:p-6">
          <PageSection
            title="Identity"
            subtitle="Name, description, and team grouping for the registry."
            unstyled
          >
            <div className="space-y-4">
              <FormField
                id="agent-name"
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={!canWrite}
                placeholder="e.g. Billing Agent"
              />
              <FormTextarea
                id="agent-description"
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canWrite}
                placeholder="What does this agent do?"
              />
              <FormField
                id="agent-group"
                label="Group"
                hint="Used for Tasks scorecard filters and fleet comparisons."
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                disabled={!canWrite}
                placeholder="e.g. billing, pipeline, general"
              />
            </div>
          </PageSection>

          <PageSection
            title="Model & cost"
            subtitle="Default model and per-1K token rates for economics."
            unstyled
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Model"
                value={modelName}
                onChange={setModelName}
                disabled={!canWrite}
                className="w-full"
                options={modelSelectOptions}
              />
              {mode === "edit" && (
                <SelectField
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  disabled={!canWrite}
                  className="w-full"
                  options={STATUS_OPTIONS.map((s) => ({
                    value: s,
                    label: s,
                  }))}
                />
              )}
              <FormField
                id="agent-cost-in"
                label="Cost / 1K input ($)"
                type="number"
                min={0}
                step={0.0001}
                value={costIn}
                onChange={(e) => setCostIn(parseFloat(e.target.value) || 0)}
                disabled={!canWrite}
              />
              <FormField
                id="agent-cost-out"
                label="Cost / 1K output ($)"
                type="number"
                min={0}
                step={0.0001}
                value={costOut}
                onChange={(e) => setCostOut(parseFloat(e.target.value) || 0)}
                disabled={!canWrite}
              />
            </div>
          </PageSection>

          <PageSection
            title="Skills"
            subtitle="Capabilities this agent can use in workflows."
            unstyled
          >
            <div className="flex flex-wrap gap-2">
              {skillOptions.map((skill) => (
                <ChipToggle
                  key={skill}
                  label={skill}
                  selected={skills.includes(skill)}
                  disabled={!canWrite}
                  onToggle={() => setSkills(toggleInList(skills, skill))}
                />
              ))}
            </div>
          </PageSection>

          <PageSection
            title="Permissions"
            subtitle="Policy gates applied to this agent."
            unstyled
          >
            <div className="flex flex-wrap gap-2">
              {permOptions.map((perm) => (
                <ChipToggle
                  key={perm}
                  label={perm}
                  selected={permissions.includes(perm)}
                  disabled={!canWrite}
                  onToggle={() =>
                    setPermissions(toggleInList(permissions, perm))
                  }
                />
              ))}
            </div>
          </PageSection>

          {error && (
            <Alert variant="error" role="alert">
              {error}
            </Alert>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-[var(--surface-muted)] px-4 py-4 sm:px-6">
          {canWrite && (
            <button
              type="submit"
              disabled={loading || deleting}
              className="fb-btn-primary disabled:opacity-60"
            >
              {loading
                ? "Saving…"
                : mode === "create"
                  ? "Create agent"
                  : "Save changes"}
            </button>
          )}
          <button type="button" onClick={onCancel} className="fb-btn">
            {canWrite ? "Cancel" : "Back to registry"}
          </button>
          {mode === "edit" && onDelete && canWrite && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={loading || deleting}
              className="fb-btn ml-auto border-[var(--alert-error-border)] text-[var(--alert-error-text)] disabled:opacity-60"
            >
              Delete agent
            </button>
          )}
        </div>
      </form>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => void handleDeleteConfirm()}
        title={`Delete agent "${name}"?`}
        description="This cannot be undone. The agent will be removed from the registry and scenario teams."
        confirmLabel="Delete agent"
        loadingLabel="Deleting…"
        loading={deleting}
        destructive
        titleId="delete-agent-title"
      />
    </div>
  );
}
