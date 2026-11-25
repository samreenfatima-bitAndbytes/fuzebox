import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { usd, num, pct } from "@/lib/format";
import {
  Gauge, TrendingUp, DollarSign, Activity, CheckCircle2,
  Users, Bot, ArrowRight, ChevronDown, ChevronUp,
} from "lucide-react";

type Snap = {
  id: number; computedAt: string; cuow: number; abt: number; mer: number;
  ctr: number; tv: number; rop: number; tuop: number; huop: number; auop: number;
  synergyS: number; taskCount: number;
};

type Summary = {
  economics: {
    laborValueSavedUsd: number; amortizedCostUsd: number; netSavingsUsd: number;
    weeklyRunRateUsd: number; ropAvg: number; totalTokens: number;
    avgCostPerEvent: number; avgSavedPerEvent: number;
  };
  quality: { passRate: number; humanReviewQueued: number; sigmaLevel: number };
  counts: { events: number; ledgerRows: number; ledgerClosed: number };
  latestEquations?: Snap | null;
};

type HealthStatus = "good" | "watch" | "alert";
type MetricKey = "rop" | "abt" | "cuow" | "mer" | "ctr" | "tv";

type MetricDef = {
  key: MetricKey;
  title: string;
  acronym: string;
  getValue: (ctx: MetricContext) => string;
  getHealth: (ctx: MetricContext) => HealthStatus;
  barCurrent: (ctx: MetricContext) => number;
  barMax: number;
  barTarget: number;
  targetLabel: string;
  invertBar?: boolean;
  summary: (ctx: MetricContext) => string;
  formula: string;
  worked: (ctx: MetricContext) => { l: string; r: string }[];
};

type MetricContext = {
  eq: Snap | undefined;
  ec: Summary["economics"] | undefined;
  quality: Summary["quality"] | undefined;
  events: number;
  humanCostPerTask: number;
  agentCostPerTask: number;
};

function metricHealth(metric: MetricKey, value: number): HealthStatus {
  if (metric === "rop")  return value >= 1.5 ? "good" : value >= 1.0 ? "watch" : "alert";
  if (metric === "abt")  return value >= 2.0 ? "good" : value >= 1.0 ? "watch" : "alert";
  if (metric === "cuow") return value <= 4.38 ? "good" : value <= 8 ? "watch" : "alert";
  if (metric === "mer")  return value >= 10  ? "good" : value >= 3   ? "watch" : "alert";
  if (metric === "ctr")  return value <= 0.1 ? "good" : value <= 0.3 ? "watch" : "alert";
  if (metric === "tv")   return value >= 1.2 ? "good" : value >= 1.0 ? "watch" : "alert";
  return "good";
}

function healthTone(h: HealthStatus): "green" | "amber" | "red" {
  if (h === "good") return "green";
  if (h === "watch") return "amber";
  return "red";
}

function healthLabel(h: HealthStatus): string {
  if (h === "good") return "Healthy";
  if (h === "watch") return "Watch";
  return "Needs attention";
}

function progressFill(h: HealthStatus): string {
  if (h === "good") return "hsl(142 70% 42%)";
  if (h === "watch") return "hsl(38 96% 50%)";
  return "hsl(0 72% 50%)";
}

function overallHealth(statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes("alert")) return "alert";
  if (statuses.includes("watch")) return "watch";
  return "good";
}

type MetricRow = {
  def: MetricDef;
  value: string;
  health: HealthStatus;
  barPct: number;
  targetPct: number;
};

