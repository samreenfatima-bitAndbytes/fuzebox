import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { usd, num, pct } from "@/lib/format";
import {
  Activity, Award, ShieldCheck, Sparkles, Eye, BookCheck,
  Database, ArrowRight, AlertTriangle, ScanSearch, Info, Users, Bot, Zap,
  TrendingUp, DollarSign, CheckCircle2,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Link } from "wouter";

type Summary = {
  counts: {
    events: number; ledgerRows: number; ledgerOpen: number; ledgerClosed: number;
    agents: number; newRecommendations: number; coverageEntries: number; coverageGaps: number;
    governanceDecisions7d: number;
  };
  economics: {
    laborValueSavedUsd: number; amortizedCostUsd: number; netSavingsUsd: number;
    weeklyRunRateUsd: number; annualizedRunRateUsd: number; ropAvg: number;
    totalTokens: number; avgCostPerEvent: number; avgSavedPerEvent: number;
  };
  quality: {
    passRate: number; passedCount: number; totalCount: number;
    humanReviewQueued: number; sigmaLevel: number;
  };
  byVendor: Record<string, { saved: number; cost: number; n: number }>;
  latestEquations?: {
    cuow: number; abt: number; mer: number; ctr: number; tv: number;
    rop: number; tuop: number; huop: number; auop: number; synergyS: number; taskCount: number;
    laborValueSavedUsd?: number; amortizedCostUsd?: number;
    netSavingsUsd?: number; weeklyRunRateUsd?: number;
  } | null;
};

type Agent = {
  agentId: string; name: string; hyperscaler: string; model: string;
  trustTier: string; status: string; vendor?: string;
};

type Rec = {
  recId: string; title: string; rationale: string; severity: string;
  template: string; status: string; predictedDeltaUsd?: number; confidence?: number;
};

type AttentionItem =
  | { kind: "rec"; rec: Rec }
  | { kind: "agent"; agent: Agent };

function sigmaToLabel(s: number): { label: string; tone: "green" | "blue" | "amber" | "red" } {
  if (s >= 5) return { label: "Excellent", tone: "green" };
  if (s >= 4) return { label: "Good", tone: "green" };
  if (s >= 3) return { label: "Fair", tone: "blue" };
  if (s >= 2) return { label: "Needs Attention", tone: "amber" };
  return { label: "Critical", tone: "red" };
}

function healthTone(s: number): "green" | "amber" | "red" {
  return s >= 4 ? "green" : s >= 3 ? "amber" : "red";
}

function vendorTint(v: string): string {
  switch (v) {
    case "anthropic": return "hsl(25 90% 55%)";
    case "openai": return "hsl(142 70% 42%)";
    case "ms_copilot": return "hsl(213 84% 56%)";
    case "uniphore_baic": return "hsl(280 70% 55%)";
    case "mistral": return "hsl(189 80% 48%)";
    default: return "hsl(220 15% 55%)";
  }
}

