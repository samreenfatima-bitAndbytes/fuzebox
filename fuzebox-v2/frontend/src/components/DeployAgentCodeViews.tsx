"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DeployWorkflowModal,
  deploymentToWorkflowExec,
  type WorkflowExecution,
} from "@/components/DeployWorkflowModal";
import { useShell } from "@/components/ShellProvider";
import { FormField } from "@/components/ui/FormField";
import { RenderMarkdown } from "@/lib/render-markdown";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { PageChip } from "@/components/ui/PageChip";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import { Select } from "@/components/ui/Select";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { useShellScrollChain } from "@/lib/scroll-chain";
import {
  CLASSIFICATION_OPTIONS,
  LANG_LABELS,
  SAMPLE_CODE,
  buildDeploymentStats,
  runDeploy,
  runValidate,
  validationTone,
  type CodeLanguage,
  type DeployAgentCodeData,
} from "@/lib/deploy-agent-code";
import type {
  DeploymentRow,
  DeploymentValidateResult,
} from "@/lib/types";

const TOP_TABS = [
  { id: "deploy-code" as const, label: "Deploy Code" },
  { id: "recursive-training" as const, label: "Recursive Training" },
];

const DEFAULT_TRUST_TIER = "T0_unverified";

type TrainingExecStatus = "running" | "completed" | "failed" | "awaiting_human";

function deploymentExecStatus(status: string): TrainingExecStatus {
  if (status === "training") return "running";
  if (status === "deployed") return "completed";
  if (status === "retired") return "failed";
  return "awaiting_human";
}

function trainingStatusLabel(status: TrainingExecStatus): string {
  return status.replace(/_/g, " ");
}

function trainingStatusClass(status: TrainingExecStatus): string {
  if (status === "completed") return "text-[var(--alert-success-text)]";
  if (status === "running") return "text-brand-primary";
  if (status === "failed") return "text-[var(--alert-error-text)]";
  return "text-[var(--alert-warning-text)]";
}

