import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { TablePagination } from "@/components/TablePagination";
import { usd, num } from "@/lib/format";
import { useListSelection } from "@/hooks/use-list-selection";
import {
  DollarSign, TrendingUp, Wallet, Receipt, Calendar, Info,
  ArrowRight, Activity, CheckCircle2,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

type Summary = {
  economics: {
    laborValueSavedUsd: number; amortizedCostUsd: number; netSavingsUsd: number;
    weeklyRunRateUsd: number; annualizedRunRateUsd: number; ropAvg: number;
    totalTokens: number; avgCostPerEvent: number; avgSavedPerEvent: number;
  };
  byVendor: Record<string, { saved: number; cost: number; n: number }>;
  counts: { events: number; ledgerRows: number; ledgerClosed: number; agents: number };
  quality: { passRate: number };
  latestEquations?: { rop: number; taskCount: number } | null;
};

type Event = {
  hyperscaler: string; agentId: string; capturedAt?: string;
  amortizedCostUsd: number; laborValueSavedUsd: number; vendorCostUsd: number;
};

type Agent = {
  agentId: string; name: string; hyperscaler: string;
  model: string; trustTier: string; status: string;
};

type Cohort = Agent & { n: number; cost: number; saved: number; vendor: number; net: number; rop: number };

type AgentFilter = "all" | "profitable" | "loss";

const ROLLING_WINDOW_MS = 7 * 86400_000;

function sumEventEconomics(events: Event[]) {
  let saved = 0;
  let cost = 0;
  let vendor = 0;
  for (const e of events) {
    saved += e.laborValueSavedUsd ?? 0;
    cost += e.amortizedCostUsd ?? 0;
    vendor += e.vendorCostUsd ?? 0;
  }
  return {
    saved,
    cost,
    vendor,
    net: saved - cost,
    rop: cost > 0 ? saved / cost : 0,
    n: events.length,
  };
}

function eventsSince(events: Event[], sinceMs: number) {
  return events.filter(e => {
    const t = Date.parse(e.capturedAt ?? "");
    return Number.isFinite(t) && t >= sinceMs;
  });
}

function ropTone(rop: number): "green" | "amber" | "red" {
  if (rop >= 1.5) return "green";
  if (rop >= 1.0) return "amber";
  return "red";
}

function ropLabel(rop: number): string {
  if (rop >= 1.5) return "Strong";
  if (rop >= 1.0) return "Healthy";
  return "Underwater";
}

export default function FinancialImpact() {
  const { data: s, isLoading, isError } = useQuery<Summary>({ queryKey: ["/api/dashboard/summary"] });
  const { data: events, isError: eventsError } = useQuery<Event[]>({ queryKey: ["/api/observation/events"] });
  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"] });
  const ec = s?.economics;

  const ev = events ?? [];
  const ag = agents ?? [];

  const registeredIds = useMemo(() => new Set(ag.map(a => a.agentId)), [ag]);

  /** Registered agents only — matches Cognition rollup scope and the agent table. */
  const scopedEvents = useMemo(
    () => (registeredIds.size > 0 ? ev.filter(e => registeredIds.has(e.agentId)) : ev),
    [ev, registeredIds],
  );

  const eventTotals = useMemo(() => sumEventEconomics(scopedEvents), [scopedEvents]);

  const weeklyTotals = useMemo(
    () => sumEventEconomics(eventsSince(scopedEvents, Date.now() - ROLLING_WINDOW_MS)),
    [scopedEvents],
  );

  const cohorts = useMemo(() => {
    const byAgent: Record<string, { n: number; cost: number; saved: number; vendor: number }> = {};
    scopedEvents.forEach(e => {
      byAgent[e.agentId] ??= { n: 0, cost: 0, saved: 0, vendor: 0 };
      byAgent[e.agentId].n += 1;
      byAgent[e.agentId].cost += e.amortizedCostUsd ?? 0;
      byAgent[e.agentId].saved += e.laborValueSavedUsd ?? 0;
      byAgent[e.agentId].vendor += e.vendorCostUsd ?? 0;
    });
    return ag.map(a => {
      const d = byAgent[a.agentId] ?? { n: 0, cost: 0, saved: 0, vendor: 0 };
      const net = d.saved - d.cost;
      const rop = d.cost > 0 ? d.saved / d.cost : 0;
      return { ...a, ...d, net, rop };
    }).sort((x, y) => y.net - x.net);
  }, [scopedEvents, ag]);

  const [filter, setFilter] = useState<AgentFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const profitableCount = cohorts.filter(c => c.net > 0).length;
  const lossCount = cohorts.filter(c => c.net <= 0 && c.n > 0).length;

  const list = useMemo(
    () => cohorts.filter(c => {
      if (filter === "profitable") return c.net > 0;
      if (filter === "loss") return c.net <= 0 && c.n > 0;
      return true;
    }),
    [cohorts, filter],
  );

  const { selected: active, select: selectAgent, id: activeId } = useListSelection(
    list,
    (c) => c.agentId,
    { prefer: (c) => c.n > 0 },
  );

  useEffect(() => setPage(1), [filter, pageSize]);

  const paged = list.slice((page - 1) * pageSize, page * pageSize);
  const pageCost = paged.reduce((acc, c) => acc + c.cost, 0);
  const pageSaved = paged.reduce((acc, c) => acc + c.saved, 0);
  const pageNet = paged.reduce((acc, c) => acc + c.net, 0);
  const pageRop = pageCost > 0 ? pageSaved / pageCost : 0;

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(list.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [list.length, page, pageSize]);

  const hasRollup = !!s?.latestEquations;

  // Weekly: always from observation events (rolling 7 days) — not snapshot.
  const weekly = weeklyTotals.net;
  const annualized = weekly * 52;

  // Lifetime KPIs: Cognition snapshot when available, else event sums.
  const laborSaved = hasRollup ? (ec?.laborValueSavedUsd ?? eventTotals.saved) : eventTotals.saved;
  const totalAiCost = hasRollup ? (ec?.amortizedCostUsd ?? eventTotals.cost) : eventTotals.cost;
  const netSavings = hasRollup ? (ec?.netSavingsUsd ?? eventTotals.net) : eventTotals.net;
  const ropAvg = hasRollup ? (ec?.ropAvg ?? eventTotals.rop) : eventTotals.rop;
  const taskCount = hasRollup ? (s?.latestEquations?.taskCount ?? eventTotals.n) : eventTotals.n;

  const eventVendorCost = eventTotals.vendor;
  const eventAmortized = eventTotals.cost;
  const vendorCost = eventTotals.n > 0 && eventAmortized > 0
    ? totalAiCost * (eventVendorCost / eventAmortized)
    : totalAiCost * 0.85;
  const govCost = Math.max(0, totalAiCost - vendorCost);

  const hasEvents = (s?.counts.events ?? scopedEvents.length) > 0;
  const noEvents = !isLoading && !hasEvents;
  const needsRollup = !isLoading && hasEvents && !hasRollup;
  const hasLiveEconomics = hasEvents && (eventTotals.saved !== 0 || eventTotals.cost !== 0);

  const hourly = netSavings;
  const onboardingUsd = 25000;
  const paybackHours = hourly > 0 ? onboardingUsd / hourly : 0;
  const paybackDays = paybackHours / 24;

  const vendorEntries = useMemo(
    () => Object.entries(s?.byVendor ?? {}).sort(([, a], [, b]) => (b.saved - b.cost) - (a.saved - a.cost)),
    [s?.byVendor],
  );

  const overallTone = ropAvg >= 1 ? "green" : ropAvg >= 0.5 ? "amber" : hasEvents ? "red" : "slate";

  return (
    <Layout
      title="Financial Impact"
      kicker="Insights / Economics"
      headerRight={
        <Pill tone="blue" className="gap-1.5">
          <Activity className="h-3 w-3" />
          {isLoading ? "Loading…" : hasLiveEconomics ? "Live economics" : hasEvents ? "Events only" : "No data"}
        </Pill>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Dollar-level view of AI running cost vs. labor value saved — by agent, provider, and forecast horizon.
          RoP and net gain roll up into the Cognition Plane master equation.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">RoP · Net savings · Payback</Pill>
          <Pill tone="slate">Per-agent cohort ROI</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Failed to load economics summary. Check that you are signed in and the server is running.
        </div>
      )}

      {eventsError && !isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Failed to load observation events — per-agent breakdown may be incomplete.
        </div>
      )}

      {!isError && noEvents && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No activity recorded yet. Once agents are running, open{" "}
          <Link href="/ecl/observation" className="text-[hsl(var(--primary))] hover:underline">Observation Plane</Link>
          {" "}to review cost and savings inputs.
        </div>
      )}

      {!isError && needsRollup && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          Activity is recorded; open{" "}
          <Link href="/ecl/cognition" className="text-[hsl(var(--primary))] hover:underline">Cognition Plane</Link>
          {" "}and click <span className="font-medium text-foreground">Refresh</span> to sync equation rollups with live telemetry.
          Weekly savings above are already computed from the last 7 days of events.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="green"
          icon={<TrendingUp className="h-4 w-4" />}
          label="WEEKLY SAVINGS"
          value={usd(weekly)}
          sub={`Last 7 days · ${num(weeklyTotals.n, 0)} tasks · Full-year est. ${usd(annualized)}`}
        />
        <KpiCard
          tone="primary"
          icon={<Wallet className="h-4 w-4" />}
          label="WORK VALUE SAVED"
          value={usd(laborSaved)}
          sub={`${num(taskCount, 0)} human-equivalent tasks${hasRollup ? "" : " · from events"}`}
        />
        <KpiCard
          tone="orange"
          icon={<Receipt className="h-4 w-4" />}
          label="TOTAL AI RUNNING COST"
          value={usd(totalAiCost)}
          sub={`${usd(vendorCost)} model · ${usd(govCost)} platform`}
        />
        <KpiCard
          tone="primary"
          icon={<DollarSign className="h-4 w-4" />}
          label="RETURN ON AI SPEND"
          value={hasEvents ? `${num(ropAvg, 2)}×` : "—"}
          sub={hasEvents ? `$1 spent → $${num(ropAvg, 2)} back` : "No data yet"}
          footer={
            hasEvents ? (
              <div className="text-xs text-muted-foreground">
                Net{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {usd(netSavings, { sign: true })}
                </span>
              </div>
            ) : undefined
          }
        />
      </div>

      {(hasLiveEconomics || hasEvents) && (
        <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
              Economics snapshot
            </div>
            <div className="text-sm font-semibold text-foreground mt-1 break-words">
              {usd(laborSaved)} saved · {usd(totalAiCost)} cost · {usd(netSavings, { sign: true })} net
            </div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Weekly run-rate {usd(weekly)} (7d events) · Annualized {usd(annualized)} · {profitableCount}/{cohorts.length} agents profitable
              {!hasRollup && hasEvents ? " · Lifetime KPIs from events until rollup" : ""}
            </div>
          </div>
          <Pill tone={overallTone === "slate" ? "blue" : overallTone} className="self-start sm:self-center shrink-0">
            <StatusDot tone={overallTone === "slate" ? "blue" : overallTone} />
            RoP {hasEvents ? `${num(ropAvg, 2)}×` : "—"}
          </Pill>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start mb-6 min-w-0">
        <SectionCard
          kicker="By agent"
          title="Cost and savings by agent"
          padding={false}
          className="min-w-0"
          action={
            <div className="aeos-content-segment w-full xl:w-auto" role="tablist" aria-label="Agent filter">
              {([
                ["all", "All", cohorts.length],
                ["profitable", "Profitable", profitableCount],
                ["loss", "Underwater", lossCount],
              ] as const).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  onClick={() => setFilter(id)}
                  className="aeos-content-segment-btn"
                  data-active={filter === id ? "true" : "false"}
                  aria-selected={filter === id}
                  data-testid={`filter-agent-${id}`}
                >
                  {label}
                  <span className="ml-1 tabular-nums opacity-70">({count})</span>
                </button>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[32rem] xl:min-w-0">
            <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th>Agent</Th>
                <Th align="right">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Cost
                    <InfoTip text="What it actually cost to run this AI agent — model fees plus platform charges." />
                  </span>
                </Th>
                <Th align="right">
                  <span className="inline-flex items-center gap-1 justify-end">
                    Saved
                    <InfoTip text="Equivalent cost of a human doing the same work at the standard hourly rate." />
                  </span>
                </Th>
                <Th align="right">Net</Th>
                <Th align="right">RoP</Th>
              </tr>
            </thead>
            <tbody>
              {paged.map(c => (
                <tr
                  key={c.agentId}
                  className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                    activeId === c.agentId ? "bg-primary/5" : ""
                  } ${c.net >= 0 ? "border-l-2 border-l-[hsl(142_70%_42%)]" : c.n > 0 ? "border-l-2 border-l-[hsl(0_72%_52%)]" : ""}`}
                  onClick={() => selectAgent(c)}
                  data-testid={`row-agent-${c.agentId}`}
                >
                  <Td>
                    <div className="font-medium max-w-[8rem] sm:max-w-[12rem] truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[8rem] sm:max-w-[12rem]">{c.agentId}</div>
                  </Td>
                  <Td align="right">{usd(c.cost)}</Td>
                  <Td align="right" className="text-[hsl(142_70%_30%)]">{usd(c.saved, { decimals: 2 })}</Td>
                  <Td align="right" className={`font-semibold ${c.net >= 0 ? "text-[hsl(142_70%_30%)]" : "text-[hsl(0_72%_44%)]"}`}>
                    {usd(c.net, { decimals: 2, sign: true })}
                  </Td>
                  <Td align="right">
                    <Pill tone={c.n === 0 ? "slate" : ropTone(c.rop)}>
                      {c.n === 0 ? "—" : `${num(c.rop, 2)}×`}
                    </Pill>
                  </Td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    {filter === "all" ? "No agent data yet" : "No agents match this filter"}
                  </td>
                </tr>
              )}
            </tbody>
            {paged.length > 0 && (
              <tfoot className="border-t bg-muted/20">
                <tr className="font-semibold text-sm">
                  <Td>{list.length > pageSize ? `Page ${page} subtotal` : "Combined"}</Td>
                  <Td align="right">{usd(pageCost)}</Td>
                  <Td align="right" className="text-[hsl(142_70%_30%)]">{usd(pageSaved)}</Td>
                  <Td align="right" className={pageNet >= 0 ? "text-[hsl(142_70%_30%)]" : "text-[hsl(0_72%_44%)]"}>
                    {usd(pageNet, { sign: true })}
                  </Td>
                  <Td align="right" className="text-primary">{num(pageRop, 2)}×</Td>
                </tr>
              </tfoot>
            )}
          </table>
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            total={list.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="agents"
          />
        </SectionCard>

        <SectionCard
          className="h-fit min-w-0"
          kicker="Agent detail"
          title={active?.name ?? "Select an agent"}
        >
          {!active ? (
            <p className="text-sm text-muted-foreground">
              Click any row to see cost breakdown, RoP health, and model details.
            </p>
          ) : (
            <AgentDetail agent={active} />
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5 mb-6">
        <SectionCard kicker="Breakdown" title="Where the money goes" className="xl:col-span-2 min-w-0">
          <Waterfall
            labels={["Work done by AI", "− AI model fees", "− Platform & oversight", "= Net savings"]}
            values={[laborSaved, -vendorCost, -govCost, netSavings]}
          />
        </SectionCard>

        <SectionCard
          kicker="Payback"
          title="Time to recover setup"
          className="min-w-0"
          action={<Pill tone="blue"><Calendar className="h-3 w-3" /> live</Pill>}
        >
          <div className="text-2xl sm:text-3xl font-bold tabular-nums truncate" title={paybackDays > 0 ? `${num(paybackDays, 1)} days` : undefined}>
            {paybackDays > 0 ? `${num(paybackDays, 1)} days` : "—"}
          </div>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Illustrative model: at the current net savings rate, a {usd(onboardingUsd)} setup investment
            is recovered in ~{paybackDays > 0 ? `${num(paybackHours, 0)} hours` : "—"}.
            Adjust the baseline in your deployment config when available.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
            <ForecastTile label="This week" value={weekly} highlight />
            <ForecastTile label="Full year" value={annualized} />
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5">
        <SectionCard
          kicker="By AI provider"
          title="Savings by hyperscaler"
          className="xl:col-span-2 min-w-0"
          action={<Pill tone="slate">{vendorEntries.length} providers</Pill>}
        >
          <ProviderBars vendorEntries={vendorEntries} byVendor={s?.byVendor ?? {}} />
        </SectionCard>

        <SectionCard kicker="Related" title="Performance equations">
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            RoP, CUoW, and net run-rate feed the six business equations and Cognition Plane master rollup.
          </p>
          <Link href="/insights/equations" className="aeos-btn aeos-btn-primary w-full mb-2">
            AI Performance
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link href="/ecl/cognition" className="aeos-btn aeos-btn-secondary w-full">
            Cognition Plane
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          {s?.quality.passRate != null && (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              Quality pass rate {num((s.quality.passRate ?? 0) * 100, 0)}% across observation window
            </div>
          )}
        </SectionCard>
      </div>
    </Layout>
  );
}

function AgentDetail({ agent }: { agent: Cohort }) {
  const maxBar = Math.max(agent.saved, agent.cost, 1);
  const tone = agent.n === 0 ? "slate" : ropTone(agent.rop);

  return (
    <div className="space-y-4">
      <div className={`rounded-none border-l-4 px-3 py-2 ${
        agent.net >= 0
          ? "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
          : "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]"
      }`}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">Net gain</div>
            <div className={`text-xl sm:text-2xl font-bold tabular-nums truncate ${agent.net >= 0 ? "text-[hsl(142_70%_30%)]" : "text-[hsl(0_72%_44%)]"}`}>
              {usd(agent.net, { sign: true })}
            </div>
          </div>
          {agent.n > 0 && (
            <Pill tone={tone}>
              <StatusDot tone={tone} />
              {ropLabel(agent.rop)} · {num(agent.rop, 2)}×
            </Pill>
          )}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <KV k="Tasks processed" v={num(agent.n, 0)} />
        <KV k="Value saved" v={usd(agent.saved, { decimals: 2 })} />
        <KV k="Running cost" v={usd(agent.cost)} />
        <KV k="Vendor / model fees" v={usd(agent.vendor)} />
        <KV k="Hyperscaler" v={<Pill tone="slate">{agent.hyperscaler || "—"}</Pill>} />
        <KV k="Model" v={<span className="font-mono text-xs">{agent.model || "—"}</span>} />
        <KV k="Trust tier" v={agent.trustTier || "—"} />
        <KV k="Status" v={agent.status || "—"} />
      </div>

      {agent.n > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-2">
            Saved vs cost
          </div>
          <div className="space-y-2">
            <MiniBar label="Value saved" value={agent.saved} max={maxBar} fill="hsl(142 70% 42%)" />
            <MiniBar label="Running cost" value={agent.cost} max={maxBar} fill="hsl(var(--primary))" />
          </div>
        </div>
      )}
    </div>
  );
}

function ProviderBars({
  vendorEntries,
  byVendor,
}: {
  vendorEntries: [string, { saved: number; cost: number; n: number }][];
  byVendor: Record<string, { saved: number; cost: number; n: number }>;
}) {
  const maxNet = Math.max(...Object.values(byVendor).map(x => x.saved - x.cost), 1);

  if (vendorEntries.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No financial data yet</p>;
  }

  return (
    <div className="space-y-4">
      {vendorEntries.map(([v, d]) => {
        const net = d.saved - d.cost;
        const pctW = Math.max(2, (net / maxNet) * 100);
        const tone = net >= 0 ? "green" : "red";
        return (
          <div key={v}>
            <div className="flex items-center justify-between text-sm mb-1.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Pill tone="slate">{v}</Pill>
                <span className="text-xs text-muted-foreground tabular-nums">{d.n} tasks</span>
              </div>
              <div className={`font-semibold tabular-nums shrink-0 ${net >= 0 ? "text-[hsl(142_70%_30%)]" : "text-[hsl(0_72%_44%)]"}`}>
                {usd(net, { sign: true })} net
              </div>
            </div>
            <div className="aeos-cognition-contribution-track h-2.5">
              <div
                className="aeos-cognition-contribution-fill"
                style={{
                  width: `${pctW}%`,
                  background: tone === "green" ? "hsl(142 70% 42%)" : "hsl(0 72% 50%)",
                }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between text-[11px] text-muted-foreground mt-1 gap-x-3 gap-y-1">
              <span>saved · {usd(d.saved)}</span>
              <span>cost · {usd(d.cost)}</span>
              <span className="tabular-nums">RoP · {num(d.cost > 0 ? d.saved / d.cost : 0, 2)}×</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ForecastTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-none border p-3 min-w-0 ${highlight ? "border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.06)]" : "border-border bg-muted/20"}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground truncate">{label}</div>
      <div className={`text-base sm:text-lg font-bold tabular-nums mt-0.5 truncate ${highlight ? "text-[hsl(var(--primary))]" : "text-foreground"}`} title={usd(value)}>
        {usd(value)}
      </div>
    </div>
  );
}

function Waterfall({ labels, values }: { labels: string[]; values: number[] }) {
  const max = Math.max(...values.map(v => Math.abs(v)), 1);
  return (
    <div className="space-y-3">
      {labels.map((l, i) => {
        const v = values[i];
        const w = Math.max(3, (Math.abs(v) / max) * 100);
        const positive = v >= 0;
        const isTotal = i === labels.length - 1;
        return (
          <div key={l} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(100px,2fr)_auto] items-center gap-1.5 sm:gap-3 text-sm">
            <div className={`min-w-0 ${isTotal ? "font-semibold" : "text-muted-foreground"}`}>{l}</div>
            <div className="aeos-cognition-contribution-track h-3 min-w-0">
              <div
                className="aeos-cognition-contribution-fill"
                style={{
                  width: `${w}%`,
                  background: positive ? "hsl(142 70% 42%)" : "hsl(0 72% 50%)",
                }}
              />
            </div>
            <div className={`tabular-nums font-semibold sm:min-w-[72px] text-left sm:text-right ${positive ? "text-[hsl(142_70%_30%)]" : "text-[hsl(0_72%_44%)]"}`}>
              {usd(v, { sign: positive })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniBar({ label, value, max, fill }: { label: string; value: number; max: number; fill: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{usd(value)}</span>
      </div>
      <div className="aeos-cognition-contribution-track h-2">
        <div
          className="aeos-cognition-contribution-fill"
          style={{ width: `${Math.max(2, (value / max) * 100)}%`, background: fill }}
        />
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0 text-sm">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="font-medium text-foreground text-right">{v}</span>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" | "left" }) {
  return <th className={`px-3 sm:px-5 py-2.5 font-semibold whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}

function Td({ children, className, align }: { children: React.ReactNode; className?: string; align?: "right" | "left" }) {
  return (
    <td className={`px-3 sm:px-5 py-2.5 tabular-nums whitespace-nowrap ${align === "right" ? "text-right" : ""} ${className ?? ""}`}>
      {children}
    </td>
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