const METRICS: MetricDef[] = [
  {
    key: "rop",
    title: "Return on Investment",
    acronym: "RoP",
    getValue: ({ eq }) => (eq ? `${num(eq.rop, 2)}×` : "—"),
    getHealth: ({ eq }) => (eq ? metricHealth("rop", eq.rop) : "watch"),
    barCurrent: ({ eq }) => eq?.rop ?? 0,
    barMax: 5,
    barTarget: 1.0,
    targetLabel: "≥ 1.0×",
    summary: ({ eq, ec }) =>
      eq && ec
        ? eq.rop >= 1.0
          ? `For every $1 spent on AI, you get $${num(eq.rop, 2)} of value back. The AI is paying for itself.`
          : "The AI is spending more than it saves right now. The target is 1.0× — review which agents are underperforming."
        : "No data yet.",
    formula: "RoP = value_of_work_done ÷ cost_to_run_the_AI",
    worked: ({ eq, ec }) => [
      { l: "Value of work done by AI", r: usd(ec?.laborValueSavedUsd ?? 0) },
      { l: "÷ Cost to run the AI", r: usd(ec?.amortizedCostUsd ?? 0) },
      { l: "= Return on investment", r: eq ? `${num(eq.rop, 2)}×` : "—" },
    ],
  },
  {
    key: "abt",
    title: "Cheaper Than a Human?",
    acronym: "ABT",
    getValue: ({ eq }) => (eq ? `${num(eq.abt, 2)}×` : "—"),
    getHealth: ({ eq }) => (eq ? metricHealth("abt", eq.abt) : "watch"),
    barCurrent: ({ eq }) => eq?.abt ?? 0,
    barMax: 10,
    barTarget: 1.0,
    targetLabel: "≥ 1.0×",
    summary: ({ eq }) =>
      eq
        ? eq.abt >= 1.0
          ? `Yes — the AI handles each task at ${num(eq.abt, 1)}× below what a human would cost. Automation is clearly worthwhile.`
          : "Not yet — the AI costs more per task than a human would. Review agent efficiency settings."
        : "No data yet.",
    formula: "ABT = human_cost_per_task ÷ AI_cost_per_task",
    worked: ({ eq, humanCostPerTask, agentCostPerTask }) => [
      { l: "Human cost per task (est.)", r: usd(humanCostPerTask, { decimals: 2 }) },
      { l: "÷ AI cost per task", r: usd(agentCostPerTask) },
      { l: "= How much cheaper AI is", r: eq ? `${num(eq.abt, 2)}×` : "—" },
    ],
  },
  {
    key: "cuow",
    title: "Cost Per Task",
    acronym: "CUoW",
    getValue: ({ eq }) => (eq ? usd(eq.cuow) : "—"),
    getHealth: ({ eq }) => (eq ? metricHealth("cuow", eq.cuow) : "watch"),
    barCurrent: ({ eq }) => eq?.cuow ?? 0,
    barMax: 4.38,
    barTarget: 4.38,
    targetLabel: "< $4.38 human cost",
    invertBar: true,
    summary: ({ eq, humanCostPerTask, agentCostPerTask }) =>
      eq && agentCostPerTask > 0
        ? `Each AI task costs ${usd(eq.cuow)}. A human doing the same work would cost ~${usd(humanCostPerTask, { decimals: 2 })} — that's ${num(humanCostPerTask / eq.cuow, 0)}× more expensive.`
        : "No data yet.",
    formula: "CUoW = total_running_cost ÷ tasks_completed",
    worked: ({ eq, ec, events }) => [
      { l: "Total AI running cost", r: usd(ec?.amortizedCostUsd ?? 0) },
      { l: "÷ Tasks completed", r: num(events, 0) },
      { l: "= Cost per task", r: eq ? usd(eq.cuow) : "—" },
    ],
  },
  {
    key: "mer",
    title: "Quality vs Cost",
    acronym: "MER",
    getValue: ({ eq }) => (eq ? num(eq.mer, 2) : "—"),
    getHealth: ({ eq }) => (eq ? metricHealth("mer", eq.mer) : "watch"),
    barCurrent: ({ eq }) => eq?.mer ?? 0,
    barMax: 30,
    barTarget: 5,
    targetLabel: "≥ 5",
    summary: ({ eq, ec }) =>
      eq && ec
        ? `For every ${usd(ec.avgCostPerEvent)} spent, you get ${usd(ec.avgSavedPerEvent, { decimals: 2 })} of quality output. Higher is better.`
        : "No data yet.",
    formula: "MER = average_quality_score ÷ cost_per_task",
    worked: ({ eq, quality }) => [
      { l: "Average quality confidence", r: quality ? num(quality.passRate, 3) : "—" },
      { l: "÷ Cost per task", r: eq ? usd(eq.cuow) : "—" },
      { l: "= Quality-to-cost ratio", r: eq ? num(eq.mer, 2) : "—" },
    ],
  },
  {
    key: "ctr",
    title: "Human Approval Delay",
    acronym: "CTR",
    getValue: ({ eq }) => (eq ? pct(eq.ctr) : "—"),
    getHealth: ({ eq }) => (eq ? metricHealth("ctr", eq.ctr) : "watch"),
    barCurrent: ({ eq }) => eq?.ctr ?? 0,
    barMax: 0.6,
    barTarget: 0.1,
    targetLabel: "≤ 10%",
    invertBar: true,
    summary: ({ eq }) =>
      eq
        ? eq.ctr <= 0.1
          ? `Only ${pct(eq.ctr, 1)} of tasks need human approval — your AI is running smoothly with minimal interruptions.`
          : `${pct(eq.ctr, 1)} of tasks are waiting for human review. Reducing this improves speed and cuts cost.`
        : "No data yet.",
    formula: "CTR = tasks_waiting_for_human ÷ total_tasks",
    worked: ({ eq, quality, events }) => [
      { l: "Tasks waiting for human review", r: num(quality?.humanReviewQueued ?? 0, 0) },
      { l: "÷ Total tasks processed", r: num(events, 0) },
      { l: "= Approval delay ratio", r: eq ? pct(eq.ctr, 1) : "—" },
    ],
  },
  {
    key: "tv",
    title: "AI Adoption Speed",
    acronym: "TV",
    getValue: ({ eq }) => (eq ? `${num(eq.tv, 2)}×` : "—"),
    getHealth: ({ eq }) => (eq ? metricHealth("tv", eq.tv) : "watch"),
    barCurrent: ({ eq }) => eq?.tv ?? 0,
    barMax: 1.6,
    barTarget: 1.0,
    targetLabel: "≥ 1.0×",
    summary: ({ eq }) =>
      eq
        ? eq.tv >= 1.0
          ? `Your AI is gaining productive capacity ${num(eq.tv, 2)}× faster than running costs are rising. A healthy growth signal.`
          : "Running costs are rising faster than the value the AI is delivering. Consider auditing underperforming agents."
        : "No data yet.",
    formula: "TV = actual_return ÷ target_return",
    worked: ({ eq, ec }) => [
      { l: "Actual return (ROI)", r: ec ? `${num(ec.ropAvg, 2)}×` : "—" },
      { l: "÷ Target return", r: "1.00×" },
      { l: "= Adoption speed score", r: eq ? `${num(eq.tv, 2)}×` : "—" },
    ],
  },
];