function RecursiveTrainingPanel({
  deployments,
}: {
  deployments: DeploymentRow[];
}) {
  const [openExec, setOpenExec] = useState<WorkflowExecution | null>(null);

  const counts = useMemo(() => {
    const statuses = deployments.map((d) => deploymentExecStatus(d.status));
    return {
      running: statuses.filter((s) => s === "running").length,
      completed: statuses.filter((s) => s === "completed").length,
      failed: statuses.filter((s) => s === "failed").length,
      awaitingHuman: statuses.filter((s) => s === "awaiting_human").length,
    };
  }, [deployments]);

  return (
    <>
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-brand-ink">Orchestrator</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Runtime execution engine for governed AI workflows.
        </p>
      </div>

      <KpiGrid className="grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Running" value={String(counts.running)} tone="neutral" />
        <KpiCard
          label="Completed"
          value={String(counts.completed)}
          tone="positive"
        />
        <KpiCard label="Failed" value={String(counts.failed)} tone="caution" />
        <KpiCard
          label="Awaiting human"
          value={String(counts.awaitingHuman)}
          tone="neutral"
        />
      </KpiGrid>

      <ChartPanel
        title="Deployed agents"
        subtitle="Recursive training status per deployment."
      >
        {deployments.length === 0 ? (
          <p className="text-sm text-brand-muted">
            No deployments yet — deploy your first agent on the Deploy Code tab.
          </p>
        ) : (
          <ul className="divide-y divide-brand-border">
            {deployments.map((d) => {
              const execStatus = deploymentExecStatus(d.status);
              return (
                <li
                  key={d.deploymentId}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-ink">{d.name}</p>
                    <p className="mt-0.5 break-words font-mono text-xs text-brand-muted">
                      {d.deploymentId} · {d.classification} · depth{" "}
                      {d.recursiveDepth} · {formatWhen(d.publishedAt)}
                    </p>
                  </div>
                  <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
                    <span
                      className={`text-xs font-medium capitalize ${trainingStatusClass(execStatus)}`}
                    >
                      {trainingStatusLabel(execStatus)}
                    </span>
                    <button
                      type="button"
                      className="fb-btn text-xs"
                      onClick={() => setOpenExec(deploymentToWorkflowExec(d))}
                    >
                      Open workflow →
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </ChartPanel>
    </div>
    <DeployWorkflowModal exec={openExec} onClose={() => setOpenExec(null)} />
    </>
  );
}

const LANG_OPTIONS = (["json", "crewai", "python"] as CodeLanguage[]).map(
  (id) => ({ value: id, label: LANG_LABELS[id] }),
);

function ValidationBadge({
  validation,
  prominent = false,
  validating = false,
}: {
  validation: DeploymentValidateResult | null | undefined;
  prominent?: boolean;
  validating?: boolean;
}) {
  if (validating) {
    return (
      <span className="fb-dep-validation-pill border border-brand-border bg-[var(--surface-muted)] text-brand-muted">
        Validating…
      </span>
    );
  }

  if (!validation) return null;

  const tone = validationTone(validation.validationStatus);
  const status = validation.validationStatus;

  if (prominent) {
    const pillTone =
      tone === "ok" ? "valid" : tone === "warn" ? "warn" : tone === "fail" ? "fail" : "";
    return (
      <span
        className={[
          "fb-dep-validation-pill",
          pillTone ? `fb-dep-validation-pill--${pillTone}` : "border border-brand-border text-brand-muted",
        ].join(" ")}
        role="status"
      >
        {pillTone ? <span className="fb-dep-validation-dot" aria-hidden /> : null}
        {status}
      </span>
    );
  }

  const className =
    tone === "ok"
      ? "text-[var(--alert-success-text)]"
      : tone === "warn"
        ? "text-[var(--alert-warning-text)]"
        : tone === "fail"
          ? "text-[var(--alert-error-text)]"
          : "text-brand-muted";
  return (
    <span className={`text-xs font-medium capitalize ${className}`}>
      {status}
    </span>
  );
}

function DeploySectionCard({
  kicker,
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={["fb-section min-w-0", className].join(" ")}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {kicker ? (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
              {kicker}
            </p>
          ) : null}
          <h3 className="fb-section-title">{title}</h3>
          {subtitle ? (
            <p className="mt-1 text-sm leading-relaxed text-brand-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function PreviewStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border border-brand-border bg-[var(--surface-muted)] p-3",
        highlight ? "fb-dep-preview-stat--valid" : "",
      ].join(" ")}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold capitalize text-brand-ink">
        {value}
      </div>
    </div>
  );
}

function DeploymentPreviewPanel({
  previewDep,
  validation,
  validating,
}: {
  previewDep: DeploymentRow | null;
  validation: DeploymentValidateResult | null;
  validating: boolean;
}) {
  const previewAction = previewDep ? (
    <PageChip variant="muted" className="text-[var(--alert-success-text)]">
      deployed
    </PageChip>
  ) : (
    <PageChip variant="muted">live preview</PageChip>
  );

  return (
    <DeploySectionCard
      kicker="Preview"
      title={previewDep ? previewDep.name : "Deployment Preview"}
      action={previewAction}
    >
      {!previewDep && validation ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <PreviewStat label="Detected kind" value={validation.agentKind} />
            <PreviewStat
              label="Validation"
              highlight={validation.validationStatus === "valid"}
              value={
                <ValidationBadge validation={validation} prominent />
              }
            />
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
              Parsed manifest (live)
            </p>
            <pre className="max-h-[260px] overflow-auto rounded-lg border border-brand-border bg-[var(--surface-muted)] p-3 font-mono text-[11px] leading-relaxed text-brand-ink">
              {JSON.stringify(validation.manifest, null, 2)}
            </pre>
          </div>
          {validation.validationNotes ? (
            <p
              className={`text-xs ${
                validationTone(validation.validationStatus) === "fail"
                  ? "text-[var(--alert-error-text)]"
                  : validationTone(validation.validationStatus) === "warn"
                    ? "text-[var(--alert-warning-text)]"
                    : "text-brand-muted"
              }`}
            >
              {validating ? "Validating… " : ""}
              {validation.validationNotes}
            </p>
          ) : validating ? (
            <p className="text-xs text-brand-muted">Validating…</p>
          ) : null}
          <p className="border-t border-brand-border pt-3 text-xs text-brand-muted">
            Hit <strong className="text-brand-ink">Deploy agent</strong> to sign
            this code and generate the full UoP instructions block.
          </p>
        </div>
      ) : null}

      {previewDep ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <PreviewStat label="Agent kind" value={previewDep.agentKind} />
            <PreviewStat
              label="Trust tier"
              value={previewDep.trustTier.replace(/_/g, " · ")}
            />
            <PreviewStat
              label="RoP target"
              value={`${previewDep.ropTarget.toFixed(2)}×`}
            />
            <PreviewStat
              label="Classification"
              value={previewDep.classification}
            />
            <PreviewStat
              label="Recursive depth"
              value={`${previewDep.recursiveDepth} levels`}
            />
            <PreviewStat
              label="Inherits from UoP"
              value={previewDep.reuseFromUop ?? "Greenfield"}
            />
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
              Parsed manifest
            </p>
            <pre className="max-h-[200px] overflow-auto rounded-lg border border-brand-border bg-[var(--surface-muted)] p-3 font-mono text-[11px] leading-relaxed text-brand-ink">
              {previewDep.manifestJson}
            </pre>
          </div>
          <p className="border-t border-brand-border pt-3 font-mono text-[11px] text-brand-muted">
            {previewDep.signature}
          </p>
        </div>
      ) : null}

      {!previewDep && !validation ? (
        <p className="py-8 text-center text-sm text-brand-muted">
          Paste or upload agent code to see detected kind, validation, and parsed
          manifest.
        </p>
      ) : null}
    </DeploySectionCard>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function HistoryTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: DeploymentRow[];
  selectedId?: string | null;
  onSelect?: (d: DeploymentRow) => void;
}) {
  const scrollRef = useShellScrollChain();

  if (rows.length === 0) {
    return (
      <p className="text-sm text-brand-muted">No deployments yet.</p>
    );
  }

  return (
    <div ref={scrollRef} className="fb-cov-table-scroll">
      <DataTable className="shadow-none">
          <DataTableHead>
            <tr>
              <th className="fb-data-table-cell">Name</th>
              <th className="fb-data-table-cell">Kind</th>
              <th className="fb-data-table-cell">Language</th>
              <th className="fb-data-table-cell">Trust</th>
              <th className="fb-data-table-cell">Validation</th>
              <th className="fb-data-table-cell">Deployed</th>
              <th className="fb-data-table-cell">Signature</th>
            </tr>
          </DataTableHead>
          <DataTableBody>
            {rows.map((d) => (
              <DataTableRow
                key={d.deploymentId}
                className={
                  onSelect
                    ? `cursor-pointer transition-colors hover:bg-[var(--surface-muted)] ${
                        selectedId === d.deploymentId
                          ? "bg-[var(--surface-muted)]"
                          : ""
                      }`
                    : undefined
                }
                onClick={onSelect ? () => onSelect(d) : undefined}
              >
                <DataTableCell>
                  <div className="text-sm font-medium text-brand-ink">{d.name}</div>
                  <div className="font-mono text-xs text-brand-muted">
                    {d.deploymentId}
                  </div>
                </DataTableCell>
                <DataTableCell className="text-xs capitalize">
                  {d.agentKind}
                </DataTableCell>
                <DataTableCell className="text-xs uppercase">
                  {d.codeLanguage}
                </DataTableCell>
                <DataTableCell className="text-xs">{d.trustTier}</DataTableCell>
                <DataTableCell>
                  <ValidationBadge
                    validation={{
                      agentKind: d.agentKind,
                      manifest: {},
                      validationStatus: d.validationStatus,
                      validationNotes: d.validationNotes ?? "",
                    }}
                  />
                </DataTableCell>
                <DataTableCell className="text-xs text-brand-muted">
                  {formatWhen(d.publishedAt)}
                </DataTableCell>
                <DataTableCell className="font-mono text-xs text-brand-muted">
                  {d.signature.slice(0, 24)}…
                </DataTableCell>
              </DataTableRow>
            ))}
        </DataTableBody>
      </DataTable>
    </div>
  );
}

type DeployAgentCodeDashboardProps = {
  data: DeployAgentCodeData;
  onDeployed: () => void;
};

export function DeployAgentCodeDashboard({
  data,
  onDeployed,
}: DeployAgentCodeDashboardProps) {
  const { showToast } = useShell();
  const [topTab, setTopTab] =
    useState<(typeof TOP_TABS)[number]["id"]>("deploy-code");
  const [language, setLanguage] = useState<CodeLanguage>("json");
  const [code, setCode] = useState(SAMPLE_CODE.json);
  const [name, setName] = useState("Pricing Optimizer");
  const [classification, setClassification] = useState("AI-Primary");
  const [ropTarget, setRopTarget] = useState("4.0");
  const [recursiveDepth, setRecursiveDepth] = useState("3");
  const [reuseFromUop, setReuseFromUop] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [validation, setValidation] = useState<DeploymentValidateResult | null>(
    null,
  );
  const [validating, setValidating] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [activeDeployment, setActiveDeployment] = useState<DeploymentRow | null>(
    null,
  );
  const validateSeq = useRef(0);

  const stats = useMemo(
    () => buildDeploymentStats(data.deployments),
    [data.deployments],
  );

  const uopOptions = useMemo(
    () => [
      { value: "", label: "Greenfield · no inheritance" },
      ...data.uopEntries.map((u) => ({
        value: u.uopId,
        label: `${u.name} · RoP ${u.ropValue.toFixed(2)}×`,
      })),
    ],
    [data.uopEntries],
  );

  useEffect(() => {
    if (!code.trim()) {
      setValidation(null);
      return;
    }
    const seq = ++validateSeq.current;
    setValidating(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await runValidate(language, code);
        if (seq !== validateSeq.current) return;
        setValidation(result);
      } catch {
        if (seq !== validateSeq.current) return;
        setValidation(null);
      } finally {
        if (seq === validateSeq.current) setValidating(false);
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [language, code]);

  const handleLanguageChange = useCallback((value: string) => {
    const lang = value as CodeLanguage;
    setLanguage(lang);
    setCode(SAMPLE_CODE[lang]);
  }, []);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setCode(String(e.target?.result ?? ""));
    reader.readAsText(file);
  }, []);

  const handleDeploy = useCallback(async () => {
    if (!name.trim() || !code.trim()) {
      setDeployError("Name and code are required.");
      return;
    }
    if (validation?.validationStatus === "errors") {
      setDeployError(validation.validationNotes || "Fix validation errors first.");
      return;
    }
    setDeploying(true);
    setDeployError(null);
    try {
      const dep = await runDeploy({
        name: name.trim(),
        codeLanguage: language,
        rawCode: code,
        classification,
        trustTier: DEFAULT_TRUST_TIER,
        ropTarget: Number(ropTarget) || 3,
        recursiveDepth: Number(recursiveDepth) || 2,
        reuseFromUop: reuseFromUop || null,
        webhookUrl: webhookUrl.trim() || null,
      });
      setActiveDeployment(dep);
      showToast(`Deployment “${dep.name}” created.`);
      onDeployed();
    } catch (err) {
      setDeployError(
        err instanceof Error ? err.message : "Deployment failed.",
      );
    } finally {
      setDeploying(false);
    }
  }, [
    name,
    code,
    language,
    classification,
    ropTarget,
    recursiveDepth,
    reuseFromUop,
    webhookUrl,
    validation,
    onDeployed,
    showToast,
  ]);

  const preview = activeDeployment;
  const cleanPct =
    stats.total > 0 ? `${Math.round((stats.valid / stats.total) * 100)}%` : "—";

  return (
    <div className="space-y-6">
      <PageTabs tabs={TOP_TABS} active={topTab} onChange={setTopTab} />

      {topTab === "recursive-training" ? (
        <PageTabPanel
          id="panel-recursive-training"
          labelledBy="tab-recursive-training"
        >
          <RecursiveTrainingPanel deployments={data.deployments} />
        </PageTabPanel>
      ) : (
        <PageTabPanel id="panel-deploy-code" labelledBy="tab-deploy-code">
        <p className="mb-5 max-w-3xl text-sm leading-relaxed text-brand-muted">
          Deploy a JSON agent manifest, a CrewAI program, or a generic Python agent.
          Every submission is parsed, validated, signed, and rendered into UoP
          instructions — with a recursive training profile bound to the trust tier
          you select.
        </p>

        <KpiGrid className="grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Deployments"
            value={String(stats.total)}
            sub={`${stats.valid} valid · ${stats.warnings} warnings · ${stats.errors} errors`}
            iconTone="blue"
          />
          <KpiCard
            label="Clean validations"
            value={cleanPct}
            sub="parsed without warnings"
            tone="positive"
          />
          <KpiCard
            label="UoP inherited"
            value={String(stats.inherited)}
            sub="bootstrapping from published UoP"
            tone="caution"
          />
          <KpiCard
            label="Library entries"
            value={String(data.uopEntries.length)}
            sub="reusable economic primitives"
            tone="neutral"
          />
        </KpiGrid>

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <div className="min-w-0 space-y-5">
            <DeploySectionCard
              kicker="Step 1 — Source"
              title="Code source"
              subtitle="Choose format, paste or upload agent code."
              action={
                <label className="fb-btn cursor-pointer text-xs">
                  Upload file
                  <input
                    type="file"
                    accept=".json,.py,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFile(f);
                    }}
                  />
                </label>
              }
            >
              <Select
                value={language}
                onChange={handleLanguageChange}
                options={LANG_OPTIONS}
                aria-label="Code language"
              />
              <div className="mt-3 overflow-hidden rounded-lg border border-brand-border">
                <div className="flex items-center justify-between border-b border-brand-border bg-[var(--surface-muted)] px-3 py-2 text-xs text-brand-muted">
                  <span className="font-medium text-brand-ink">{LANG_LABELS[language]}</span>
                  <ValidationBadge
                    validation={validation}
                    prominent
                    validating={validating}
                  />
                </div>
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  spellCheck={false}
                  className="min-h-[320px] w-full resize-y border-0 bg-transparent p-3 font-mono text-xs leading-relaxed focus:outline-none focus:ring-0"
                />
              </div>
            </DeploySectionCard>

            <DeploySectionCard
              kicker="Step 2 — Configure"
              title="Deployment profile"
              subtitle="RoP, depth, and optional UoP inheritance."
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  id="dep-name"
                  label="Deployment name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="space-y-1.5">
                  <label className="fb-field-label" htmlFor="dep-class">
                    Classification
                  </label>
                  <Select
                    id="dep-class"
                    value={classification}
                    onChange={setClassification}
                    options={CLASSIFICATION_OPTIONS}
                  />
                </div>
                <FormField
                  id="dep-rop"
                  label="RoP target (×)"
                  type="number"
                  step="0.1"
                  min="1"
                  max="10"
                  value={ropTarget}
                  onChange={(e) => setRopTarget(e.target.value)}
                />
                <FormField
                  id="dep-depth"
                  label="Recursive depth"
                  type="number"
                  min="1"
                  max="6"
                  value={recursiveDepth}
                  onChange={(e) => setRecursiveDepth(e.target.value)}
                />
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="fb-field-label" htmlFor="dep-uop">
                    Inherit from UoP (optional)
                  </label>
                  <Select
                    id="dep-uop"
                    value={reuseFromUop}
                    onChange={setReuseFromUop}
                    options={uopOptions}
                  />
                </div>
              </div>

              {deployError ? (
                <p className="mt-3 text-xs text-[var(--alert-error-text)]" role="alert">
                  {deployError}
                </p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-xs text-brand-muted">
                  Submission is parsed, signed, and registered in the agent roster.
                </p>
                <button
                  type="button"
                  className="fb-btn-primary"
                  disabled={
                    deploying || validation?.validationStatus === "errors"
                  }
                  onClick={() => void handleDeploy()}
                >
                  {deploying ? "Deploying…" : "Deploy agent"}
                </button>
              </div>
            </DeploySectionCard>
          </div>

          <div className="min-w-0 space-y-5">
            <DeploymentPreviewPanel
              previewDep={preview}
              validation={validation}
              validating={validating}
            />

            <DeploySectionCard
              kicker="Recursive training"
              title="UoP instructions"
              subtitle="Generated for new agents, tasks, and workflows."
              action={
                preview ? (
                  <PageChip variant="muted">{preview.deploymentId}</PageChip>
                ) : (
                  <PageChip variant="muted">awaiting deploy</PageChip>
                )
              }
            >
              {preview?.uopInstructions ? (
                <>
                  <div className="max-h-[320px] overflow-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-4 text-brand-ink">
                    <RenderMarkdown text={preview.uopInstructions} />
                  </div>
                  <div className="mt-3 space-y-1 text-xs text-brand-muted">
                    <p>
                      <span className="text-brand-ink">Deployment:</span>{" "}
                      {preview.deploymentId}
                    </p>
                    <p>
                      <span className="text-brand-ink">Signature:</span>{" "}
                      <span className="font-mono">{preview.signature}</span>
                    </p>
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-brand-muted">
                  The full UoP instructions render here after deploy — including
                  the three-loop recursive training profile, bootstrapping
                  sequence, governance constraints, and library pathway.
                </p>
              )}
            </DeploySectionCard>
          </div>
        </div>

        <DeploySectionCard
          kicker="History"
          title="Deployment history"
          subtitle="Parsed, signed, and registered agent submissions."
          action={
            data.deployments.length > 0 ? (
              <PageChip variant="muted">
                {data.deployments.length} total
              </PageChip>
            ) : undefined
          }
          className="mt-6"
        >
          <HistoryTable
            rows={data.deployments}
            selectedId={activeDeployment?.deploymentId}
            onSelect={setActiveDeployment}
          />
        </DeploySectionCard>
        </PageTabPanel>
      )}
    </div>
  );
}
