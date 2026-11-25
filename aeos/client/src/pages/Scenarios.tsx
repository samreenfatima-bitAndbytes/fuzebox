import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  FlaskConical, UserPlus, Users, Gauge,
  TrendingUp, TrendingDown, Minus, Sparkles, ArrowRight,
  Activity, CheckCircle2, DollarSign,
} from "lucide-react";
import { usd, num, pct } from "@/lib/format";

type ScenarioTab = "add" | "headcount" | "scale";

function humanizeLabel(raw: string): string {
  const stripped = raw.replace(/^(agt_|agent[-_]?)/i, "").replace(/[-_]+/g, " ").trim();
  if (!stripped) return raw;
  return stripped.replace(/\b\w/g, (c) => c.toUpperCase());
}

type BaselineProcess = {
  id: string;
  name: string;
  workflowId: string | null;
  suggestedAgentName: string | null;
  baseCoverage: number;
  baseRoi: number;
  eventCount: number;
};

type BaselineHeadcount = {
  baseHeadcount: number;
  weeklySalary: number;
  baseRoi: number;
  humanReviewQueued: number;
  observationDays: number;
};

type BaselineAgent = {
  id: string;
  name: string;
  baseCost: number;
  baseRuns: number;
  weeklyRoi: number;
  setup: number;
};

type ScenariosBaseline = {
  processes: BaselineProcess[];
  headcount: BaselineHeadcount;
  agents: BaselineAgent[];
  meta: {
    eventCount: number;
    weeklyNetUsd: number;
    eventQualityPassRate: number;
    surfaceCoverageRatio: number | null;
    source: string;
  };
};

/* ============================================================
 * Scenario 1 — Add an Agent
 * ============================================================ */