export default function FiveEquations() {
  const equationsKey = ["/api/pel/equations?hours=720"];
  const { data: snaps, isLoading, isError: snapsError } = useQuery<Snap[]>({ queryKey: equationsKey });
  const { data: s, isError: summaryError } = useQuery<Summary>({ queryKey: ["/api/dashboard/summary"] });

  const eq = (snaps ?? [])[(snaps ?? []).length - 1] ?? s?.latestEquations ?? undefined;
  const ec = s?.economics;
  const events = s?.counts.events ?? 0;
  const humanCostPerTask = 75 * (3.5 / 60);
  const agentCostPerTask = ec && events > 0 ? ec.amortizedCostUsd / events : 0;

  const ctx: MetricContext = {
    eq,
    ec,
    quality: s?.quality,
    events,
    humanCostPerTask,
    agentCostPerTask,
  };

  const rows = useMemo(
    () =>
      METRICS.map((m) => {
        const health = m.getHealth(ctx);
        return {
          def: m,
          value: m.getValue(ctx),
          health,
          barPct: m.barMax > 0 ? Math.min(100, (m.barCurrent(ctx) / m.barMax) * 100) : 0,
          targetPct: m.barMax > 0 ? Math.min(98, (m.barTarget / m.barMax) * 100) : 0,
        };
      }),
    [eq, ec, events, s?.quality, humanCostPerTask, agentCostPerTask],
  );

  const statuses = rows.map((r) => r.health);
  const overall = eq ? overallHealth(statuses) : "watch";
  const healthyCount = eq ? statuses.filter((h) => h === "good").length : 0;
  const watchCount = eq ? statuses.filter((h) => h === "watch").length : 0;
  const alertCount = eq ? statuses.filter((h) => h === "alert").length : 0;

  const hasEvents = events > 0;
  const noEvents = !isLoading && !hasEvents;
  const needsRollup = !isLoading && hasEvents && !eq;
  const isError = snapsError || summaryError;

  const [activeKey, setActiveKey] = useState<MetricKey>("rop");
  const activeRow = rows.find((r) => r.def.key === activeKey) ?? rows[0];

  useEffect(() => {
    if (!rows.length) return;
    const worst = [...rows].sort((a, b) => {
      const rank = (h: HealthStatus) => (h === "alert" ? 0 : h === "watch" ? 1 : 2);
      return rank(a.health) - rank(b.health);
    })[0];
    if (worst && !rows.some((r) => r.def.key === activeKey)) {
      setActiveKey(worst.def.key);
    }
  }, [rows, activeKey]);

  const humanShare = eq && (eq.huop + eq.auop) > 0 ? eq.huop / (eq.huop + eq.auop) : 0;
  const aiShare = 1 - humanShare;

  return (
    <Layout
      title="AI Performance"
      kicker="Insights / AI Performance"
      headerRight={
        <Pill tone="blue" className="gap-1.5">
          <Gauge className="h-3 w-3" />
          {isLoading ? "Loading…" : eq ? "Live equations" : hasEvents ? "Awaiting refresh" : "No snapshot"}
        </Pill>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Six equations that show how well your AI investment is performing — RoP, cost efficiency,
          quality ratio, human gate pressure, and adoption velocity. Updated from the latest PEL rollup.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">Five business equations + CUoW</Pill>
          <Pill tone="slate">Live PEL snapshot</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Failed to load equation data. Check that you are signed in and the server is running.
        </div>
      )}

      {!isError && noEvents && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No activity recorded yet. Once agents are running, metrics will appear here after you refresh on{" "}
          <Link href="/ecl/cognition" className="text-[hsl(var(--primary))] hover:underline">Cognition Plane</Link>.
        </div>
      )}

      {!isError && needsRollup && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          Activity is present but performance metrics have not been computed yet. Open{" "}
          <Link href="/ecl/cognition" className="text-[hsl(var(--primary))] hover:underline">Cognition Plane</Link>
          {" "}and click <span className="font-medium text-foreground">Refresh</span> in the top bar.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="green"
          icon={<TrendingUp className="h-4 w-4" />}
          label="RETURN ON AI SPEND"
          value={eq ? `${num(eq.rop, 2)}×` : "—"}
          sub="RoP · target ≥ 1.0×"
        />
        <KpiCard
          tone="primary"
          icon={<DollarSign className="h-4 w-4" />}
          label="NET SAVED"
          value={usd(ec?.netSavingsUsd ?? 0)}
          sub={`${usd(ec?.laborValueSavedUsd ?? 0)} value · ${usd(ec?.amortizedCostUsd ?? 0)} cost`}
        />
        <KpiCard
          tone="orange"
          icon={<Activity className="h-4 w-4" />}
          label="TASKS PROCESSED"
          value={num(events, 0)}
          sub={`${num(s?.quality.humanReviewQueued ?? 0, 0)} in human review queue`}
        />
        <KpiCard
          tone={overall === "good" ? "green" : overall === "watch" ? "amber" : "red"}
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="EQUATION HEALTH"
          value={eq ? `${healthyCount}/6` : "—"}
          sub={eq ? "Metrics at healthy threshold" : "Refresh on Cognition Plane"}
          footer={
            <div className="text-xs text-muted-foreground">
              {alertCount > 0 && <span className="text-[hsl(0_72%_44%)] font-semibold">{alertCount} alert</span>}
              {alertCount > 0 && watchCount > 0 && " · "}
              {watchCount > 0 && <span className="text-[hsl(28_90%_38%)] font-semibold">{watchCount} watch</span>}
              {alertCount === 0 && watchCount === 0 && eq && "All thresholds met"}
              {!eq && "No snapshot yet"}
            </div>
          }
        />
      </div>

      {eq ? (
        <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
              Latest rollup
            </div>
            <div className="text-sm font-semibold text-foreground mt-1 break-words">
              {num(events, 0)} tasks · RoP {num(eq.rop, 2)}× · Net {usd(ec?.netSavingsUsd ?? 0)}
            </div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Combined output {usd(eq.tuop, { decimals: 0 })} · Synergy {num(eq.synergyS, 2)}
            </div>
          </div>
          <Pill tone={healthTone(overall)} className="self-start sm:self-center shrink-0">
            <StatusDot tone={healthTone(overall)} />
            {overall === "good" ? "All systems healthy" : overall === "watch" ? "Metrics need attention" : "Action recommended"}
          </Pill>
        </div>
      ) : needsRollup || noEvents ? null : (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 mb-6 text-sm text-muted-foreground">
          Waiting for data — open Cognition Plane and click <span className="font-medium text-foreground">Refresh</span> in the top bar after agents process tasks.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start mb-6 min-w-0">
        <SectionCard kicker="Equations" title="Six performance metrics" padding={false} className="min-w-0">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[34rem] xl:min-w-0">
            <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th>Metric</Th>
                <Th>Value</Th>
                <Th>Status</Th>
                <Th>Progress</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ def, value, health, barPct, targetPct }) => (
                <tr
                  key={def.key}
                  className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                    activeKey === def.key ? "bg-primary/5" : ""
                  }`}
                  onClick={() => setActiveKey(def.key)}
                  data-testid={`row-equation-${def.key}`}
                >
                  <Td>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 shrink-0">
                        {def.acronym}
                      </span>
                      <span className="font-medium truncate max-w-[9rem] sm:max-w-[14rem] xl:max-w-none">{def.title}</span>
                    </div>
                  </Td>
                  <Td className="font-semibold tabular-nums whitespace-nowrap">{value}</Td>
                  <Td>
                    <Pill tone={eq ? healthTone(health) : "slate"}>
                      {eq && <StatusDot tone={healthTone(health)} />}
                      {eq ? healthLabel(health) : "No data"}
                    </Pill>
                  </Td>
                  <Td className="min-w-[7.5rem] sm:min-w-[140px]">
                    <div className="relative aeos-cognition-contribution-track h-2">
                      <div
                        className="aeos-cognition-contribution-fill"
                        style={{ width: `${barPct}%`, background: progressFill(health) }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-3 w-px bg-foreground/20"
                        style={{ left: `${targetPct}%` }}
                        title={`Target: ${def.targetLabel}`}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">{def.targetLabel}</div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </SectionCard>

        <SectionCard className="h-fit min-w-0" kicker="Equation detail" title={activeRow?.def.title ?? "Select a metric"}>
          {!activeRow || !eq ? (
            <p className="text-sm text-muted-foreground">
              Click any row to see the plain-English summary and worked calculation.
            </p>
          ) : (
            <MetricDetail row={activeRow} ctx={ctx} />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
        <SectionCard className="xl:col-span-2 min-w-0" kicker="Work split" title="AI vs human productive output">
          {eq && (eq.huop + eq.auop) > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your AI handles {pct(aiShare, 0)} of total productive output. Combined, AI and humans
                produce {usd(eq.tuop, { decimals: 0 })} — more than either could achieve alone.
              </p>
              <ShareBar
                label="AI agents"
                icon={<Bot className="h-3.5 w-3.5" />}
                value={aiShare}
                fill="hsl(var(--primary))"
                amount={usd(eq.auop, { decimals: 0 })}
              />
              <ShareBar
                label="Human team"
                icon={<Users className="h-3.5 w-3.5" />}
                value={humanShare}
                fill="hsl(220 15% 55%)"
                amount={usd(eq.huop, { decimals: 0 })}
              />
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pt-3 border-t border-border/60">
                <span className="text-sm font-semibold">Combined total output (TUoP)</span>
                <span className="text-base font-bold tabular-nums text-[hsl(var(--primary))] truncate">
                  {usd(eq.tuop, { decimals: 0 })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Synergy factor {num(eq.synergyS, 2)} — routine AI work frees humans for higher-value decisions.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No production data yet — open Cognition Plane and click <span className="font-medium text-foreground">Refresh</span> in the top bar once agents are active.
            </p>
          )}
        </SectionCard>

        <SectionCard kicker="Related" title="Master equation" className="min-w-0">
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            These six equations feed the Cognition Plane master equation — RoP, TUoP, and the full
            contribution breakdown across observation and execution layers.
          </p>
          <Link href="/ecl/cognition" className="aeos-btn aeos-btn-primary w-full">
            Open Cognition Plane
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <p className="mt-4 pt-4 border-t border-border/60 text-[11px] text-muted-foreground leading-relaxed">
            After new agent activity, open Cognition Plane and click <span className="font-medium text-foreground">Refresh</span> in the top bar to update these metrics.
          </p>
        </SectionCard>
      </div>
    </Layout>
  );
}

function MetricDetail({ row, ctx }: { row: MetricRow; ctx: MetricContext }) {
  const { def, value, health } = row;
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className={`rounded-none border-l-4 px-3 py-2 ${
        health === "good"
          ? "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
          : health === "watch"
            ? "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]"
            : "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]"
      }`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
              {def.acronym}
            </div>
            <div className="text-xl sm:text-2xl font-bold tabular-nums mt-0.5 truncate" title={value}>{value}</div>
          </div>
          <Pill tone={healthTone(health)} className="self-start sm:self-center shrink-0">
            <StatusDot tone={healthTone(health)} />
            {healthLabel(health)}
          </Pill>
        </div>
        <div className="aeos-cognition-contribution-track h-2 mt-3">
          <div
            className="aeos-cognition-contribution-fill"
            style={{
              width: `${def.barMax > 0 ? Math.min(100, (def.barCurrent(ctx) / def.barMax) * 100) : 0}%`,
              background: progressFill(health),
            }}
          />
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">Target: {def.targetLabel}</div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{def.summary(ctx)}</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {open ? "Hide" : "Show"} how it&apos;s calculated
      </button>

      {open && (
        <div className="rounded-none border bg-muted/30 px-3 py-2.5 space-y-2">
          <code className="block text-[10px] font-mono text-muted-foreground border-b border-border/60 pb-1.5 mb-1.5">
            {def.formula}
          </code>
          <table className="w-full text-xs">
            <tbody>
              {def.worked(ctx).map((r, i, arr) => (
                <tr key={i} className={i === arr.length - 1 ? "border-t border-border/60" : ""}>
                  <td className={`py-1 ${i === arr.length - 1 ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {r.l}
                  </td>
                  <td className={`py-1 text-right tabular-nums ${i === arr.length - 1 ? "font-semibold text-foreground" : ""}`}>
                    {r.r}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShareBar({
  label,
  icon,
  value,
  fill,
  amount,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  fill: string;
  amount: string;
}) {
  return (
    <div>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-sm mb-1.5">
        <span className="flex items-center gap-1.5 text-muted-foreground min-w-0">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        <div className="flex items-center gap-2 shrink-0 pl-6 sm:pl-0">
          <span className="font-semibold tabular-nums">{pct(value, 0)}</span>
          <span className="text-xs text-muted-foreground tabular-nums truncate max-w-[8rem] sm:max-w-none">{amount}</span>
        </div>
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

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 sm:px-5 py-2.5 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 sm:px-5 py-2.5 ${className ?? ""}`}>{children}</td>;
}
