import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  GitCompare, Trophy, Activity, DollarSign, Clock, Sparkles, Target, Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PROCESSES } from "@/lib/personas";
import { num, pct, sigma, usd } from "@/lib/format";
import { useAgents, EnrichedAgent } from "@/hooks/use-agents";

function processOf(workflowId: string | null | undefined) {
  return PROCESSES.find(p => p.id === workflowId)?.name ?? workflowId ?? "—";
}

function safeNum(v: number | null | undefined, fallback = 0): number {
  const n = Number(v ?? fallback);
  return isFinite(n) ? n : fallback;
}

function dimensionsFor(a: EnrichedAgent) {
  const sigmaVal   = safeNum(a.sigma);
  const success    = safeNum(a.success);
  const wallMs     = safeNum(a.p95Latency, 2800);
  const costPerRun = safeNum(a.costPerRun, 0.08);
  const dpmo       = success > 0 ? (1 - success) * 1_000_000 : 1_000_000;

  return {
    quality:     Math.max(0, Math.min(1, sigmaVal / 6)),
    reliability: Math.max(0, Math.min(1, success)),
    speed:       Math.max(0, Math.min(1, 1 - (wallMs - 400) / 2400)),
    cost:        Math.max(0, Math.min(1, 1 - (costPerRun - 0.005) / 0.075)),
    volume:      Math.max(0, Math.min(1, safeNum(a.runs) / 3000)),
    consistency: Math.max(0, Math.min(1, 1 - dpmo / 60000)),
  };
}

const DIM_LABELS: { key: keyof ReturnType<typeof dimensionsFor>; label: string }[] = [
  { key: "quality",     label: "Quality" },
  { key: "reliability", label: "Reliability" },
  { key: "speed",       label: "Speed" },
  { key: "cost",        label: "Cost Efficiency" },
  { key: "volume",      label: "Volume" },
  { key: "consistency", label: "Consistency" },
];

