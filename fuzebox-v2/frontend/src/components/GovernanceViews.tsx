"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { useShell } from "@/components/ShellProvider";
import { FilterChipGroup } from "@/components/ui/FilterChipGroup";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/Modal";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
} from "@/components/ui/DataTable";
import { ApiError } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  addReviewGate,
  buildGapStats,
  createApiKey,
  EMPTY_RULE_FORM,
  filterGaps,
  pct,
  revokeApiKey,
  ruleDisplayStatus,
  setRuleActive,
  setRuleEnforcement,
  submitNewRule,
  violationReviewHref,
  violationReviewLabel,
  type RuleCreateForm,
} from "@/lib/governance-pages";
import type {
  ApiKeyCreateResponse,
  ApiKeyRow,
  GovernanceCoverageRow,
  GovernanceGapRow,
  GovernanceRuleRow,
  GovernanceViolationRow,
} from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import { ago } from "@/lib/format";
import { useShellScrollChain } from "@/lib/scroll-chain";

export const RISK_FILTERS = [
  { id: "all", label: "All" },
  { id: "HIGH", label: "High" },
  { id: "MEDIUM", label: "Medium" },
  { id: "LOW", label: "Low" },
] as const;

const MTBV_DAYS = [22, 18, 14, 11, 9, 12, 14, 10, 8, 7, 9, 12] as const;

const ENFORCEMENT_ACTIONS = ["BLOCK", "WARN", "LOG"] as const;

function RiskBadge({ level }: { level: string }) {
  const cls =
    level === "HIGH"
      ? "text-[var(--alert-error-text)]"
      : level === "MEDIUM"
        ? "text-[var(--alert-warning-text)]"
        : "text-[var(--alert-success-text)]";
  return <span className={`text-xs font-semibold ${cls}`}>{level}</span>;
}

function GateBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`text-xs font-medium ${active ? "text-[var(--alert-success-text)]" : "text-[var(--alert-error-text)]"}`}
    >
      {active ? "Active" : "None"}
    </span>
  );
}

function GovStatusPill({ status }: { status: string }) {
  const tone =
    status === "VIOLATED"
      ? "violated"
      : status === "DISABLED"
        ? "disabled"
        : "compliant";
  return (
    <span className={`fb-gov-status-pill fb-gov-status-pill--${tone}`}>
      {status}
    </span>
  );
}

function IconCheckCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconScale() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3v18M5 7h14M7 7l-2 5h4L7 7zm10 0l-2 5h4l-2-5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconFileWarning() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" />
      <path d="M14 3v5h5M12 11v4M12 17h.01" strokeLinecap="round" />
    </svg>
  );
}

function MtbvSpark({ vals }: { vals: readonly number[] }) {
  const w = 110;
  const h = 22;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const path = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / Math.max(1, max - min)) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} className="fb-gov-mtbv-spark" aria-hidden>
      <path d={path} fill="none" stroke="var(--alert-warning-text)" strokeWidth="1.5" />
    </svg>
  );
}

function IconOversightGaps() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
      <path d="M11 8v3M11 14h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconShieldAlert() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9.5-4.5-1-8-4.5-8-9.5V6l8-3z" />
      <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
    </svg>
  );
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function exportGapsCsv(gaps: GovernanceGapRow[]) {
  downloadCsv(
    "oversight-gaps.csv",
    gaps.map((g) => ({
      Agent: g.agentName,
      Skill: g.skill,
      "Trust tier": g.trustTier,
      Decisions: g.totalDecisions,
      "Auto rate": pct(g.autoRate, 1),
      Confidence: pct(g.avgConfidence, 1),
      Risk: g.riskLevel,
      "Has gate": g.hasRule ? "Yes" : "No",
    })),
  );
}

type UnreviewedProps = {
  gaps: GovernanceGapRow[];
  coverage: GovernanceCoverageRow[];
  search: string;
  riskFilter: string;
  onRiskFilterChange: (value: string) => void;
  onReload: () => void;
  loading?: boolean;
};

