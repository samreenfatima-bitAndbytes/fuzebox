import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill, StatusDot } from "@/components/Pill";
import {
  FileSearch, AlertTriangle, ShieldAlert, Eye, Plus,
  Activity, Search, CheckCircle2,
} from "lucide-react";
import { pct, num } from "@/lib/format";
import { useListSelection } from "@/hooks/use-list-selection";

type RiskLevel = "HIGH" | "MEDIUM" | "LOW";
type RiskFilter = "all" | RiskLevel;
type GateFilter = "all" | "ungated" | "gated";

type GapRow = {
  agentId: string;
  agentName: string;
  skill: string;
  trustTier: string;
  totalDecisions: number;
  autoRate: number;
  avgConfidence: number;
  riskLevel: RiskLevel;
  hasRule: boolean;
};

type CoverageRow = {
  process: string;
  gates: number;
  decisionsPerWeek: number;
  gapCount: number;
};

function riskTone(r: RiskLevel): "red" | "amber" | "green" {
  if (r === "HIGH") return "red";
  if (r === "MEDIUM") return "amber";
  return "green";
}

export default function Oversight() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [gateFilter, setGateFilter] = useState<GateFilter>("all");
  const [q, setQ] = useState("");

  const { data: gaps = [], isLoading, isError } = useQuery<GapRow[]>({
    queryKey: ["/api/governance/gaps"],
  });

  const { data: coverage = [] } = useQuery<CoverageRow[]>({
    queryKey: ["/api/governance/gaps/coverage"],
  });

  const addGate = useMutation({
    mutationFn: (skill: string) => {
      const slug = skill.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
      const id = `RG-${slug}`;
      return apiRequest("POST", "/api/governance/rules", {
        id,
        name: `Review gate: ${skill}`,
        task_type: skill,
        enforcement_action: "WARN",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/governance/gaps"] });
      qc.invalidateQueries({ queryKey: ["/api/governance/gaps/coverage"] });
      qc.invalidateQueries({ queryKey: ["/api/governance/rules"] });
      toast({ title: "Review gate added", description: "A warn-level rule was created for this skill." });
    },
    onError: (e: unknown) => {
      toast({
        title: "Could not add review gate",
        description: e instanceof Error ? e.message : "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const total = gaps.length;
  const high = gaps.filter(g => g.riskLevel === "HIGH").length;
  const medium = gaps.filter(g => g.riskLevel === "MEDIUM").length;
  const low = gaps.filter(g => g.riskLevel === "LOW").length;
  const ungated = gaps.filter(g => !g.hasRule).length;
  const highAgents = gaps.filter(g => g.riskLevel === "HIGH").map(g => g.agentName);

  const list = useMemo(() => gaps.filter(g => {
    if (riskFilter !== "all" && g.riskLevel !== riskFilter) return false;
    if (gateFilter === "ungated" && g.hasRule) return false;
    if (gateFilter === "gated" && !g.hasRule) return false;
    if (!q.trim()) return true;
    const blob = [g.agentName, g.agentId, g.skill, g.trustTier].join(" ").toLowerCase();
    return blob.includes(q.toLowerCase());
  }), [gaps, riskFilter, gateFilter, q]);

  const { selected: active, select: selectGap, id: activeGapId } = useListSelection(
    list,
    (g) => `${g.agentId}:${g.skill}`,
  );

  const overallTone = high > 0 ? "red" : medium > 0 ? "amber" : total > 0 ? "amber" : "green";

  return (
    <Layout
      title="Human Oversight Gaps"
      kicker="Governance / Oversight"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <Activity className="h-3 w-3" />
            {isLoading ? "Loading…" : `${num(total, 0)} gaps`}
          </Pill>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark"
            data-testid="button-add-gate"
            disabled={ungated === 0 || addGate.isPending}
            onClick={() => {
              const first = gaps.find(g => !g.hasRule);
              if (first) addGate.mutate(first.skill);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add review gate
          </button>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Decisions that bypass human review based on agent trust tier and auto-rate. EU AI Act Article 14
          and ISO/IEC 42001 require demonstrable oversight — each gap below proposes a review gate.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">EU AI Act Art. 14</Pill>
          <Pill tone="slate">Auto-rate ≥ 80%</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load oversight gaps. Try refreshing the page or signing in again.
        </div>
      )}

      {!isError && !isLoading && total === 0 && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No oversight gaps flagged yet — they appear when agents process tasks with high auto-review rates. Check{" "}
          <Link href="/ecl/observation" className="text-[hsl(var(--primary))] hover:underline">Observation Plane</Link>
          {" "}once activity is flowing.
        </div>
      )}

      {!isError && (
        <>
          {high > 0 && (
            <div className="aeos-audit-alert mb-6 flex-wrap">
              <AlertTriangle className="h-5 w-5 text-[hsl(0_72%_44%)] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[hsl(0_72%_36%)]">
                  {high} HIGH-RISK oversight gap{high !== 1 ? "s" : ""} detected
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {highAgents.slice(0, 3).join(", ")}
                  {highAgents.length > 3 ? ` and ${highAgents.length - 3} more` : ""} run fully unsupervised
                  with ≥80% auto-review rate. Add review gates to close Art. 14 gaps.
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <KpiCard
              label="TOTAL GAPS"
              value={isLoading ? "—" : num(total, 0)}
              sub="Agent + skill combinations"
              tone="primary"
              icon={<FileSearch className="h-4 w-4" />}
            />
            <KpiCard
              label="HIGH RISK"
              value={isLoading ? "—" : num(high, 0)}
              sub="Auto-open review-gate ticket"
              tone="red"
              icon={<ShieldAlert className="h-4 w-4" />}
            />
            <KpiCard
              label="MEDIUM RISK"
              value={isLoading ? "—" : num(medium, 0)}
              sub="Sample-audit recommended"
              tone="amber"
              icon={<Eye className="h-4 w-4" />}
            />
            <KpiCard
              label="UN-GATED"
              value={isLoading ? "—" : num(ungated, 0)}
              sub={`${low} low-risk gaps`}
              tone={ungated > 0 ? "amber" : "green"}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
          </div>

          {!isLoading && (
            <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
                  Oversight posture
                </div>
                <div className="text-sm font-semibold text-foreground mt-1 break-words">
                  {high} high · {medium} medium · {low} low · {ungated} without review gate
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {coverage.length} skill/process buckets · {coverage.reduce((s, c) => s + c.gates, 0)} active gates
                </div>
              </div>
              <Pill tone={overallTone}>
                <StatusDot tone={overallTone} />
                {high > 0 ? "Action required" : ungated > 0 ? "Gates needed" : "Fully gated"}
              </Pill>
            </div>
          )}

          <SectionCard kicker="Coverage by skill" title="Review gates per process bucket" className="mb-6 min-w-0">
            {coverage.length === 0 && !isLoading ? (
              <div className="text-sm text-muted-foreground py-4">No process data yet.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 min-w-0">
                {coverage.slice(0, 8).map(p => {
                  const ratio = Math.min(1, p.gates / Math.max(1, p.gapCount + p.gates));
                  const tone = ratio >= 0.6 ? "green" : ratio >= 0.3 ? "amber" : "red";
                  const fill =
                    tone === "green" ? "hsl(142 70% 42%)"
                      : tone === "amber" ? "hsl(38 96% 50%)"
                        : "hsl(0 72% 50%)";
                  return (
                    <div key={p.process} className="rounded-none border bg-card p-3 min-w-0">
                      <div className="text-xs font-semibold mb-1 line-clamp-1" title={p.process}>{p.process}</div>
                      <div className="text-[10px] text-muted-foreground mb-2">{num(p.decisionsPerWeek, 0)} decisions</div>
                      <div className="flex items-baseline gap-2">
                        <div className="text-lg font-bold tabular-nums">{p.gates}</div>
                        <div className="text-[10px] uppercase text-muted-foreground">gates</div>
                        <div className={`ml-auto text-[10px] font-semibold ${p.gapCount > 0 ? "text-[hsl(0_72%_44%)]" : "text-[hsl(142_70%_30%)]"}`}>
                          {p.gapCount} gap{p.gapCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="aeos-cognition-contribution-track h-1.5 mt-2">
                        <div className="aeos-cognition-contribution-fill" style={{ width: `${ratio * 100}%`, background: fill }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start mb-6 min-w-0">
            <SectionCard
              className="min-w-0"
              kicker="Oversight gaps"
              title="Decisions running without human review"
              padding={false}
              action={
                <div className="aeos-content-segment" role="tablist" aria-label="Risk filter">
                  {([
                    ["all", "All", total],
                    ["HIGH", "High", high],
                    ["MEDIUM", "Medium", medium],
                    ["LOW", "Low", low],
                  ] as const).map(([id, label, count]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      onClick={() => setRiskFilter(id)}
                      className="aeos-content-segment-btn"
                      data-active={riskFilter === id ? "true" : "false"}
                      aria-selected={riskFilter === id}
                    >
                      {label}
                      <span className="ml-1 tabular-nums opacity-70">({count})</span>
                    </button>
                  ))}
                </div>
              }
            >
              <div className="px-3 sm:px-5 py-3 border-b flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 min-w-0">
                <label className="aeos-filter-search flex-1 min-w-0 w-full sm:min-w-[200px] sm:max-w-sm">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search agent, skill, tier…"
                  />
                </label>
                <div className="aeos-content-segment inline-flex w-full sm:w-auto overflow-x-auto" role="tablist" aria-label="Gate filter">
                  {([
                    ["all", "All"],
                    ["ungated", "No gate"],
                    ["gated", "Gated"],
                  ] as const).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      onClick={() => setGateFilter(id)}
                      className="aeos-content-segment-btn"
                      data-active={gateFilter === id ? "true" : "false"}
                      aria-selected={gateFilter === id}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {isLoading ? (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">Loading oversight gaps…</div>
              ) : list.length === 0 ? (
                <div className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {total === 0
                    ? "No gaps flagged yet — see banner above for guidance."
                    : "No gaps match this filter."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[32rem] xl:min-w-0">
                    <thead className="bg-muted/30 text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
                      <tr>
                        <Th>Agent</Th>
                        <Th>Skill</Th>
                        <Th>Risk</Th>
                        <Th align="right">Auto</Th>
                        <Th>Gate</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(g => (
                        <tr
                          key={`${g.agentId}-${g.skill}`}
                          className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                            `${g.agentId}:${g.skill}` === activeGapId ? "bg-primary/5" : ""
                          } ${g.riskLevel === "HIGH" ? "border-l-2 border-l-[hsl(0_72%_52%)]" : g.riskLevel === "MEDIUM" ? "border-l-2 border-l-[hsl(38_96%_50%)]" : "border-l-2 border-l-[hsl(142_70%_42%)]"}`}
                          onClick={() => selectGap(g)}
                          data-testid={`row-gap-${g.agentId}-${g.skill}`}
                        >
                          <Td>
                            <div className="font-medium text-xs truncate max-w-[8rem] sm:max-w-[10rem]">{g.agentName}</div>
                            <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[8rem] sm:max-w-[10rem]" title={g.agentId}>{g.agentId}</div>
                          </Td>
                          <Td className="max-w-[8rem] sm:max-w-[10rem] truncate" title={g.skill}>{g.skill}</Td>
                          <Td>
                            <Pill tone={riskTone(g.riskLevel)}>
                              <StatusDot tone={riskTone(g.riskLevel)} />
                              {g.riskLevel}
                            </Pill>
                          </Td>
                          <Td align="right">{pct(g.autoRate, 0)}</Td>
                          <Td>
                            {g.hasRule ? <Pill tone="green">Active</Pill> : <Pill tone="red">None</Pill>}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            <SectionCard className="h-fit min-w-0" kicker="Gap detail" title={active ? active.agentName : "Select a gap"}>
              {!active ? (
                <p className="text-sm text-muted-foreground">
                  Click any row to inspect trust tier, auto-rate, confidence, and add a review gate.
                </p>
              ) : (
                <GapDetail gap={active} onAddGate={() => addGate.mutate(active.skill)} adding={addGate.isPending} />
              )}
            </SectionCard>
          </div>
        </>
      )}
    </Layout>
  );
}

function GapDetail({
  gap, onAddGate, adding,
}: {
  gap: GapRow;
  onAddGate: () => void;
  adding: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className={`rounded-none border-l-4 px-3 py-2 ${
        gap.riskLevel === "HIGH"
          ? "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]"
          : gap.riskLevel === "MEDIUM"
            ? "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]"
            : "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">Risk level</div>
            <div className="text-sm font-semibold mt-0.5 break-words">{gap.skill}</div>
          </div>
          <Pill tone={riskTone(gap.riskLevel)} className="shrink-0">
            <StatusDot tone={riskTone(gap.riskLevel)} />
            {gap.riskLevel}
          </Pill>
        </div>
      </div>

      <div className="space-y-0 text-sm">
        <DetailRow k="Agent" v={gap.agentName} />
        <DetailRow k="Agent ID" v={<span className="font-mono text-xs">{gap.agentId}</span>} />
        <DetailRow k="Trust tier" v={<span className="font-mono text-xs">{gap.trustTier}</span>} />
        <DetailRow k="Total decisions" v={num(gap.totalDecisions, 0)} />
        <DetailRow k="Auto-review rate" v={pct(gap.autoRate, 0)} />
        <DetailRow k="Avg confidence" v={pct(gap.avgConfidence, 0)} />
        <DetailRow
          k="Review gate"
          v={gap.hasRule ? <Pill tone="green">Active</Pill> : <Pill tone="red">None</Pill>}
        />
      </div>

      {!gap.hasRule && (
        <button
          type="button"
          className="aeos-btn aeos-btn-primary w-full"
          disabled={adding}
          data-testid={`button-add-gate-${gap.skill}`}
          onClick={onAddGate}
        >
          {adding ? "Adding gate…" : "Add review gate"}
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}

      <p className="text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border/60">
        {gap.riskLevel === "HIGH"
          ? "HIGH risk: agent runs unsupervised at high auto-rate. Gate required for EU AI Act Art. 14."
          : gap.riskLevel === "MEDIUM"
            ? "MEDIUM risk: sample-audit recommended; consider adding a WARN gate."
            : "LOW risk: periodic spot-checks sufficient; gate optional."}
      </p>
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

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th className={`px-3 sm:px-4 py-2.5 font-semibold whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, align, className }: { children: React.ReactNode; align?: "right"; className?: string }) {
  return (
    <td className={`px-3 sm:px-4 py-2.5 align-top tabular-nums text-xs whitespace-nowrap ${align === "right" ? "text-right" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}