export default function AgentCompare() {
  const { data: agents, isLoading } = useAgents();

  const [aId, setAId] = useState<string | null>(null);
  const [bId, setBId] = useState<string | null>(null);

  // Seed selectors once the agents array arrives
  useEffect(() => {
    if (!agents || agents.length === 0) return;
    setAId(prev => prev ?? agents[0].agentId);
    setBId(prev => prev ?? (agents[1]?.agentId ?? agents[0].agentId));
  }, [agents]);

  // Loading / empty states — render before any coordinate math
  if (isLoading) {
    return (
      <Layout title="Agent A/B Comparison" kicker="MY AI AGENTS / COMPARE">
        <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Loading agent telemetry…</span>
        </div>
      </Layout>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <Layout title="Agent A/B Comparison" kicker="MY AI AGENTS / COMPARE">
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <span className="text-sm">No agents registered for this tenant yet.</span>
        </div>
      </Layout>
    );
  }

  const resolvedAId = aId ?? agents[0].agentId;
  const resolvedBId = bId ?? (agents[1]?.agentId ?? agents[0].agentId);

  const a = agents.find(x => x.agentId === resolvedAId) ?? agents[0];
  const b = agents.find(x => x.agentId === resolvedBId) ?? agents[0];

  const dimsA = dimensionsFor(a);
  const dimsB = dimensionsFor(b);

  // Group agents by process for the dropdowns, derived from live API data
  const grouped: { process: string; agents: EnrichedAgent[] }[] = PROCESSES
    .map(p => ({ process: p.name, agents: agents.filter(ag => ag.workflowId === p.id) }))
    .filter(g => g.agents.length > 0);
  const ungrouped = agents.filter(ag => !PROCESSES.some(p => p.id === ag.workflowId));
  if (ungrouped.length > 0) grouped.push({ process: "Other", agents: ungrouped });

  const wins = (() => {
    let aw = 0, bw = 0;
    DIM_LABELS.forEach(d => {
      if (dimsA[d.key] > dimsB[d.key]) aw++;
      else if (dimsB[d.key] > dimsA[d.key]) bw++;
    });
    return { aw, bw };
  })();

  const winner = wins.aw === wins.bw ? null : wins.aw > wins.bw ? a : b;
  const winnerCount = Math.max(wins.aw, wins.bw);

  const aSigma   = safeNum(a.sigma);
  const bSigma   = safeNum(b.sigma);
  const aSuccess = safeNum(a.success);
  const bSuccess = safeNum(b.success);
  const aCost    = safeNum(a.costPerRun);
  const bCost    = safeNum(b.costPerRun);
  const aWall    = Math.round(safeNum(a.p95Latency));
  const bWall    = Math.round(safeNum(b.p95Latency));
  const aDpmo    = aSuccess > 0 ? Math.round((1 - aSuccess) * 1_000_000) : 1_000_000;
  const bDpmo    = bSuccess > 0 ? Math.round((1 - bSuccess) * 1_000_000) : 1_000_000;

  return (
    <Layout title="Agent A/B Comparison" kicker="MY AI AGENTS / COMPARE">
      <p className="text-sm text-muted-foreground mb-5 max-w-3xl">
        Side-by-side performance comparison across six dimensions. Use this to decide which agent owns a task, which to retire, and where to direct improvement budget.
      </p>

      {/* Picker bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5 items-center">
        <SelectorCard color="hsl(213 84% 56%)" label="AGENT A" value={resolvedAId} onChange={setAId} grouped={grouped} agent={a} />
        <div className="rounded-xl border bg-gradient-to-br from-[hsl(213_100%_98%)] to-[hsl(213_100%_94%)] dark:from-[hsl(222_47%_14%)] dark:to-[hsl(222_47%_18%)] p-4 ecl-card-shadow text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="h-4 w-4 text-[hsl(38_90%_50%)]" />
            <div className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">WINNER</div>
          </div>
          <div className="text-base font-bold">
            {winner ? winner.name : "Tied"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {winner ? `Outperforms in ${winnerCount} of 6 dimensions` : "Even split across dimensions"}
          </div>
        </div>
        <SelectorCard color="hsl(0 72% 52%)" label="AGENT B" value={resolvedBId} onChange={setBId} grouped={grouped} agent={b} />
      </div>

      {/* KPI comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <CompareKpi label="SIGMA" valueA={sigma(aSigma)} valueB={sigma(bSigma)} winner={aSigma > bSigma ? "A" : aSigma < bSigma ? "B" : null} icon={<Sparkles className="h-4 w-4" />} tone="primary" />
        <CompareKpi label="DPMO" valueA={num(aDpmo, 0)} valueB={num(bDpmo, 0)} winner={aDpmo < bDpmo ? "A" : aDpmo > bDpmo ? "B" : null} icon={<Target className="h-4 w-4" />} tone="amber" lowerIsBetter />
        <CompareKpi label="SUCCESS" valueA={pct(aSuccess, 0)} valueB={pct(bSuccess, 0)} winner={aSuccess > bSuccess ? "A" : aSuccess < bSuccess ? "B" : null} icon={<Activity className="h-4 w-4" />} tone="green" />
        <CompareKpi label="COST / RUN" valueA={usd(aCost)} valueB={usd(bCost)} winner={aCost < bCost ? "A" : aCost > bCost ? "B" : null} icon={<DollarSign className="h-4 w-4" />} tone="orange" lowerIsBetter />
        <CompareKpi label="AVG LATENCY" valueA={`${aWall}ms`} valueB={`${bWall}ms`} winner={aWall < bWall ? "A" : aWall > bWall ? "B" : null} icon={<Clock className="h-4 w-4" />} tone="slate" lowerIsBetter />
        <CompareKpi label="TOTAL RUNS" valueA={num(a.runs, 0)} valueB={num(b.runs, 0)} winner={a.runs > b.runs ? "A" : a.runs < b.runs ? "B" : null} icon={<GitCompare className="h-4 w-4" />} tone="primary" />
      </div>

      {/* Radar */}
      <SectionCard kicker="PERFORMANCE RADAR" title="Six-axis comparison">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-center">
          <div className="lg:col-span-2 flex justify-center">
            <Radar
              dimsA={DIM_LABELS.map(d => dimsA[d.key])}
              dimsB={DIM_LABELS.map(d => dimsB[d.key])}
              labels={DIM_LABELS.map(d => d.label)}
            />
          </div>
          <div className="space-y-2">
            <Legend color="hsl(213 84% 56%)" label="Agent A" name={a.name} sub={processOf(a.workflowId)} />
            <Legend color="hsl(0 72% 52%)"   label="Agent B" name={b.name} sub={processOf(b.workflowId)} />
            <div className="pt-3 border-t mt-3 space-y-1.5">
              {DIM_LABELS.map(d => {
                const va = dimsA[d.key];
                const vb = dimsB[d.key];
                const dimWinner = va > vb ? "A" : vb > va ? "B" : null;
                return (
                  <div key={d.key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{d.label}</span>
                    {dimWinner ? (
                      <Pill tone={dimWinner === "A" ? "blue" : "red"}>
                        {dimWinner} +{Math.abs(Math.round((va - vb) * 100))}%
                      </Pill>
                    ) : (
                      <Pill tone="slate">tied</Pill>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </SectionCard>
    </Layout>
  );
}

function SelectorCard({
  color, label, value, onChange, grouped, agent,
}: {
  color: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  grouped: { process: string; agents: EnrichedAgent[] }[];
  agent: EnrichedAgent;
}) {
  return (
    <div className="rounded-xl border-l-4 bg-card p-4 ecl-card-shadow" style={{ borderLeftColor: color }}>
      <div className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground mb-2">{label}</div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full h-9 text-xs mb-3" data-testid={`select-${label.toLowerCase()}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {grouped.map(g => (
            <div key={g.process}>
              <div className="px-2 py-1 text-[9px] uppercase tracking-[.18em] text-muted-foreground bg-muted/50">{g.process}</div>
              {g.agents.map(ag => (
                <SelectItem key={ag.agentId} value={ag.agentId}>{ag.name}</SelectItem>
              ))}
            </div>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{processOf(agent.workflowId)}</span>
        <span>{agent.model ?? "—"} · {agent.hyperscaler}</span>
      </div>
    </div>
  );
}

function CompareKpi({
  label, valueA, valueB, winner, icon, tone, lowerIsBetter,
}: {
  label: string;
  valueA: string;
  valueB: string;
  winner: "A" | "B" | null;
  icon: React.ReactNode;
  tone: "primary" | "amber" | "green" | "orange" | "slate";
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 ecl-card-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{label}</div>
        <div className={`h-7 w-7 rounded-md grid place-items-center ${
          tone === "primary" ? "bg-[hsl(213_100%_94%)] text-[hsl(213_84%_42%)]" :
          tone === "amber"   ? "bg-[hsl(38_96%_92%)]  text-[hsl(28_90%_38%)]"  :
          tone === "green"   ? "bg-[hsl(142_72%_92%)]  text-[hsl(142_70%_30%)]" :
          tone === "orange"  ? "bg-[hsl(25_100%_94%)]  text-[hsl(25_90%_45%)]"  :
          "bg-[hsl(220_14%_94%)] text-[hsl(220_15%_28%)]"
        }`}>
          {icon}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: "hsl(213 84% 56%)" }} /> A
          </div>
          <div className={`text-lg font-bold tabular-nums ${winner === "A" ? "text-[hsl(213_84%_42%)]" : ""}`}>
            {valueA}{winner === "A" && <span className="text-xs ml-1">★</span>}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: "hsl(0 72% 52%)" }} /> B
          </div>
          <div className={`text-lg font-bold tabular-nums ${winner === "B" ? "text-[hsl(0_72%_44%)]" : ""}`}>
            {valueB}{winner === "B" && <span className="text-xs ml-1">★</span>}
          </div>
        </div>
      </div>
      {lowerIsBetter && <div className="text-[10px] text-muted-foreground mt-2">lower is better</div>}
    </div>
  );
}

function Legend({ color, label, name, sub }: { color: string; label: string; name: string; sub: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="h-3 w-3 rounded-sm mt-0.5 shrink-0" style={{ background: color }} />
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{label}</div>
        <div className="text-sm font-semibold truncate">{name}</div>
        <div className="text-[10px] text-muted-foreground truncate">{sub}</div>
      </div>
    </div>
  );
}

function Radar({ dimsA, dimsB, labels }: { dimsA: number[]; dimsB: number[]; labels: string[] }) {
  // Clamp every value to [0,1] and replace any NaN/Infinity with 0
  const safeA = dimsA.map(v => (isFinite(v) ? Math.max(0, Math.min(1, v)) : 0));
  const safeB = dimsB.map(v => (isFinite(v) ? Math.max(0, Math.min(1, v)) : 0));

  const N = safeA.length;
  const cx = 220, cy = 220, R = 160;
  const angle = (i: number) => (i / N) * 2 * Math.PI - Math.PI / 2;
  const point = (i: number, val: number): [number, number] => {
    const r = val * R;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  };
  const polyA = safeA.map((v, i) => point(i, v).join(",")).join(" ");
  const polyB = safeB.map((v, i) => point(i, v).join(",")).join(" ");

  return (
    <svg viewBox="0 0 440 440" width="100%" style={{ maxWidth: 480 }}>
      {[0.2, 0.4, 0.6, 0.8, 1].map(ring => (
        <polygon
          key={ring}
          points={Array.from({ length: N }).map((_, i) => point(i, ring).join(",")).join(" ")}
          fill="none" stroke="hsl(220 14% 88%)" strokeWidth="1"
        />
      ))}
      {Array.from({ length: N }).map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="hsl(220 14% 88%)" strokeWidth="1" />;
      })}
      <polygon points={polyB} fill="hsl(0 72% 52% / 0.18)" stroke="hsl(0 72% 52%)" strokeWidth="2" />
      <polygon points={polyA} fill="hsl(213 84% 56% / 0.18)" stroke="hsl(213 84% 56%)" strokeWidth="2" />
      {safeA.map((v, i) => { const [x, y] = point(i, v); return <circle key={i} cx={x} cy={y} r="4" fill="hsl(213 84% 56%)" />; })}
      {safeB.map((v, i) => { const [x, y] = point(i, v); return <circle key={i} cx={x} cy={y} r="4" fill="hsl(0 72% 52%)" />; })}
      {labels.map((label, i) => {
        const [x, y] = point(i, 1.18);
        return (
          <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="600" fill="hsl(220 15% 28%)">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