export function UnreviewedDecisionsDashboard({
  gaps,
  coverage,
  search,
  riskFilter,
  onRiskFilterChange,
  onReload,
  loading = false,
}: UnreviewedProps) {
  const scrollRef = useShellScrollChain();
  const [pendingSkill, setPendingSkill] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const stats = useMemo(() => buildGapStats(gaps), [gaps]);
  const filtered = useMemo(
    () => filterGaps(gaps, search, riskFilter),
    [gaps, search, riskFilter],
  );

  const handleAddGate = useCallback(
    async (skill: string) => {
      setPendingSkill(skill);
      setActionError(null);
      setActionSuccess(null);
      try {
        await addReviewGate(skill);
        setActionSuccess(`Review gate added for “${skill}”.`);
        onReload();
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "Failed to add review gate",
        );
      } finally {
        setPendingSkill(null);
      }
    },
    [onReload],
  );

  const firstUngated = gaps.find((g) => !g.hasRule);

  return (
    <div className="space-y-6">
      {stats.high > 0 && (
        <div
          className="rounded-xl border-l-4 border-[var(--alert-warning-border)] bg-[var(--alert-warning-bg)] px-4 py-3"
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-ink">
                {stats.high} high-risk oversight gap{stats.high !== 1 ? "s" : ""}{" "}
                detected
              </p>
              <p className="mt-1 text-xs text-brand-muted">
                {stats.highAgents.slice(0, 3).join(", ")}
                {stats.highAgents.length > 3
                  ? ` and ${stats.highAgents.length - 3} more`
                  : ""}{" "}
                run fully unsupervised. Add review gates below.
              </p>
            </div>
            <button
              type="button"
              className="fb-btn shrink-0 text-sm"
              onClick={() => exportGapsCsv(gaps)}
            >
              Export report
            </button>
          </div>
        </div>
      )}

      {actionSuccess ? (
        <p className="text-sm text-[var(--alert-success-text)]" role="status">
          {actionSuccess}
        </p>
      ) : null}

      {actionError ? (
        <p className="text-sm text-[var(--alert-error-text)]" role="alert">
          {actionError}
        </p>
      ) : null}

      <KpiGrid className="grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total oversight gaps"
          value={String(stats.total)}
          sub="Across all processes"
          icon={<IconOversightGaps />}
          iconTone="blue"
        />
        <KpiCard
          label="High risk"
          value={String(stats.high)}
          sub="Auto-open review-gate ticket"
          tone="caution"
          icon={<IconShieldAlert />}
          iconTone="red"
        />
        <KpiCard
          label="Medium risk"
          value={String(stats.medium)}
          sub="Sample-audit recommended"
          icon={<IconEye />}
          iconTone="orange"
        />
        <KpiCard
          label="Low risk"
          value={String(stats.low)}
          sub="Periodic spot-checks"
          tone="positive"
          icon={<IconEye />}
          iconTone="teal"
        />
      </KpiGrid>

      <ChartPanel
        kicker="Coverage by process"
        title="Active review gates per process"
      >
        {coverage.length === 0 ? (
          <p className="text-sm text-brand-muted">No process data yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {coverage.map((p) => {
              const ratio = Math.min(
                1,
                p.gates / Math.max(1, p.gapCount + p.gates),
              );
              const tone =
                ratio >= 0.6 ? "success" : ratio >= 0.3 ? "warn" : "error";
              const barColor =
                tone === "success"
                  ? "var(--alert-success-text)"
                  : tone === "warn"
                    ? "var(--alert-warning-text)"
                    : "var(--alert-error-text)";
              return (
                <div
                  key={p.process}
                  className="rounded-lg border border-brand-border bg-brand-surface p-3"
                >
                  <div className="truncate text-xs font-semibold text-brand-ink">
                    {p.process}
                  </div>
                  <div className="mb-2 text-[10px] text-brand-muted">
                    {p.decisionsPerWeek} decisions
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold tabular-nums">
                      {p.gates}
                    </span>
                    <span className="text-[10px] uppercase text-brand-muted">
                      gates
                    </span>
                    <span
                      className="ml-auto text-[10px] font-semibold"
                      style={{ color: barColor }}
                    >
                      {p.gapCount} gap{p.gapCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-brand-border">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${ratio * 100}%`,
                        background: barColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ChartPanel>

      <ChartPanel
        kicker="Oversight gaps"
        title="Decisions running without human review"
        action={
          <button
            type="button"
            className="fb-btn fb-btn-primary text-sm"
            disabled={
              gaps.filter((g) => !g.hasRule).length === 0 ||
              pendingSkill !== null
            }
            onClick={() => {
              if (firstUngated) void handleAddGate(firstUngated.skill);
            }}
          >
            Add review gate
          </button>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <FilterChipGroup
            options={RISK_FILTERS}
            value={riskFilter}
            onChange={onRiskFilterChange}
            ariaLabel="Risk level"
          />
          <span className="text-xs text-brand-muted">
            {filtered.length} of {gaps.length} gaps
            {loading ? " · refreshing…" : ""}
          </span>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-brand-muted">
            {gaps.length === 0
              ? "No oversight gaps detected."
              : "No gaps match your filters."}
          </p>
        ) : (
          <div ref={scrollRef} className="fb-cov-table-scroll">
            <DataTable className="shadow-none">
              <DataTableHead>
                <tr>
                  <th className="fb-data-table-cell">Agent</th>
                  <th className="fb-data-table-cell">Skill</th>
                  <th className="fb-data-table-cell">Trust tier</th>
                  <th className="fb-data-table-cell text-right">Decisions</th>
                  <th className="fb-data-table-cell text-right">Auto rate</th>
                  <th className="fb-data-table-cell text-right">Confidence</th>
                  <th className="fb-data-table-cell">Risk</th>
                  <th className="fb-data-table-cell">Gate</th>
                  <th className="fb-data-table-cell text-right">Action</th>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {filtered.map((g) => (
                  <DataTableRow key={`${g.agentId}-${g.skill}`}>
                    <DataTableCell className="text-xs font-medium">
                      {g.agentName}
                    </DataTableCell>
                    <DataTableCell
                      className="max-w-[200px] truncate text-xs"
                      title={g.skill}
                    >
                      {g.skill}
                    </DataTableCell>
                    <DataTableCell className="font-mono text-[11px]">
                      {g.trustTier}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums text-xs">
                      {g.totalDecisions}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums text-xs">
                      {pct(g.autoRate, 0)}
                    </DataTableCell>
                    <DataTableCell align="right" className="tabular-nums text-xs">
                      {pct(g.avgConfidence, 0)}
                    </DataTableCell>
                    <DataTableCell>
                      <RiskBadge level={g.riskLevel} />
                    </DataTableCell>
                    <DataTableCell>
                      <GateBadge active={g.hasRule} />
                    </DataTableCell>
                    <DataTableCell align="right">
                      <button
                        type="button"
                        className="fb-btn text-xs"
                        disabled={g.hasRule || pendingSkill === g.skill}
                        onClick={() => handleAddGate(g.skill)}
                      >
                        {g.hasRule ? "Gated" : "Add gate"}
                      </button>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </ChartPanel>
    </div>
  );
}

type RulesProps = {
  rules: GovernanceRuleRow[];
  violations: GovernanceViolationRow[];
  onReload: () => void;
};

export function RulesComplianceDashboard({
  rules,
  violations,
  onReload,
}: RulesProps) {
  const scrollRef = useShellScrollChain();
  const { showToast } = useShell();
  const violationsRef = useRef<HTMLDivElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<RuleCreateForm>(EMPTY_RULE_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyRuleId, setBusyRuleId] = useState<string | null>(null);

  const violatedIds = useMemo(
    () =>
      new Set(
        violations
          .map((v) => v.policyId)
          .filter((id): id is string => Boolean(id)),
      ),
    [violations],
  );

  const rulesWithStatus = useMemo(
    () =>
      rules.map((r) => ({
        ...r,
        status: ruleDisplayStatus(r, violatedIds),
      })),
    [rules, violatedIds],
  );

  const activeRules = rulesWithStatus.filter((r) => r.status !== "DISABLED");
  const compliant = rulesWithStatus.filter((r) => r.status === "COMPLIANT").length;
  const violated = rulesWithStatus.filter((r) => r.status === "VIOLATED").length;
  const disabled = rulesWithStatus.filter((r) => r.status === "DISABLED").length;
  const compliancePct = activeRules.length ? compliant / activeRules.length : 0;

  const handleSetActive = async (rule: GovernanceRuleRow, isActive: boolean) => {
    setBusyRuleId(rule.id);
    try {
      await setRuleActive(rule, isActive);
      onReload();
    } finally {
      setBusyRuleId(null);
    }
  };

  const handleEnforcement = async (
    rule: GovernanceRuleRow,
    action: (typeof ENFORCEMENT_ACTIONS)[number],
  ) => {
    if (rule.enforcementAction === action) return;
    setBusyRuleId(rule.id);
    try {
      await setRuleEnforcement(rule, action);
      onReload();
    } finally {
      setBusyRuleId(null);
    }
  };

  const handleCreate = async () => {
    setFormError(null);
    if (!form.id.trim() || !form.name.trim() || !form.task_type.trim()) {
      setFormError("ID, name, and task type are required.");
      return;
    }
    setSubmitting(true);
    try {
      await submitNewRule(form);
      setDialogOpen(false);
      setForm(EMPTY_RULE_FORM);
      showToast(`Rule “${form.name.trim()}” created.`);
      onReload();
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Failed to create rule",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToViolations = () => {
    violationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-6">
      {violated > 0 ? (
        <div
          className="rounded-xl border-l-4 border-[var(--alert-error-border)] bg-[var(--alert-error-bg)] px-4 py-3"
          role="status"
        >
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-brand-ink">
                {violated} violated rule{violated !== 1 ? "s" : ""} at risk of EU
                AI Act Article 14 non-compliance
              </p>
              <p className="mt-1 text-xs text-brand-muted">
                {rulesWithStatus
                  .filter((r) => r.status === "VIOLATED")
                  .map((r) => `${r.id} — ${r.name}`)
                  .join("; ")}
              </p>
            </div>
            <button
              type="button"
              className="fb-btn shrink-0 text-sm"
              onClick={scrollToViolations}
            >
              View violations
            </button>
          </div>
        </div>
      ) : null}

      <KpiGrid className="grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Compliance rate"
          value={pct(compliancePct, 0)}
          sub={`${compliant} of ${activeRules.length} active rules passing`}
          tone={compliancePct >= 0.8 ? "positive" : "caution"}
          icon={<IconCheckCircle />}
          iconTone="teal"
        />
        <KpiCard
          label="Violated"
          value={String(violated)}
          sub="Active enforcement breaches"
          tone="caution"
          icon={<IconShieldAlert />}
          iconTone="red"
        />
        <KpiCard
          label="MTBV (days)"
          value="12"
          sub="Mean time between violations · trending up"
          tone="caution"
          icon={<IconScale />}
          iconTone="orange"
          footer={<MtbvSpark vals={MTBV_DAYS} />}
        />
        <KpiCard
          label="Disabled"
          value={String(disabled)}
          sub="Awaiting policy owner sign-off"
          tone="neutral"
          icon={<IconFileWarning />}
          iconTone="blue"
        />
      </KpiGrid>

      <ChartPanel
        kicker="Rules"
        title="Active and disabled policies"
        action={
          <button
            type="button"
            className="fb-btn fb-btn-primary text-sm"
            onClick={() => {
              setForm(EMPTY_RULE_FORM);
              setFormError(null);
              setDialogOpen(true);
            }}
          >
            Add rule
          </button>
        }
      >
        {rulesWithStatus.length === 0 ? (
          <p className="text-sm text-brand-muted">No rules configured yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {rulesWithStatus.map((r) => (
              <article
                key={r.id}
                className={[
                  "fb-gov-rule-card",
                  r.status === "VIOLATED" ? "fb-gov-rule-card--violated" : "",
                ].join(" ")}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-[10px] text-brand-muted">
                      {r.id} · {r.taskType}
                    </div>
                    <h4 className="text-sm font-semibold text-brand-ink">
                      {r.name}
                    </h4>
                  </div>
                  <GovStatusPill status={r.status} />
                </div>
                {r.description ? (
                  <p className="mb-3 text-xs leading-relaxed text-brand-muted">
                    {r.description}
                  </p>
                ) : null}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {ENFORCEMENT_ACTIONS.map((action) => (
                    <button
                      key={action}
                      type="button"
                      className={[
                        "fb-gov-enf-btn",
                        r.enforcementAction === action
                          ? "fb-gov-enf-btn--active"
                          : "",
                      ].join(" ")}
                      disabled={busyRuleId === r.id}
                      onClick={() => void handleEnforcement(r, action)}
                    >
                      {action}
                    </button>
                  ))}
                  <div className="ml-auto">
                    <ToggleSwitch
                      checked={r.isActive}
                      disabled={busyRuleId === r.id}
                      label={`Toggle ${r.name}`}
                      onChange={(checked) => void handleSetActive(r, checked)}
                    />
                  </div>
                </div>
                {r.referenceCode ? (
                  <p className="border-t border-brand-border pt-2 font-mono text-[10px] text-brand-muted">
                    Reference: {r.referenceCode}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </ChartPanel>

      <div ref={violationsRef}>
        <ChartPanel
          kicker="Active violations"
          title="Non-compliant items requiring action"
        >
          {violations.length === 0 ? (
            <div className="fb-gov-violations-empty">
              <span className="text-[var(--alert-success-text)] [&_svg]:h-8 [&_svg]:w-8">
                <IconCheckCircle />
              </span>
              <p className="text-sm font-medium text-brand-ink">
                No active violations
              </p>
              <p className="text-xs text-brand-muted">
                All monitored rules are currently compliant.
              </p>
            </div>
          ) : (
            <div ref={scrollRef} className="fb-cov-table-scroll -mx-1">
              <DataTable className="shadow-none">
                <DataTableHead>
                  <tr>
                    <th className="fb-data-table-cell">Rule</th>
                    <th className="fb-data-table-cell">Agent</th>
                    <th className="fb-data-table-cell">Detail</th>
                    <th className="fb-data-table-cell">First seen</th>
                    <th className="fb-data-table-cell">Outcome</th>
                    <th className="fb-data-table-cell" />
                  </tr>
                </DataTableHead>
                <DataTableBody>
                  {violations.map((v) => {
                    const failed =
                      v.policyOutcome === "violated" || !v.passedThresholds;
                    return (
                      <DataTableRow key={v.eventId}>
                        <DataTableCell>
                          <div className="font-mono text-[11px] text-brand-muted">
                            {v.policyId ?? "—"}
                          </div>
                          <div className="text-xs font-medium">
                            {v.ruleName ?? v.skill ?? v.workflowId ?? "Unknown rule"}
                          </div>
                        </DataTableCell>
                        <DataTableCell className="text-xs">{v.agentId}</DataTableCell>
                        <DataTableCell className="max-w-xs text-xs text-brand-muted">
                          {v.ruleDescription
                            ? v.ruleDescription
                            : v.policyOutcome === "violated"
                              ? "Policy outcome: violated"
                              : "Threshold check failed"}
                          {v.ruleReferenceCode ? (
                            <span className="ml-1 font-mono text-[10px]">
                              ({v.ruleReferenceCode})
                            </span>
                          ) : null}
                        </DataTableCell>
                        <DataTableCell className="text-xs text-brand-muted">
                          {ago(v.capturedAt)}
                        </DataTableCell>
                        <DataTableCell>
                          <span
                            className={[
                              "rounded px-1.5 py-0.5 font-mono text-[10px] uppercase",
                              failed
                                ? "bg-[var(--alert-error-bg)] text-[var(--alert-error-text)]"
                                : "bg-brand-surface text-brand-muted",
                            ].join(" ")}
                          >
                            {v.policyOutcome ??
                              (v.passedThresholds ? "passed" : "failed")}
                          </span>
                        </DataTableCell>
                        <DataTableCell>
                          <Link
                            href={violationReviewHref(v)}
                            className="fb-btn inline-block text-xs"
                            title={violationReviewLabel(v)}
                          >
                            Review
                          </Link>
                        </DataTableCell>
                      </DataTableRow>
                    );
                  })}
                </DataTableBody>
              </DataTable>
            </div>
          )}
        </ChartPanel>
      </div>

      <Modal open={dialogOpen} onClose={() => setDialogOpen(false)} size="md">
        <ModalHeader
          title="Add governance rule"
          description="Define a policy gate for a task type."
          onClose={() => setDialogOpen(false)}
          titleId="rule-dialog-title"
        />
        <ModalBody className="space-y-4">
          {formError ? (
            <p className="text-sm text-[var(--alert-error-text)]">{formError}</p>
          ) : null}
          <label className="block text-sm">
            <span className="text-brand-muted">Rule ID</span>
            <input
              className="fb-input mt-1 w-full"
              value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              placeholder="RG-task-completion"
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-muted">Name</span>
            <input
              className="fb-input mt-1 w-full"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-muted">Task type</span>
            <input
              className="fb-input mt-1 w-full"
              value={form.task_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, task_type: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-muted">Enforcement</span>
            <select
              className="fb-input mt-1 w-full"
              value={form.enforcement_action}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  enforcement_action: e.target.value as RuleCreateForm["enforcement_action"],
                }))
              }
            >
              <option value="WARN">WARN</option>
              <option value="BLOCK">BLOCK</option>
              <option value="LOG">LOG</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-brand-muted">Description</span>
            <textarea
              className="fb-input mt-1 w-full"
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="text-brand-muted">Reference code</span>
            <input
              className="fb-input mt-1 w-full"
              value={form.reference_code}
              onChange={(e) =>
                setForm((f) => ({ ...f, reference_code: e.target.value }))
              }
              placeholder="ISO/IEC 42001 §6.1.3"
            />
          </label>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="fb-btn"
            onClick={() => setDialogOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="fb-btn fb-btn-primary"
            disabled={submitting}
            onClick={handleCreate}
          >
            {submitting ? "Saving…" : "Create rule"}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

type ApiKeysProps = {
  keys: ApiKeyRow[];
  onReload: () => void;
  loading?: boolean;
};

export function ApiKeysDashboard({ keys, onReload, loading = false }: ApiKeysProps) {
  const scrollRef = useShellScrollChain();
  const { showToast } = useShell();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<ApiKeyCreateResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const copyResetTimer = useRef<number | null>(null);

  const sortedKeys = useMemo(
    () =>
      [...keys].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [keys],
  );

  const handleCreate = async () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError("Label is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createApiKey(trimmed);
      setCreated(res);
      setLabel("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to create API key",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: number) => {
    setRevokingId(id);
    try {
      await revokeApiKey(id);
      setRevokeTarget(null);
      showToast("API key revoked.");
      onReload();
    } finally {
      setRevokingId(null);
    }
  };

  const copyKey = async (key: string) => {
    const ok = await copyTextToClipboard(key);
    if (!ok) return;
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    setKeyCopied(true);
    copyResetTimer.current = window.setTimeout(() => {
      setKeyCopied(false);
      copyResetTimer.current = null;
    }, 2000);
  };

  const resetDialog = () => {
    if (copyResetTimer.current) {
      clearTimeout(copyResetTimer.current);
      copyResetTimer.current = null;
    }
    setLabel("");
    setCreated(null);
    setError(null);
    setKeyCopied(false);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-brand-ink">Keys</h2>

      <ChartPanel
        kicker="Admin"
        title={`${sortedKeys.length} key${sortedKeys.length === 1 ? "" : "s"}${loading ? " · refreshing…" : ""}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/api-docs" className="fb-btn text-sm">
              API docs
            </Link>
            <button
              type="button"
              className="fb-btn fb-btn-primary text-sm"
              onClick={() => {
                resetDialog();
                setOpen(true);
              }}
            >
              Generate new key
            </button>
          </div>
        }
      >
        {sortedKeys.length === 0 ? (
          <p className="text-sm text-brand-muted">
            No API keys yet. Generate one to connect Workforce.
          </p>
        ) : (
          <div ref={scrollRef} className="fb-cov-table-scroll">
            <DataTable className="shadow-none">
              <DataTableHead>
                <tr>
                  <th className="fb-data-table-cell">Label</th>
                  <th className="fb-data-table-cell">Created</th>
                  <th className="fb-data-table-cell">Status</th>
                  <th className="fb-data-table-cell text-right">Actions</th>
                </tr>
              </DataTableHead>
              <DataTableBody>
                {sortedKeys.map((k) => (
                  <DataTableRow key={k.id}>
                    <DataTableCell className="text-sm font-medium">
                      {k.label}
                    </DataTableCell>
                    <DataTableCell className="font-mono text-xs text-brand-muted">
                      {ago(k.createdAt)}
                    </DataTableCell>
                    <DataTableCell>
                      <span
                        className={`text-xs font-medium ${k.revokedAt ? "text-brand-muted" : "text-[var(--alert-success-text)]"}`}
                      >
                        {k.revokedAt ? "Revoked" : "Active"}
                      </span>
                    </DataTableCell>
                    <DataTableCell align="right">
                      <button
                        type="button"
                        className="fb-btn text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!!k.revokedAt || revokingId === k.id}
                        title={k.revokedAt ? "Key already revoked" : undefined}
                        onClick={() => setRevokeTarget(k)}
                      >
                        {revokingId === k.id ? "Revoking…" : "Revoke"}
                      </button>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </ChartPanel>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          resetDialog();
        }}
      >
        <ModalHeader
          title={created ? "API key created" : "Generate API key"}
          description={
            created
              ? "Copy this key now — it will not be shown again."
              : "Keys are scoped to your tenant."
          }
          onClose={() => {
            setOpen(false);
            resetDialog();
          }}
          titleId="api-key-dialog"
        />
        <ModalBody className="space-y-4">
          {error ? (
            <p className="text-sm text-[var(--alert-error-text)]">{error}</p>
          ) : null}
          {created ? (
            <div className="space-y-3">
              <p className="text-sm text-brand-muted">
                Label: <strong>{created.label}</strong>
              </p>
              <div className="rounded-lg border border-brand-border bg-brand-surface p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
                  Raw API key
                </p>
                <div className="mt-2 flex items-start gap-2">
                  <code className="block min-w-0 flex-1 break-all rounded-md border border-brand-border bg-brand-bg px-3 py-2 font-mono text-xs">
                    {created.key}
                  </code>
                  <button
                    type="button"
                    className="fb-btn shrink-0 text-sm min-w-[4.5rem]"
                    onClick={() => copyKey(created.key)}
                  >
                    {keyCopied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">
                  <strong>Copy this key now</strong> — it will never be shown
                  again.
                </p>
              </div>
            </div>
          ) : (
            <label className="block text-sm">
              <span className="text-brand-muted">Label</span>
              <input
                className="fb-input mt-1 w-full"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. CI pipeline"
              />
            </label>
          )}
        </ModalBody>
        <ModalFooter>
          {created ? (
            <button
              type="button"
              className="fb-btn fb-btn-primary"
              onClick={() => {
                setOpen(false);
                resetDialog();
                onReload();
              }}
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                className="fb-btn"
                onClick={() => {
                  setOpen(false);
                  resetDialog();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fb-btn fb-btn-primary"
                disabled={busy}
                onClick={handleCreate}
              >
                {busy ? "Generating…" : "Generate"}
              </button>
            </>
          )}
        </ModalFooter>
      </Modal>

      <Modal
        open={revokeTarget !== null}
        onClose={() => {
          if (revokingId !== null) return;
          setRevokeTarget(null);
        }}
        labelledBy="revoke-api-key-title"
      >
        <ModalHeader
          title="Revoke this key?"
          description="This will immediately disable the Workforce integration using this API key. You can't restore it — generate a new key instead."
          onClose={() => {
            if (revokingId !== null) return;
            setRevokeTarget(null);
          }}
          titleId="revoke-api-key-title"
        />
        <ModalFooter>
          <button
            type="button"
            className="fb-btn"
            disabled={revokingId !== null}
            onClick={() => setRevokeTarget(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="fb-btn fb-btn-primary"
            disabled={revokingId !== null || !revokeTarget}
            onClick={() => revokeTarget && handleRevoke(revokeTarget.id)}
          >
            {revokingId !== null ? "Revoking…" : "Revoke key"}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