export default function Dashboard() {
  const { data: s, isLoading, isError } = useQuery<Summary>({ queryKey: ["/api/dashboard/summary"] });
  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const { data: recs } = useQuery<Rec[]>({ queryKey: ["/api/recommendations"] });

  const eq = s?.latestEquations;
  const ec = s?.economics;
  const q = s?.quality;
  const counts = s?.counts;

  const eqLaborSaved = eq?.laborValueSavedUsd ?? ec?.laborValueSavedUsd ?? 0;
  const eqCost = eq?.amortizedCostUsd ?? ec?.amortizedCostUsd ?? 0;
  const eqNet = eq?.netSavingsUsd ?? ec?.netSavingsUsd ?? (eqLaborSaved - eqCost);
  const eqWeekly = eq?.weeklyRunRateUsd ?? ec?.weeklyRunRateUsd ?? 0;
  const eqRop = eq?.rop ?? ec?.ropAvg ?? 0;

  const aShare = eq && (eq.huop + eq.auop) > 0 ? eq.auop / (eq.huop + eq.auop) : 0;
  const ledgerCloseRate = counts && counts.ledgerRows > 0 ? counts.ledgerClosed / counts.ledgerRows : 0;

  const vendors = useMemo(
    () => Object.entries(s?.byVendor ?? {}).sort(([, a], [, b]) => (b.saved - b.cost) - (a.saved - a.cost)),
    [s?.byVendor],
  );
  const totalNet = vendors.reduce((sum, [, d]) => sum + (d.saved - d.cost), 0) || 1;

  const qualityLabel = sigmaToLabel(q?.sigmaLevel ?? 0);
  const health = healthTone(q?.sigmaLevel ?? 0);

  const newRecs = (recs ?? []).filter(r => r.status === "new").slice(0, 4);
  const attentionAgents = (agents ?? []).filter(a => a.status && a.status !== "green").slice(0, 3);

  const attentionItems: AttentionItem[] = useMemo(() => [
    ...newRecs.filter(r => r.severity === "critical").map(r => ({ kind: "rec" as const, rec: r })),
    ...attentionAgents.filter(a => a.status === "red").map(a => ({ kind: "agent" as const, agent: a })),
    ...newRecs.filter(r => r.severity !== "critical").map(r => ({ kind: "rec" as const, rec: r })),
    ...attentionAgents.filter(a => a.status !== "red").map(a => ({ kind: "agent" as const, agent: a })),
  ], [newRecs, attentionAgents]);

  const ropTone = eqRop >= 1.5 ? "green" : eqRop >= 1.0 ? "amber" : "red";
  const noEvents = !isLoading && (counts?.events ?? 0) === 0;
  const needsRollup = !isLoading && !noEvents && !eq;

  return (
    <Layout
      title="Your AI, at a Glance"
      kicker="Dashboard"
      headerRight={
        <Pill tone="blue" className="gap-1.5">
          <Activity className="h-3 w-3" />
          {isLoading ? "Loading…" : eq ? "Live snapshot" : "Awaiting data"}
        </Pill>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Executive overview of AI economics, quality, and governance — net savings, return on spend,
          task throughput, and what needs your attention today.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">RoP · Net savings · Quality σ</Pill>
          <Pill tone="slate">{counts?.agents ?? 0} agents · {num(counts?.events ?? 0, 0)} events</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Failed to load dashboard summary. Check that you are signed in and the server is running.
        </div>
      )}

      {!isError && noEvents && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No activity recorded yet. Once agents are running, open{" "}
          <Link href="/ecl/observation" className="text-[hsl(var(--primary))] hover:underline">Observation Plane</Link>
          {" "}to review incoming events.
        </div>
      )}

      {!isError && needsRollup && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          Activity is present but metrics have not been computed yet. Open{" "}
          <Link href="/ecl/cognition" className="text-[hsl(var(--primary))] hover:underline">Cognition Plane</Link>
          {" "}and click <span className="font-medium text-foreground">Refresh</span> in the top bar.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="green"
          icon={<TrendingUp className="h-4 w-4" />}
          label="NET SAVED"
          value={usd(eqNet)}
          sub={`Weekly run-rate ${usd(eqWeekly)}`}
        />
        <KpiCard
          tone="primary"
          icon={<DollarSign className="h-4 w-4" />}
          label="RETURN ON SPEND"
          value={eq ? `${num(eqRop, 2)}×` : "—"}
          sub={eq ? `$1 spent → $${num(eqRop, 2)} back` : "No rollup yet"}
        />
        <KpiCard
          tone="orange"
          icon={<Activity className="h-4 w-4" />}
          label="TASKS COMPLETED"
          value={num(eq?.taskCount ?? counts?.events ?? 0, 0)}
          sub={`${q?.humanReviewQueued ?? 0} queued for human review`}
        />
        <KpiCard
          tone={health}
          icon={<Sparkles className="h-4 w-4" />}
          label="QUALITY SCORE"
          value={qualityLabel.label}
          sub={q ? `${pct(q.passRate, 1)} pass rate` : "No telemetry yet"}
          footer={
            q ? (
              <div className="text-xs text-muted-foreground">
                Sigma <span className="font-semibold text-foreground tabular-nums">{num(q.sigmaLevel, 1)}σ</span>
              </div>
            ) : undefined
          }
        />
      </div>

      <div className="aeos-cognition-hero aeos-cognition-total mb-6" data-testid="hero-card">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
              Live · AI performance overview
            </div>
            <div className="text-base sm:text-lg font-semibold text-foreground mt-1">
              Your AI saved{" "}
              <span className="text-[hsl(142_70%_30%)]">{usd(eqNet)}</span> this period
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {num(eq?.taskCount ?? counts?.events ?? 0, 0)} tasks · RoP {eq ? `${num(eqRop, 2)}×` : "—"} ·{" "}
              {counts?.agents ?? 0} active agents
            </div>
          </div>
          <Pill tone={health}>
            <StatusDot tone={health} />
            System health · {qualityLabel.label}
          </Pill>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <HeroStat label="Quality" value={qualityLabel.label} sub={q ? `${pct(q.passRate, 1)} correct` : "—"} />
          <HeroStat label="AI work share" value={pct(aShare, 0)} sub={`Human ${pct(1 - aShare, 0)}`} />
          <HeroStat label="Net savings" value={usd(eqNet)} sub={eq ? `Spend ${usd(eqCost)}` : "—"} />
          <HeroStat
            label="Ledger reconciled"
            value={counts ? `${counts.ledgerClosed}/${counts.ledgerRows}` : "—"}
            sub={`${pct(ledgerCloseRate, 0)} closed`}
          />
        </div>

        {vendors.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-2">
              Savings by provider
            </div>
            <div className="flex h-2.5 aeos-cognition-contribution-track overflow-hidden">
              {vendors.slice(0, 5).map(([v, d]) => {
                const share = Math.max(2, ((d.saved - d.cost) / totalNet) * 100);
                return (
                  <div
                    key={v}
                    className="aeos-cognition-contribution-fill h-full"
                    style={{ width: `${share}%`, background: vendorTint(v) }}
                    title={`${v} · ${usd(d.saved - d.cost)} net`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
              {vendors.slice(0, 5).map(([v, d]) => (
                <span key={v} className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0" style={{ background: vendorTint(v) }} />
                  {v} · {usd(d.saved - d.cost)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-5 items-start mb-6">
        <SectionCard kicker="Financial impact" title="Key equation metrics">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <MetricTile
              label="Return on investment"
              value={eq ? `${num(eqRop, 2)}×` : "—"}
              sub={`${usd(eqNet)} net saved`}
              tone={ropTone}
              tip="For every $1 spent on AI, how much value you get back."
            />
            <MetricTile
              label="Cost per task"
              value={eq ? usd(eq.cuow) : "—"}
              sub={`${num(eq?.taskCount ?? 0, 0)} tasks`}
              tone="blue"
              tip="Average cost to complete one AI task including model and platform fees."
            />
            <MetricTile
              label="Savings efficiency"
              value={eq ? num(eq.mer, 2) : "—"}
              sub={`${usd(ec?.avgSavedPerEvent ?? 0)} saved / task`}
              tone="green"
              tip="How efficiently spend converts into labor value saved."
            />
          </div>
          <Link href="/insights/equations" className="aeos-btn aeos-btn-secondary">
            AI Performance equations
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SectionCard>

        <SectionCard kicker="Quality & reliability" title="How your AI is performing" className="h-fit">
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-3xl font-bold ${
              qualityLabel.tone === "green" ? "text-[hsl(142_70%_35%)]"
                : qualityLabel.tone === "amber" ? "text-[hsl(28_90%_38%)]"
                  : qualityLabel.tone === "red" ? "text-[hsl(0_72%_44%)]"
                    : "text-[hsl(213_84%_42%)]"
            }`}>
              {qualityLabel.label}
            </span>
            <Pill tone={qualityLabel.tone === "blue" ? "blue" : qualityLabel.tone}>
              {num(q?.sigmaLevel ?? 0, 1)}σ
            </Pill>
          </div>

          <div className="space-y-3">
            <BarRow
              label="Task completion rate"
              value={q ? pct(q.passRate, 1) : "—"}
              pct={q?.passRate ?? 0}
              fill="hsl(142 70% 42%)"
              tip="Percentage of AI tasks completed without errors."
            />
            <BarRow
              label="Human review rate"
              value={eq ? pct(eq.ctr, 1) : "—"}
              pct={eq?.ctr ?? 0}
              fill="hsl(38 96% 50%)"
              tip="Tasks flagged and sent to a human before completing."
            />
          </div>

          <p className="text-xs text-muted-foreground mt-3">
            {q?.humanReviewQueued ?? 0} tasks currently flagged for human check
          </p>
        </SectionCard>
      </div>

      <SectionCard
        kicker="Action queue"
        title="What needs your attention"
        padding={false}
        className="mb-6"
        action={
          attentionItems.length > 0 ? (
            <Link href="/ecl/recommendations" className="aeos-btn aeos-btn-secondary aeos-btn--sm">
              View all
              <ArrowRight className="h-3 w-3" />
            </Link>
          ) : undefined
        }
      >
        {attentionItems.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-[hsl(142_70%_42%)] opacity-80" />
            All systems running smoothly — no action needed right now.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {attentionItems.map(item =>
              item.kind === "rec"
                ? <RecRow key={`rec-${item.rec.recId}`} r={item.rec} />
                : <AgentRow key={`agent-${item.agent.agentId}`} a={item.agent} />,
            )}
          </ul>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <SectionCard kicker="Work split" title="AI vs human contribution">
          {eq && (eq.huop + eq.auop) > 0 ? (
            <div className="space-y-4">
              <ShareBar label="AI agents" icon={<Bot className="h-3.5 w-3.5" />} value={aShare} fill="hsl(var(--primary))" />
              <ShareBar label="Human team" icon={<Users className="h-3.5 w-3.5" />} value={1 - aShare} fill="hsl(220 15% 55%)" />
              <div className="rounded-none border border-border/60 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground flex items-start gap-2">
                <Zap className="h-4 w-4 shrink-0 mt-0.5 text-[hsl(var(--primary))]" />
                <span>
                  Working together produces{" "}
                  <strong className="text-foreground">{num(eq.synergyS, 2)}×</strong> more output
                  than either team alone · combined {usd(eq.tuop, { decimals: 0 })}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No production split data yet.</p>
          )}
        </SectionCard>

        <SectionCard kicker="Run-rate" title="Economics at a glance">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <RunRateTile label="This week" value={usd(eqWeekly)} highlight />
            <RunRateTile label="Work value" value={usd(eqLaborSaved)} />
            <RunRateTile label="AI spend" value={usd(eqCost)} />
          </div>
          <Link href="/insights/financial" className="aeos-btn aeos-btn-primary w-full mt-4">
            Financial Impact
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </SectionCard>
      </div>

      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
        Explore your data
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <PlaneCard
          icon={<Eye className="h-4 w-4" />}
          title="Events & Activity"
          to="/ecl/observation"
          stat={`${num(counts?.events ?? 0, 0)} events`}
          sub={`${counts?.coverageEntries ?? 0} surfaces · ${counts?.coverageGaps ?? 0} gaps`}
        />
        <PlaneCard
          icon={<BookCheck className="h-4 w-4" />}
          title="Financial Records"
          to="/ecl/ledger"
          stat={`${counts?.ledgerClosed ?? 0}/${counts?.ledgerRows ?? 0} closed`}
          sub={`${counts?.ledgerOpen ?? 0} open · ${pct(ledgerCloseRate, 0)} reconciled`}
        />
        <PlaneCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Governance & Approvals"
          to="/governance/audit"
          stat={`${counts?.governanceDecisions7d ?? 0} decisions (7d)`}
          sub={`${counts?.newRecommendations ?? 0} recommendations pending`}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <KpiCard
          tone="green"
          icon={<Award className="h-4 w-4" />}
          label="SAVINGS THIS WEEK"
          value={usd(eqWeekly)}
          sub={`On track for ${usd(eqWeekly * 52)} / year`}
        />
        <KpiCard
          tone="primary"
          icon={<Database className="h-4 w-4" />}
          label="WORK VALUE CREATED"
          value={usd(eqLaborSaved)}
          sub={`Across ${num(counts?.events ?? 0, 0)} tasks`}
        />
        <KpiCard
          tone="orange"
          icon={<ScanSearch className="h-4 w-4" />}
          label="TOTAL AI SPEND"
          value={usd(eqCost)}
          sub={`${num(ec?.totalTokens ?? 0, 0)} model tokens`}
        />
      </div>
    </Layout>
  );
}

function HeroStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-none border border-border/60 bg-muted/20 px-3 py-2.5 min-w-0 overflow-hidden">
      <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground truncate">{label}</div>
      <div className="text-base sm:text-lg font-bold tabular-nums mt-0.5 text-foreground truncate" title={value}>{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={sub}>{sub}</div>
    </div>
  );
}

function MetricTile({
  label, value, sub, tone, tip,
}: {
  label: string; value: string; sub: string;
  tone: "green" | "amber" | "red" | "blue";
  tip: string;
}) {
  const border =
    tone === "green" ? "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
      : tone === "amber" ? "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]"
        : tone === "red" ? "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]"
          : "border-[hsl(213_94%_82%)] bg-[hsl(213_100%_97%)]";

  return (
    <div className={`rounded-none border-l-4 px-3 py-2 ${border}`}>
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
        {label}
        <InfoTip text={tip} />
      </div>
      <div className="text-xl font-bold tabular-nums mt-1">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

function BarRow({
  label, value, pct: pctVal, fill, tip,
}: {
  label: string; value: string; pct: number; fill: string; tip: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
        <span className="inline-flex items-center gap-1">
          {label}
          <InfoTip text={tip} />
        </span>
        <span className="font-semibold text-foreground tabular-nums">{value}</span>
      </div>
      <div className="aeos-cognition-contribution-track h-2.5">
        <div
          className="aeos-cognition-contribution-fill"
          style={{ width: `${Math.min(100, Math.max(2, pctVal * 100))}%`, background: fill }}
        />
      </div>
    </div>
  );
}

function ShareBar({
  label, icon, value, fill,
}: {
  label: string; icon: React.ReactNode; value: number; fill: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
        <span className="font-semibold tabular-nums">{pct(value, 0)}</span>
      </div>
      <div className="aeos-cognition-contribution-track h-3">
        <div
          className="aeos-cognition-contribution-fill"
          style={{ width: `${Math.max(2, value * 100)}%`, background: fill }}
        />
      </div>
    </div>
  );
}

function RunRateTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-none border p-3 ${highlight ? "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.06)]" : "border-border bg-muted/20"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-0.5 ${highlight ? "text-[hsl(var(--primary))]" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function PlaneCard({ icon, title, to, stat, sub }: {
  icon: React.ReactNode; title: string; to: string; stat: string; sub: string;
}) {
  return (
    <Link href={to} className="aeos-link-card group" data-testid={`plane-${title}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="aeos-link-card-icon shrink-0">{icon}</div>
          <div className="text-sm font-semibold truncate">{title}</div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="text-2xl font-bold tabular-nums mb-1">{stat}</div>
      <p className="text-xs text-muted-foreground leading-relaxed">{sub}</p>
    </Link>
  );
}

function RecRow({ r }: { r: Rec }) {
  return (
    <li className="px-4 sm:px-5 py-3.5 hover:bg-muted/30 transition-colors">
      <Link href="/ecl/recommendations" className="flex items-start gap-3 min-w-0">
        <SeverityBadge severity={r.severity} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-foreground leading-snug">{r.title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.rationale}</div>
          {r.predictedDeltaUsd != null && (
            <div className="text-[11px] mt-1 text-[hsl(142_70%_30%)] font-semibold">
              {r.predictedDeltaUsd > 0 ? "+" : ""}{usd(r.predictedDeltaUsd)}/week potential
            </div>
          )}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
      </Link>
    </li>
  );
}

function AgentRow({ a }: { a: Agent }) {
  const ql = sigmaToLabel(a.status === "red" ? 2.6 : a.status === "amber" ? 3.1 : 4.1);
  return (
    <li className="px-4 sm:px-5 py-3.5 hover:bg-muted/30 transition-colors">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <StatusDot tone={a.status === "red" ? "red" : a.status === "amber" ? "amber" : "green"} />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-foreground truncate">{a.name}</div>
            <div className="text-xs text-muted-foreground">Agent needs attention — check performance</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:shrink-0 pl-6 sm:pl-0">
          <Pill tone={ql.tone}>{ql.label}</Pill>
          <Link href="/agents" className="aeos-btn aeos-btn-secondary aeos-btn--sm shrink-0">
            View
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const tone = severity === "critical" ? "red" : severity === "warn" ? "amber" : "blue";
  return (
    <div className={`mt-0.5 h-7 w-7 rounded-none grid place-items-center shrink-0 ${
      tone === "red" ? "bg-[hsl(0_85%_94%)]"
        : tone === "amber" ? "bg-[hsl(38_96%_92%)]"
          : "bg-[hsl(213_100%_94%)]"
    }`}>
      <AlertTriangle className={`h-3.5 w-3.5 ${
        tone === "red" ? "text-[hsl(0_72%_44%)]"
          : tone === "amber" ? "text-[hsl(28_90%_38%)]"
            : "text-[hsl(213_84%_42%)]"
      }`} />
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info size={12} className="text-muted-foreground cursor-help shrink-0 inline" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