function AddAgentScenario({ processes, embedded }: { processes: BaselineProcess[]; embedded?: boolean }) {
  const [processId, setProcessId] = useState(processes[0]?.id ?? "");
  const [agentName, setAgentName] = useState("");
  const [tasks, setTasks] = useState(2);

  useEffect(() => {
    if (!processes.length) return;
    if (!processes.some((p) => p.id === processId)) {
      setProcessId(processes[0].id);
    }
  }, [processes, processId]);

  useEffect(() => {
    const p = processes.find((x) => x.id === processId);
    if (!p) return;
    setAgentName((p.suggestedAgentName ?? "").trim());
  }, [processId, processes]);

  const proc = processes.find((p) => p.id === processId) ?? processes[0];
  if (!proc || proc.id === "_empty" || proc.eventCount === 0) {
    return embedded ? (
      <p className="text-sm text-muted-foreground">
        No processes with activity yet. Once agents are running, return here to model adding a new agent.
      </p>
    ) : (
      <SectionCard kicker="Scenario 1" title={<span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add an Agent</span>}>
        <p className="text-sm text-muted-foreground">
          No processes with activity yet. Once agents are running, return here to model adding a new agent.
        </p>
      </SectionCard>
    );
  }

  const coverageFloor = Math.max(0.08, proc.baseCoverage);
  const coverageDelta = tasks * 0.10;
  const newCoverage = Math.min(1, coverageFloor + coverageDelta);
  const sigma = tasks <= 1 ? 2.0 : tasks <= 3 ? 3.5 : 5.0;
  const sigmaLabel = tasks <= 1 ? "low" : tasks <= 3 ? "moderate" : "high";
  const newRoi = proc.baseRoi * (newCoverage / coverageFloor);
  const roiDelta = newRoi - proc.baseRoi;

  const body = (
    <>
      <p className="text-xs text-muted-foreground mb-4">
        Model the impact of deploying a new agent to a process. Process labels use your UoP library name when <code className="text-[11px]">workflow_id</code> matches; otherwise the id is humanized. Agent name defaults to the most common agent seen in that workflow (editable).
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-5">
        <div className="space-y-1.5">
          <Label className="text-[11px]">Process</Label>
          <Select value={processId} onValueChange={setProcessId}>
            <SelectTrigger data-testid="select-process"><SelectValue /></SelectTrigger>
            <SelectContent>
              {processes.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}{p.eventCount > 0 ? ` · ${p.eventCount} ev` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {proc.workflowId && (
            <p className="text-[10px] text-muted-foreground font-mono leading-snug">
              workflow_id: {proc.workflowId}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px]">Agent Name</Label>
          <Input
            value={agentName}
            onChange={e => setAgentName(e.target.value)}
            placeholder={proc.suggestedAgentName ? "Suggested from telemetry (editable)" : "Name for the agent you are adding"}
            data-testid="input-agent-name"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px]">Tasks to cover</Label>
          <div className="flex items-center gap-3">
            <input
              type="range" min={1} max={6} step={1}
              value={tasks} onChange={e => setTasks(Number(e.target.value))}
              className="flex-1"
              data-testid="slider-tasks"
            />
            <span className="font-mono text-sm tabular-nums w-12 text-right">{tasks} task{tasks > 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 rounded-none border overflow-hidden mb-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {[
          { n: 1, sig: 2.0, lbl: "low" },
          { n: 3, sig: 3.5, lbl: "moderate" },
          { n: 5, sig: 5.0, lbl: "high" },
        ].map((row, i) => {
          const active = (tasks <= 1 && row.n === 1) || (tasks > 1 && tasks <= 3 && row.n === 3) || (tasks >= 4 && row.n === 5);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setTasks(row.n === 1 ? 1 : row.n === 3 ? 3 : 5)}
              className={`p-3 text-left transition-colors min-w-0 ${
                active ? "bg-[hsl(var(--sidebar)/0.06)] border-b-2 border-b-[hsl(var(--sidebar))]" : "hover:bg-muted/40"
              }`}
            >
              <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground truncate">{row.n} task{row.n > 1 ? "s" : ""}</div>
              <div className="text-base sm:text-lg font-bold tabular-nums">{row.sig.toFixed(1)}σ</div>
              <div className="text-[11px] text-muted-foreground capitalize">{row.lbl}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-none border bg-muted/30 p-4 mb-4 text-[13px] leading-relaxed break-words">
        Adding <strong>&quot;{agentName.trim() || "New agent"}&quot;</strong> to <strong>{proc.name}</strong> would increase coverage from{" "}
        <strong>{(coverageFloor * 100).toFixed(0)}%</strong> to <strong>{(newCoverage * 100).toFixed(0)}%</strong>{" "}
        and ROI from <strong>{usd(proc.baseRoi)}</strong> to <strong>~{usd(newRoi)}/wk</strong> (model projection).
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Outcome label="Coverage Change"
          big={`${(coverageFloor * 100).toFixed(0)}% → ${(newCoverage * 100).toFixed(0)}%`}
          delta={`+${(coverageDelta * 100).toFixed(0)}pp`} dir="up" />
        <Outcome label="ROI Change" big={`${usd(newRoi)}/wk`}
          delta={`${roiDelta >= 0 ? "+" : ""}${usd(roiDelta)}/wk`} dir={roiDelta > 0 ? "up" : roiDelta < 0 ? "down" : "flat"} />
        <Outcome label="Oversight Impact" big="+0 hrs/wk" delta="No change" dir="flat" />
      </div>

      <Assumptions
        items={[
          "Baseline coverage uses pass-rate proxy from events in this workflow bucket",
          "Each task adds ~10% coverage (capped at 100%)",
          "Inference cost estimated at $12/week per task covered",
          `Oversight cost scaled by sigma quality (${sigmaLabel} at ${sigma.toFixed(1)}σ)`,
          "ROI scales linearly with coverage increase from the workflow baseline",
        ]}
      />
    </>
  );

  if (embedded) {
    return (
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <UserPlus className="h-4 w-4 shrink-0" /> Add an Agent
          </div>
          <Pill tone="blue" className="self-start sm:self-center shrink-0">{sigma.toFixed(1)}σ projected</Pill>
        </div>
        {body}
      </div>
    );
  }

  return (
    <SectionCard
      kicker="Scenario 1"
      title={<span className="inline-flex items-center gap-2"><UserPlus className="h-4 w-4" /> Add an Agent</span>}
      action={<Pill tone="blue">{sigma.toFixed(1)}σ projected</Pill>}
    >
      {body}
    </SectionCard>
  );
}

/* ============================================================
 * Scenario 2 — Change Headcount
 * ============================================================ */
function HeadcountScenario({ headcount, embedded }: { headcount: BaselineHeadcount; embedded?: boolean }) {
  const [delta, setDelta] = useState(0);
  const { baseHeadcount, weeklySalary, baseRoi, humanReviewQueued, observationDays } = headcount;
  const newHeadcount = baseHeadcount + delta;
  const inferenceAdd = Math.max(0, -delta) * 210;
  const oversightCapacity = Math.max(0, Math.min(1, newHeadcount / baseHeadcount));
  const netSalary = delta * weeklySalary;
  const newRoi = baseRoi - inferenceAdd;
  const perPersonRoi = newHeadcount > 0 ? newRoi / newHeadcount : 0;
  const wasPerPerson = baseHeadcount > 0 ? baseRoi / baseHeadcount : 0;

  const dirClass = delta === 0 ? "Sustainable" : delta < 0 ? "Strained" : "Comfortable";

  const body = (
    <>
      <p className="text-xs text-muted-foreground mb-4">
        Staffing anchor is inferred from review-queue pressure and registry size; salary uses <code className="text-[11px]">manual_hourly_cost_usd</code> from events when present.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 rounded-none border overflow-hidden mb-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {[-5, 0, +5].map((d, i) => {
          const active = delta === d;
          return (
            <button key={i}
              type="button"
              onClick={() => setDelta(d)}
              className={`p-3 text-left transition-colors min-w-0 ${
                active ? "bg-[hsl(var(--sidebar)/0.06)] border-b-2 border-b-[hsl(var(--sidebar))]" : "hover:bg-muted/40"
              }`}
              data-testid={`hc-${d}`}>
              <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground truncate">
                {d === 0 ? "No change" : d > 0 ? `+${d} people` : `${d} people`}
              </div>
              <div className="text-base sm:text-lg font-bold tabular-nums">
                {d === 0 ? `${baseHeadcount}` : `${baseHeadcount + d}`} HC
              </div>
              <div className="text-[11px] text-muted-foreground">
                {d === 0 ? "current" : d > 0 ? "expand" : "reduce"}
              </div>
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5 mb-5">
        <Label className="text-[11px]">Fine-tune headcount delta</Label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={-10}
            max={10}
            step={1}
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value))}
            className="flex-1"
            data-testid="slider-headcount"
          />
          <span className="font-mono text-sm tabular-nums w-16 text-right">
            {delta > 0 ? `+${delta}` : delta} HC
          </span>
        </div>
      </div>

      <div className="rounded-none border bg-muted/30 p-4 mb-4 text-[13px] leading-relaxed break-words">
        {delta === 0 ? (
          <>No headcount change. Current per-person ROI is <strong>{usd(wasPerPerson, { decimals: 0 })}/wk</strong>.</>
        ) : (
          <>
            {delta > 0 ? "Adding" : "Removing"} <strong>{Math.abs(delta)}</strong> people changes net salary by{" "}
            <strong>{usd(netSalary)}/wk</strong>. {delta < 0 && <>Inference cost rises by <strong>{usd(inferenceAdd)}/wk</strong> to compensate.</>}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Outcome label="Per-person ROI"
          big={`${usd(perPersonRoi, { decimals: 0 })}/wk`}
          delta={`Was ${usd(wasPerPerson, { decimals: 0 })}/wk`}
          dir={perPersonRoi > wasPerPerson ? "up" : perPersonRoi < wasPerPerson ? "down" : "flat"} />
        <Outcome label="Oversight Capacity"
          big={`${(oversightCapacity * 100).toFixed(0)}%`}
          delta={dirClass}
          dir={delta < 0 ? "down" : delta > 0 ? "up" : "flat"} />
        <Outcome label="Net Salary Impact"
          big={`${usd(netSalary, { sign: true })}/wk`}
          delta={delta === 0 ? "No change" : delta > 0 ? "expansion" : "reduction"}
          dir={delta < 0 ? "down" : delta > 0 ? "up" : "flat"} />
      </div>

      <Assumptions
        items={[
          `Current headcount (model): ${baseHeadcount} at ${usd(weeklySalary)}/wk each`,
          `Human review queued (telemetry): ${humanReviewQueued}`,
          `Tenant net run-rate baseline: ${usd(baseRoi)}/wk over ~${num(observationDays, 0)}d window`,
          delta === 0 ? "No headcount change" : delta > 0 ? `Add ${delta} headcount at base salary` : `Remove ${Math.abs(delta)} headcount`,
          "Agent inference cost increases $210/wk per headcount reduced (heuristic)",
          "Oversight capacity is proportional to remaining headcount vs model baseline",
        ]}
      />
    </>
  );

  if (embedded) {
    return (
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <Users className="h-4 w-4 shrink-0" /> Change Headcount
          </div>
          <Pill tone={delta < 0 ? "amber" : delta > 0 ? "blue" : "neutral"} className="self-start sm:self-center shrink-0">{delta > 0 ? `+${delta}` : delta} people</Pill>
        </div>
        {body}
      </div>
    );
  }

  return (
    <SectionCard
      kicker="Scenario 2"
      title={<span className="inline-flex items-center gap-2"><Users className="h-4 w-4" /> Change Headcount</span>}
      action={<Pill tone={delta < 0 ? "amber" : delta > 0 ? "blue" : "neutral"}>{delta > 0 ? `+${delta}` : delta} people</Pill>}
    >
      {body}
    </SectionCard>
  );
}

/* ============================================================
 * Scenario 3 — Scale Run Volume
 * ============================================================ */
function ScaleVolumeScenario({ agents, embedded }: { agents: BaselineAgent[]; embedded?: boolean }) {
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [mult, setMult] = useState(1);

  useEffect(() => {
    if (!agents.length) return;
    if (!agents.some((a) => a.id === agentId)) {
      setAgentId(agents[0].id);
    }
  }, [agents, agentId]);

  const agent = agents.find((a) => a.id === agentId) ?? agents[0];

  if (!agent) {
    return embedded ? (
      <p className="text-sm text-muted-foreground">
        No agents with activity yet. Register agents or wait for telemetry, then return here to model volume changes.
      </p>
    ) : (
      <SectionCard kicker="Scenario 3" title={<span className="inline-flex items-center gap-2"><Gauge className="h-4 w-4" /> Scale Run Volume</span>}>
        <p className="text-sm text-muted-foreground">
          No agents with activity yet. Register agents or wait for telemetry, then return here to model volume changes.
        </p>
      </SectionCard>
    );
  }

  const doublings = Math.log2(Math.max(0.5, mult));
  const marginal = agent.baseCost * Math.pow(0.95, Math.max(0, doublings));
  const projectedWeekly = marginal * agent.baseRuns * mult;
  const baseWeekly = agent.baseCost * agent.baseRuns;
  const weeklyDelta = projectedWeekly - baseWeekly;
  const ropPerRun = agent.weeklyRoi / Math.max(1, agent.baseRuns);
  const breakEven = ropPerRun > 0.001
    ? Math.ceil(agent.setup / ropPerRun)
    : 0;

  const body = (
    <>
      <p className="text-xs text-muted-foreground mb-4">
        Agents and costs come from the registry and equation snapshots; run counts and weekly net are normalized from your observation window.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="space-y-1.5">
          <Label className="text-[11px]">Agent</Label>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger data-testid="select-agent"><SelectValue /></SelectTrigger>
            <SelectContent>
              {agents.map(a => (
                <SelectItem key={a.id} value={a.id}>{humanizeLabel(a.name)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px]">Volume Multiplier</Label>
          <div className="flex items-center gap-3">
            <input
              type="range" min={1} max={20} step={1}
              value={mult} onChange={e => setMult(Number(e.target.value))}
              className="flex-1"
              data-testid="slider-mult"
            />
            <span className="font-mono text-sm tabular-nums w-10 text-right">{mult}×</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 rounded-none border overflow-hidden mb-5 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {[1, 5, 10].map((m, i) => {
          const active = (mult === 1 && m === 1) || (mult > 1 && mult <= 5 && m === 5) || (mult > 5 && m === 10);
          return (
            <button
              key={i}
              type="button"
              onClick={() => setMult(m)}
              className={`p-3 text-left w-full transition-colors min-w-0 ${
                active ? "bg-[hsl(var(--sidebar)/0.06)] border-b-2 border-b-[hsl(var(--sidebar))]" : "hover:bg-muted/40"
              }`}
            >
              <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground truncate">{m}× volume</div>
              <div className="text-base sm:text-lg font-bold tabular-nums truncate">
                {usd(agent.baseCost * agent.baseRuns * m * Math.pow(0.95, Math.log2(m)))}
              </div>
              <div className="text-[11px] text-muted-foreground">/ week projected</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-none border bg-muted/30 p-4 mb-4 text-[13px] leading-relaxed break-words">
        Scaling <strong>{humanizeLabel(agent.name)}</strong> to <strong>{mult}×</strong> volume{" "}
        {weeklyDelta < 0.01 ? "adds negligible cost" : `adds ${usd(weeklyDelta)}/week in inference`}.
        Marginal cost per run drops to <strong>{usd(marginal)}</strong>.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Outcome label="Projected Weekly Cost"
          big={`${usd(projectedWeekly)}/wk`}
          delta={`+${usd(weeklyDelta)} from current`}
          dir={weeklyDelta > 0 ? "up" : "flat"} />
        <Outcome label="Marginal Cost / Run"
          big={`${usd(marginal)}`}
          delta={`Base: ${usd(agent.baseCost)}`}
          dir={marginal < agent.baseCost ? "down" : "flat"} />
        <Outcome label="Break-even"
          big={breakEven > 0 ? `${breakEven} runs` : "—"}
          delta={breakEven > 0 ? `To recover ${usd(agent.setup)} setup` : "No positive run economics in baseline"}
          dir="flat" />
      </div>

      <Assumptions
        items={[
          `Current cost: ${usd(agent.baseCost)}/run, ~${agent.baseRuns} runs/wk at 1×`,
          "Marginal cost decreases ~5% per doubling (batch efficiency model)",
          `Break-even vs setup ${usd(agent.setup)} using weekly net / run from telemetry`,
          `Current weekly net ROI (baseline): ${usd(agent.weeklyRoi)}`,
        ]}
      />
    </>
  );

  if (embedded) {
    return (
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <Gauge className="h-4 w-4 shrink-0" /> Scale Run Volume
          </div>
          <Pill tone="blue" className="self-start sm:self-center shrink-0">{mult}× volume</Pill>
        </div>
        {body}
      </div>
    );
  }

  return (
    <SectionCard
      kicker="Scenario 3"
      title={<span className="inline-flex items-center gap-2"><Gauge className="h-4 w-4" /> Scale Run Volume</span>}
      action={<Pill tone="blue">{mult}× volume</Pill>}
    >
      {body}
    </SectionCard>
  );
}

/* ============================================================
 * Shared bits
 * ============================================================ */
function Outcome({ label, big, delta, dir }: { label: string; big: React.ReactNode; delta: React.ReactNode; dir: "up" | "down" | "flat" }) {
  const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const color = dir === "up" ? "text-[hsl(142_70%_30%)]" : dir === "down" ? "text-[hsl(0_72%_44%)]" : "text-muted-foreground";
  const bigTitle = typeof big === "string" ? big : undefined;
  return (
    <div className="rounded-none border bg-card p-3 min-w-0 overflow-hidden">
      <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground truncate">{label}</div>
      <div className="text-base sm:text-lg font-bold mt-1 tabular-nums truncate" title={bigTitle}>{big}</div>
      <div className={`text-[11px] flex items-center gap-1 mt-0.5 min-w-0 ${color}`}>
        <Icon className="h-3 w-3 shrink-0" /> <span className="truncate">{delta}</span>
      </div>
    </div>
  );
}

function Assumptions({ items }: { items: string[] }) {
  return (
    <div className="mt-5 pt-4 border-t">
      <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground mb-2">
        Assumptions
      </div>
      <ul className="space-y-1 text-[12px] text-muted-foreground">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-[hsl(var(--sidebar))]">•</span> {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

const TAB_LABELS: Record<ScenarioTab, { label: string; icon: typeof UserPlus }> = {
  add: { label: "Add agent", icon: UserPlus },
  headcount: { label: "Headcount", icon: Users },
  scale: { label: "Scale volume", icon: Gauge },
};

function RefRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 py-2 border-b last:border-0 text-sm min-w-0">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="font-medium text-foreground sm:text-right tabular-nums break-words">{v}</span>
    </div>
  );
}

function BaselineReferencePanel({ tab, data }: { tab: ScenarioTab; data: ScenariosBaseline }) {
  if (tab === "add") {
    const top = [...data.processes]
      .filter((p) => p.id !== "_empty" && p.eventCount > 0)
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 8);
    return (
      <SectionCard className="h-fit min-w-0" kicker="Baseline inputs" title="Top processes by volume">
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workflow buckets in canonical events yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[18rem]">
            <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
              <tr>
                <th className="text-left py-2 font-semibold">Process</th>
                <th className="text-right py-2 font-semibold">Events</th>
                <th className="text-right py-2 font-semibold">RoI/wk</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-foreground leading-snug">{p.name}</div>
                    {p.suggestedAgentName && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">
                        {p.suggestedAgentName}
                      </div>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{num(p.eventCount, 0)}</td>
                  <td className="py-2 text-right tabular-nums">{usd(p.baseRoi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
          Coverage and ROI baselines are derived per workflow bucket from pass-rate proxies in your observation window.
        </p>
      </SectionCard>
    );
  }

  if (tab === "headcount") {
    const { baseHeadcount, weeklySalary, baseRoi, humanReviewQueued, observationDays } = data.headcount;
    return (
      <SectionCard className="h-fit min-w-0" kicker="Baseline inputs" title="Staffing anchor">
        <RefRow k="Model headcount" v={`${baseHeadcount} people`} />
        <RefRow k="Weekly salary / person" v={usd(weeklySalary)} />
        <RefRow k="Human review queued" v={num(humanReviewQueued, 0)} />
        <RefRow k="Tenant net run-rate" v={`${usd(baseRoi)}/wk`} />
        <RefRow k="Observation window" v={`~${num(observationDays, 0)} days`} />
        <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
          Headcount is inferred from review-queue pressure and registry size. Salary uses{" "}
          <code className="text-[10px]">manual_hourly_cost_usd</code> from events when present.
        </p>
      </SectionCard>
    );
  }

  const topAgents = [...data.agents].sort((a, b) => b.weeklyRoi - a.weeklyRoi).slice(0, 8);
  return (
    <SectionCard className="h-fit min-w-0" kicker="Baseline inputs" title="Agent run economics">
      {topAgents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No agents in registry or per-agent telemetry yet.</p>
      ) : (
        <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[18rem]">
          <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
            <tr>
              <th className="text-left py-2 font-semibold">Agent</th>
              <th className="text-right py-2 font-semibold">$/run</th>
              <th className="text-right py-2 font-semibold">Net/wk</th>
            </tr>
          </thead>
          <tbody>
            {topAgents.map((a) => (
              <tr key={a.id} className="border-b last:border-0">
                <td className="py-2 pr-2 font-medium text-foreground max-w-[10rem] truncate">{humanizeLabel(a.name)}</td>
                <td className="py-2 text-right tabular-nums whitespace-nowrap">{usd(a.baseCost)}</td>
                <td className="py-2 text-right tabular-nums whitespace-nowrap">{usd(a.weeklyRoi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
        Marginal cost model assumes ~5% efficiency gain per volume doubling. Break-even uses setup cost vs weekly net per run.
      </p>
    </SectionCard>
  );
}

export default function Scenarios() {
  const [tab, setTab] = useState<ScenarioTab>("add");
  const { data, isLoading, isError, error } = useQuery<ScenariosBaseline>({
    queryKey: ["/api/scenarios/baseline"],
  });

  const passRate = data?.meta.eventQualityPassRate ?? 0;
  const processCount = data?.processes.filter((p) => p.id !== "_empty" && p.eventCount > 0).length ?? 0;
  const agentCount = data?.agents.length ?? 0;
  const noEvents = !!data && data.meta.eventCount === 0;
  const hasLiveBaseline = !!data && data.meta.eventCount > 0;

  return (
    <Layout
      title="What-If Scenarios"
      kicker="Insights / Scenarios"
      headerRight={
        <Pill tone="blue" className="gap-1.5">
          <FlaskConical className="h-3 w-3" />
          {isLoading ? "Loading…" : hasLiveBaseline ? "Live baseline" : data ? "No telemetry" : "—"}
        </Pill>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Stress-test staffing, coverage, and run volume against tenant baselines from canonical events,
          the agent registry, and coverage manifest. Sliders apply a projection model — not a forecast guarantee.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">PEL-backed inputs</Pill>
          <Pill tone="slate">3 scenario models</Pill>
        </div>
      </div>

      {hasLiveBaseline && (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <KpiCard
            tone="green"
            icon={<DollarSign className="h-4 w-4" />}
            label="WEEKLY NET"
            value={usd(data.meta.weeklyNetUsd)}
            sub="Tenant run-rate baseline"
          />
          <KpiCard
            tone="primary"
            icon={<Activity className="h-4 w-4" />}
            label="EVENTS"
            value={num(data.meta.eventCount, 0)}
            sub="Canonical observation window"
          />
          <KpiCard
            tone="amber"
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="PASS RATE"
            value={pct(passRate, 0)}
            sub="Quality gate threshold"
          />
          <KpiCard
            tone="slate"
            icon={<FlaskConical className="h-4 w-4" />}
            label="MODEL INPUTS"
            value={`${processCount} · ${agentCount}`}
            sub="Processes · agents"
            footer={
              data.meta.surfaceCoverageRatio != null ? (
                <div className="text-xs text-muted-foreground">
                  Coverage <span className="font-semibold text-foreground tabular-nums">{pct(data.meta.surfaceCoverageRatio, 0)}</span>
                </div>
              ) : undefined
            }
          />
        </div>
      )}

      {hasLiveBaseline && (
        <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
              Baseline loaded
            </div>
            <div className="text-sm font-semibold text-foreground mt-1 break-words">
              {num(data.meta.eventCount, 0)} events · {pct(passRate, 0)} pass · {usd(data.meta.weeklyNetUsd)}/wk net
            </div>
            <div className="text-xs text-muted-foreground mt-1 font-mono truncate">{data.meta.source}</div>
          </div>
          <Pill tone="green" className="self-start sm:self-center shrink-0">
            <StatusDot tone="green" />
            Ready to model
          </Pill>
        </div>
      )}

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-5">
          {(error as Error)?.message ?? "Failed to load scenarios baseline"}
        </div>
      )}

      {!isError && noEvents && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No activity recorded yet. Once agents are running, open{" "}
          <Link href="/ecl/observation" className="text-[hsl(var(--primary))] hover:underline">Observation Plane</Link>
          {" "}to review events, then return here to model scenarios.
        </div>
      )}

      {isLoading && (
        <div className="space-y-4 mb-6">
          <div className="h-12 rounded-none bg-muted animate-pulse" />
          <div className="h-72 rounded-none bg-muted animate-pulse" />
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start min-w-0">
          <SectionCard
            kicker="Scenario workspace"
            title="Pick a what-if to model"
            padding={false}
            className="min-w-0"
            action={
              noEvents ? (
                <Pill tone="slate">Awaiting telemetry</Pill>
              ) : (
                <div className="aeos-content-segment w-full xl:w-auto min-w-0" role="tablist" aria-label="Scenario type">
                  {(Object.keys(TAB_LABELS) as ScenarioTab[]).map(id => {
                    const { label, icon: Icon } = TAB_LABELS[id];
                    return (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        onClick={() => setTab(id)}
                        className="aeos-content-segment-btn inline-flex items-center gap-1.5"
                        data-active={tab === id ? "true" : "false"}
                        aria-selected={tab === id}
                        data-testid={`tab-scenario-${id}`}
                      >
                        <Icon className="h-3 w-3" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              )
            }
          >
            <div className="p-4 sm:p-5 min-w-0">
              {tab === "add" && <AddAgentScenario processes={data.processes} embedded />}
              {tab === "headcount" && <HeadcountScenario headcount={data.headcount} embedded />}
              {tab === "scale" && <ScaleVolumeScenario agents={data.agents} embedded />}
            </div>
          </SectionCard>

          <BaselineReferencePanel tab={tab} data={data} />
        </div>
      )}

      <div className="aeos-cognition-hero aeos-cognition-total mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-none bg-[hsl(var(--sidebar)/0.08)] text-[hsl(var(--sidebar))]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Promote a scenario</div>
            <div className="text-xs text-muted-foreground mt-0.5 max-w-lg">
              Convert a what-if into an executable plan. The Recommendations engine generates the patches needed to act.
            </div>
          </div>
        </div>
        <Link href="/ecl/recommendations" className="aeos-btn aeos-btn-primary w-full sm:w-auto shrink-0 justify-center" data-testid="btn-promote">
          Open Recommendations
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </Layout>
  );
}
