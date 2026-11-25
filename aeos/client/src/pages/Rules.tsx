import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill, StatusDot } from "@/components/Pill";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Scale, AlertTriangle, CheckCircle2, FileWarning, Plus,
  Activity, Search,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { pct, num } from "@/lib/format";
import { useListSelection } from "@/hooks/use-list-selection";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type Action = "BLOCK" | "WARN" | "LOG";
type Status = "COMPLIANT" | "VIOLATED" | "DISABLED";
type StatusFilter = "all" | Status;

interface ApiRule {
  id: string;
  name: string;
  description: string;
  taskType: string;
  enforcementAction: Action;
  isActive: boolean;
  referenceCode: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RuleRow {
  id: string;
  name: string;
  desc: string;
  taskType: string;
  enforcementAction: Action;
  isActive: boolean;
  reference: string;
  status: Status;
}

function toRow(r: ApiRule): RuleRow {
  return {
    id: r.id,
    name: r.name,
    desc: r.description,
    taskType: r.taskType,
    enforcementAction: r.enforcementAction,
    isActive: r.isActive,
    reference: r.referenceCode ?? "",
    status: r.isActive ? "COMPLIANT" : "DISABLED",
  };
}

const VIOLATION_DAYS = [22, 18, 14, 11, 9, 12, 14, 10, 8, 7, 9, 12];

interface ViolationRow {
  eventId: string;
  capturedAt: string;
  agentId: string;
  skill: string | null;
  policyId: string | null;
  policyOutcome: string | null;
  passedThresholds: boolean;
  workflowId: string | null;
  ruleName: string | null;
  ruleDescription: string | null;
  ruleTaskType: string | null;
  ruleReferenceCode: string | null;
}

const EMPTY_FORM = { id: "", name: "", description: "", task_type: "", enforcement_action: "WARN" as Action, reference_code: "" };

function statusTone(s: Status): "green" | "red" | "slate" {
  if (s === "COMPLIANT") return "green";
  if (s === "VIOLATED") return "red";
  return "slate";
}

export default function Rules() {
  const violationsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<ViolationRow[]>([]);
  const [violationsLoading, setViolationsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");

  const violatedRuleIds = new Set(
    violations.map(v => v.policyId).filter((id): id is string => id !== null)
  );

  const fetchViolations = useCallback(() => {
    setViolationsLoading(true);
    fetch("/api/governance/violations", { credentials: "include" })
      .then(r => r.ok ? r.json() as Promise<ViolationRow[]> : Promise.resolve([]))
      .then(setViolations)
      .catch(() => setViolations([]))
      .finally(() => setViolationsLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/governance/rules", { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return r.json() as Promise<ApiRule[]>;
      })
      .then(data => setRules(data.map(toRow)))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    fetchViolations();
  }, [fetchViolations]);

  const rulesWithStatus = useMemo(() => rules.map(r => {
    if (!r.isActive) return { ...r, status: "DISABLED" as Status };
    if (violatedRuleIds.has(r.id)) return { ...r, status: "VIOLATED" as Status };
    return { ...r, status: "COMPLIANT" as Status };
  }), [rules, violations]);

  const activeRules = rulesWithStatus.filter(r => r.status !== "DISABLED");
  const compliant = rulesWithStatus.filter(r => r.status === "COMPLIANT").length;
  const violated = rulesWithStatus.filter(r => r.status === "VIOLATED").length;
  const disabled = rulesWithStatus.filter(r => r.status === "DISABLED").length;
  const compliancePct = activeRules.length ? compliant / activeRules.length : 1;

  const list = useMemo(() => rulesWithStatus.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!q.trim()) return true;
    const blob = [r.id, r.name, r.desc, r.taskType, r.reference].join(" ").toLowerCase();
    return blob.includes(q.toLowerCase());
  }), [rulesWithStatus, statusFilter, q]);

  const { selected: active, select: selectRule, id: activeRuleId } = useListSelection(
    list,
    (r) => r.id,
  );

  async function patchRule(id: string, patch: { enforcement_action?: Action; is_active?: boolean }) {
    setRules(prev => prev.map(r => {
      if (r.id !== id) return r;
      const next = { ...r };
      if (patch.enforcement_action !== undefined) next.enforcementAction = patch.enforcement_action;
      if (patch.is_active !== undefined) {
        next.isActive = patch.is_active;
        next.status = !patch.is_active ? "DISABLED" : violatedRuleIds.has(id) ? "VIOLATED" : "COMPLIANT";
      }
      return next;
    }));

    try {
      const res = await fetch(`/api/governance/rules/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `${res.status}`);
      }
      const updated = (await res.json()) as ApiRule;
      setRules(prev => prev.map(r => {
        if (r.id !== id) return r;
        const row = toRow(updated);
        if (row.isActive && violatedRuleIds.has(row.id)) row.status = "VIOLATED";
        return row;
      }));
    } catch (e) {
      toast({
        title: "Could not update rule",
        description: e instanceof Error ? e.message : "Something went wrong.",
        variant: "destructive",
      });
      fetch("/api/governance/rules", { credentials: "include" })
        .then(r => r.ok ? r.json() as Promise<ApiRule[]> : [])
        .then(data => setRules(data.map(toRow)))
        .catch(() => {});
    }
  }

  async function addRule() {
    setFormError(null);
    if (!form.id.trim()) { setFormError("Rule ID is required"); return; }
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    if (!form.task_type.trim()) { setFormError("Task Type is required"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/governance/rules", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json() as ApiRule & { error?: string };
      if (!res.ok) throw new Error(body.error ?? `${res.status}`);
      const newRow = toRow(body);
      setRules(prev => [...prev, newRow]);
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save rule");
    } finally {
      setSubmitting(false);
    }
  }

  const overallTone = violated > 0 ? "red" : compliancePct >= 0.8 ? "green" : "amber";

  return (
    <Layout
      title="Rules & Compliance"
      kicker="Governance / Compliance"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <Activity className="h-3 w-3" />
            {loading ? "Loading…" : pct(compliancePct, 0)}
          </Pill>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark"
            data-testid="button-add-rule"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add rule
          </button>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          The policy library backing every governance decision. Each rule is signed and chained alongside
          the decisions it gated — required evidence for ISO/IEC 42001 and EU AI Act audits.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">ISO/IEC 42001</Pill>
          <Pill tone="slate">EU AI Act Art. 14</Pill>
        </div>
      </div>

      {error && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load rules. Try refreshing the page or signing in again.
        </div>
      )}

      {!error && (
        <>
          {violated > 0 && (
            <div className="aeos-audit-alert mb-6 flex-wrap">
              <FileWarning className="h-5 w-5 text-[hsl(0_72%_44%)] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[hsl(0_72%_36%)]">
                  {violated} violated rule{violated !== 1 ? "s" : ""} at risk of EU AI Act Article 14 non-compliance
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed break-words">
                  {rulesWithStatus
                    .filter(r => r.status === "VIOLATED")
                    .map(r => `${r.id} — ${r.name}`)
                    .join("; ")}
                </div>
              </div>
              <button
                type="button"
                className="aeos-btn aeos-btn-secondary aeos-btn--sm shrink-0 w-full sm:w-auto"
                data-testid="button-open-violations"
                onClick={() => violationsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                View violations
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <KpiCard
              label="COMPLIANCE RATE"
              value={loading ? "—" : pct(compliancePct, 0)}
              sub={loading ? "Loading…" : `${compliant} of ${activeRules.length} active rules passing`}
              tone={compliancePct >= 0.8 ? "green" : "amber"}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <KpiCard
              label="VIOLATED"
              value={loading ? "—" : num(violated, 0)}
              sub="Active enforcement breaches"
              tone="red"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
            <KpiCard
              label="MTBV (DAYS)"
              value="12"
              sub="Mean time between violations · trending up"
              tone="amber"
              icon={<Scale className="h-4 w-4" />}
              footer={<MtbvSpark vals={VIOLATION_DAYS} />}
            />
            <KpiCard
              label="DISABLED"
              value={loading ? "—" : num(disabled, 0)}
              sub="Awaiting policy owner sign-off"
              tone="slate"
              icon={<FileWarning className="h-4 w-4" />}
            />
          </div>

          {!loading && (
            <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
                  Policy posture
                </div>
                <div className="text-sm font-semibold text-foreground mt-1 break-words">
                  {compliant} compliant · {violated} violated · {disabled} disabled · {violations.length} live violations
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {rulesWithStatus.filter(r => r.enforcementAction === "BLOCK").length} BLOCK ·{" "}
                  {rulesWithStatus.filter(r => r.enforcementAction === "WARN").length} WARN ·{" "}
                  {rulesWithStatus.filter(r => r.enforcementAction === "LOG").length} LOG
                </div>
              </div>
              <Pill tone={overallTone}>
                <StatusDot tone={overallTone} />
                {violated > 0 ? "Breaches active" : compliancePct >= 0.8 ? "Compliant" : "Review needed"}
              </Pill>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start mb-6 min-w-0">
            <SectionCard
              className="min-w-0"
              kicker="Policy library"
              title="Active and disabled rules"
              padding={false}
              action={
                <div className="aeos-content-segment" role="tablist" aria-label="Status filter">
                  {([
                    ["all", "All", rulesWithStatus.length],
                    ["COMPLIANT", "Compliant", compliant],
                    ["VIOLATED", "Violated", violated],
                    ["DISABLED", "Disabled", disabled],
                  ] as const).map(([id, label, count]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      onClick={() => setStatusFilter(id)}
                      className="aeos-content-segment-btn"
                      data-active={statusFilter === id ? "true" : "false"}
                      aria-selected={statusFilter === id}
                    >
                      {label}
                      <span className="ml-1 tabular-nums opacity-70">({count})</span>
                    </button>
                  ))}
                </div>
              }
            >
              <div className="px-3 sm:px-5 py-3 border-b">
                <label className="aeos-filter-search w-full max-w-none sm:max-w-sm">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search rule ID, name, task type…"
                  />
                </label>
              </div>

              {loading ? (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">Loading rules…</div>
              ) : list.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {rulesWithStatus.length === 0 ? "No rules yet. Add your first governance rule." : "No rules match this filter."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[36rem] xl:min-w-0">
                    <thead className="bg-muted/30 text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
                      <tr>
                        <Th>Rule</Th>
                        <Th>Action</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(r => (
                        <tr
                          key={r.id}
                          className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                            activeRuleId === r.id ? "bg-primary/5" : ""
                          } ${r.status === "VIOLATED" ? "border-l-2 border-l-[hsl(0_72%_52%)]" : r.status === "COMPLIANT" ? "border-l-2 border-l-[hsl(142_70%_42%)]" : "border-l-2 border-l-border"}`}
                          onClick={() => selectRule(r)}
                          data-testid={`rule-${r.id}`}
                        >
                          <Td>
                            <div className="font-medium text-xs truncate max-w-[12rem] sm:max-w-none">{r.name}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[12rem] sm:max-w-none" title={`${r.id} · ${r.taskType}`}>{r.id} · {r.taskType}</div>
                          </Td>
                          <Td>
                            <Pill tone={r.enforcementAction === "BLOCK" ? "red" : r.enforcementAction === "WARN" ? "amber" : "slate"}>
                              {r.enforcementAction}
                            </Pill>
                          </Td>
                          <Td>
                            <Pill tone={statusTone(r.status)}>
                              <StatusDot tone={statusTone(r.status)} />
                              {r.status}
                            </Pill>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard className="h-fit min-w-0" kicker="Rule detail" title={active ? active.name : "Select a rule"}>
              {!active ? (
                <p className="text-sm text-muted-foreground">
                  Click any row to edit enforcement action, toggle active state, or view reference codes.
                </p>
              ) : (
                <RuleDetail rule={active} onPatch={patchRule} />
              )}
            </SectionCard>
          </div>

          <div ref={violationsRef} className="min-w-0 scroll-mt-6">
          <SectionCard
            className="min-w-0"
            kicker="Active violations"
            title="Non-compliant items requiring action"
            padding={false}
          >
            {violationsLoading ? (
              <div className="px-5 py-12 text-center text-sm text-muted-foreground">Loading violations…</div>
            ) : violations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 text-[hsl(142_70%_42%)]" />
                <p className="text-sm font-medium">No active violations</p>
                <p className="text-xs">All monitored rules are currently compliant.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[40rem] xl:min-w-0">
                  <thead className="bg-muted/30 text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
                    <tr>
                      <Th>Rule</Th>
                      <Th>Agent</Th>
                      <Th>Detail</Th>
                      <Th>First seen</Th>
                      <Th>Outcome</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map(v => (
                      <tr key={v.eventId} className="border-b last:border-0 hover:bg-muted/40 border-l-2 border-l-[hsl(0_72%_52%)]">
                        <Td>
                          <div className="font-mono text-[10px] text-muted-foreground">{v.policyId ?? "—"}</div>
                          <div className="text-xs font-medium">{v.ruleName ?? v.skill ?? v.workflowId ?? "Unknown rule"}</div>
                        </Td>
                        <Td mono>{v.agentId}</Td>
                        <Td className="max-w-[10rem] sm:max-w-[15rem] xl:max-w-[240px]">
                          <span className="line-clamp-2 sm:line-clamp-none break-words">
                          {v.ruleDescription
                            ? v.ruleDescription
                            : v.policyOutcome === "violated"
                              ? "Policy outcome: violated"
                              : "Threshold check failed"}
                          {v.ruleReferenceCode && (
                            <span className="ml-1 font-mono text-[10px] text-muted-foreground">({v.ruleReferenceCode})</span>
                          )}
                          </span>
                        </Td>
                        <Td muted>
                          {(() => {
                            try { return formatDistanceToNow(new Date(v.capturedAt), { addSuffix: true }); }
                            catch { return v.capturedAt; }
                          })()}
                        </Td>
                        <Td>
                          <Pill tone={v.policyOutcome === "violated" || !v.passedThresholds ? "red" : "slate"}>
                            {v.policyOutcome ?? (v.passedThresholds ? "passed" : "failed")}
                          </Pill>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) { setForm(EMPTY_FORM); setFormError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add governance rule</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-id">Rule ID</Label>
              <Input id="rule-id" placeholder="R-005" value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-name">Name</Label>
              <Input id="rule-name" placeholder="Override rate cap" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-desc">Description</Label>
              <Input id="rule-desc" placeholder="Describe what this rule governs…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-task-type">Task Type / Scope</Label>
              <Input id="rule-task-type" placeholder="intake_classification" value={form.task_type} onChange={e => setForm(f => ({ ...f, task_type: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Enforcement Action</Label>
              <Select value={form.enforcement_action} onValueChange={v => setForm(f => ({ ...f, enforcement_action: v as Action }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BLOCK">BLOCK</SelectItem>
                  <SelectItem value="WARN">WARN</SelectItem>
                  <SelectItem value="LOG">LOG</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-ref">Reference Code</Label>
              <Input id="rule-ref" placeholder="ISO/IEC 42001 §6.1.3" value={form.reference_code} onChange={e => setForm(f => ({ ...f, reference_code: e.target.value }))} />
            </div>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <button type="button" className="aeos-btn aeos-btn-secondary" onClick={() => setDialogOpen(false)}>Cancel</button>
            <button type="button" className="aeos-btn aeos-btn-primary" onClick={addRule} disabled={submitting}>{submitting ? "Saving…" : "Save rule"}</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function RuleDetail({
  rule, onPatch,
}: {
  rule: RuleRow;
  onPatch: (id: string, patch: { enforcement_action?: Action; is_active?: boolean }) => void;
}) {
  const stTone = statusTone(rule.status);
  return (
    <div className="space-y-4">
      <div className={`rounded-none border-l-4 px-3 py-2 ${
        rule.status === "VIOLATED"
          ? "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]"
          : rule.status === "COMPLIANT"
            ? "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
            : "border-border bg-muted/30"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">Status</div>
            <div className="text-sm font-semibold mt-0.5 font-mono break-all">{rule.id}</div>
          </div>
          <Pill tone={stTone} className="shrink-0">
            <StatusDot tone={stTone} />
            {rule.status}
          </Pill>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{rule.desc || "No description."}</p>

      <div className="space-y-0 text-sm">
        <DetailRow k="Task type" v={<span className="font-mono text-xs">{rule.taskType}</span>} />
        {rule.reference && (
          <DetailRow k="Reference" v={<span className="font-mono text-xs">{rule.reference}</span>} />
        )}
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-2">
          Enforcement action
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          {(["BLOCK", "WARN", "LOG"] as const).map(a => (
            <button
              key={a}
              type="button"
              className={`aeos-btn aeos-btn--sm w-full sm:w-auto ${rule.enforcementAction === a ? "aeos-btn-primary" : "aeos-btn-secondary"}`}
              onClick={() => onPatch(rule.id, { enforcement_action: a })}
              data-testid={`button-${a.toLowerCase()}-${rule.id}`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/60">
        <span className="text-sm text-muted-foreground">Rule active</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{rule.isActive ? "ON" : "OFF"}</span>
          <Switch
            checked={rule.isActive}
            onCheckedChange={v => onPatch(rule.id, { is_active: v })}
            data-testid={`switch-rule-${rule.id}`}
          />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-3 py-2 border-b border-border/40 last:border-0 min-w-0">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="font-medium text-foreground sm:text-right break-words min-w-0">{v}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 sm:px-4 py-2.5 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, mono, muted, className }: { children: React.ReactNode; mono?: boolean; muted?: boolean; className?: string }) {
  return (
    <td className={`px-3 sm:px-4 py-2.5 align-top text-xs ${mono ? "font-mono whitespace-nowrap" : ""} ${muted ? "text-muted-foreground" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}

function MtbvSpark({ vals }: { vals: number[] }) {
  const w = 110, h = 22;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const path = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * w;
    const y = h - ((v - min) / Math.max(1, max - min)) * h;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={w} height={h} className="block">
      <path d={path} fill="none" stroke="hsl(38 90% 50%)" strokeWidth="1.5" />
    </svg>
  );
}
