import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { TablePagination } from "@/components/TablePagination";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { usd, num, pct, ago } from "@/lib/format";
import {
  Coins, RefreshCw, Brain, Workflow, Eye, BookCheck, ShieldCheck,
  Sparkles, Send, Info, Users, Bot, Zap, ArrowRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

type Snapshot = {
  id: number; computedAt: string; cuow: number; abt: number; mer: number;
  ctr: number; tv: number; rop: number; tuop: number; huop: number;
  auop: number; synergyS: number; taskCount: number;
};
type Summary = {
  economics: { ropAvg: number; netSavingsUsd: number; weeklyRunRateUsd: number;
    laborValueSavedUsd: number; amortizedCostUsd: number };
  counts: { events: number; ledgerRows: number; ledgerOpen: number; ledgerClosed: number; agents: number };
  quality: { passRate: number; humanReviewQueued: number };
  latestEquations?: Snapshot | null;
};

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info size={12} className="text-muted-foreground cursor-help shrink-0 inline" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ropHealth(rop: number): { label: string; tone: "green" | "blue" | "amber" | "red" } {
  if (rop >= 2) return { label: "Excellent", tone: "green" };
  if (rop >= 1) return { label: "Healthy", tone: "blue" };
  if (rop >= 0.5) return { label: "Needs attention", tone: "amber" };
  return { label: "Underperforming", tone: "red" };
}

export default function CognitionPlane() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const equationsKey = ["/api/pel/equations?hours=720"];
  const { data: s, isLoading: summaryLoading, isError: summaryError } = useQuery<Summary>({
    queryKey: ["/api/dashboard/summary"],
  });
  const { data: snaps, isLoading: snapsLoading, isError: snapsError } = useQuery<Snapshot[]>({
    queryKey: equationsKey,
  });

  const isLoading = summaryLoading || snapsLoading;
  const isError = summaryError || snapsError;
  const eventCount = s?.counts.events ?? 0;
  const hasEvents = eventCount > 0;
  const noEvents = !isLoading && !isError && !hasEvents;
  const needsRefresh = !isLoading && !isError && hasEvents && !s?.latestEquations;

  const [justRefreshed, setJustRefreshed] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  const rollup = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pel/rollup"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: equationsKey });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      setJustRefreshed(true);
      toast({ title: "Metrics updated", description: "Performance numbers refreshed from latest activity." });
    },
    onError: (e: unknown) => {
      toast({
        title: "Refresh failed",
        description: e instanceof Error ? e.message : "Could not update metrics right now.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!justRefreshed) return;
    const t = setTimeout(() => setJustRefreshed(false), 1400);
    return () => clearTimeout(t);
  }, [justRefreshed]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Cognition Snapshot · " + new Date().toISOString().slice(5, 16));
  const [classification, setClassification] = useState<"AI-Primary" | "Hybrid" | "AI-Assisted" | "Human-Only">("Hybrid");
  const [tier, setTier] = useState("T0_unverified");

  const publish = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/uop/publish", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/uop/library"] });
      setOpen(false);
      toast({ title: "Snapshot saved", description: "You can find it in your library of saved results." });
      setTimeout(() => navigate("/ecl/uop-library"), 800);
    },
    onError: (e: any) => toast({
      title: "Couldn't save",
      description: e?.message ?? "Something went wrong while saving this snapshot.",
    }),
  });

  const eq = s?.latestEquations ?? (snaps ?? [])[(snaps ?? []).length - 1];
  const synergyDollars = eq ? (eq.huop * eq.auop * eq.synergyS) / Math.max(1, eq.huop + eq.auop) : 0;
  const tuopTotal = eq ? Math.max(1, eq.huop + eq.auop + synergyDollars) : 1;
  const peopleShare = eq ? eq.huop / tuopTotal : 0;
  const aiShare = eq ? eq.auop / tuopTotal : 0;
  const bonusShare = eq ? synergyDollars / tuopTotal : 0;
  const health = ropHealth(eq?.rop ?? 0);

  const history = useMemo(() => (snaps ?? []).slice().reverse(), [snaps]);
  const pagedHistory = history.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(history.length / historyPageSize));
    if (historyPage > maxPage) setHistoryPage(maxPage);
  }, [history.length, historyPage, historyPageSize]);

  return (
    <Layout
      title="Cognition Plane"
      kicker="Economic Cognition / Five Equations"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <Coins className="h-3 w-3" />
            {isLoading ? "Loading…" : isError ? "Unavailable" : eq ? "Live metrics" : hasEvents ? "Awaiting refresh" : "No activity"}
          </Pill>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-secondary-on-dark"
            onClick={() => rollup.mutate()}
            disabled={rollup.isPending}
            data-testid="btn-rollup"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rollup.isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button type="button" className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark" data-testid="btn-publish-uop">
                <Send className="h-3.5 w-3.5" />
                Save snapshot
              </button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Save this snapshot</DialogTitle>
                <DialogDescription>
                  Save a copy of how your AI is performing right now so you (or your team) can reuse or compare it later.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label htmlFor="uop-name">Name</Label>
                  <Input id="uop-name" value={name} onChange={e => setName(e.target.value)} data-testid="input-uop-name" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="flex items-center gap-1">
                      Who's doing the work
                      <InfoTip text="A label describing how much of this work is done by AI versus people — purely descriptive, doesn't change any numbers." />
                    </Label>
                    <select
                      className="mt-1 w-full rounded-md border bg-card px-2 py-2 text-sm"
                      value={classification}
                      onChange={e => setClassification(e.target.value as typeof classification)}
                      data-testid="select-classification"
                    >
                      <option value="AI-Primary">Mostly AI</option>
                      <option value="Hybrid">AI + people together</option>
                      <option value="AI-Assisted">People, AI-assisted</option>
                      <option value="Human-Only">People only</option>
                    </select>
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      Trust level
                      <InfoTip text="How much this result has been checked and verified — from 'not yet checked' to 'fully trusted and autonomous'." />
                    </Label>
                    <select
                      className="mt-1 w-full rounded-md border bg-card px-2 py-2 text-sm"
                      value={tier}
                      onChange={e => setTier(e.target.value)}
                      data-testid="select-tier"
                    >
                      <option value="T0_unverified">Not yet checked</option>
                      <option value="T1_observed">Being watched</option>
                      <option value="T2_supervised">Supervised</option>
                      <option value="T3_trusted">Trusted</option>
                      <option value="T4_autonomous">Fully trusted</option>
                    </select>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5">
                  <div>Return on investment: <span className="font-semibold text-foreground">{eq ? num(eq.rop, 2) + "×" : "—"}</span> · Cost per task: <span className="font-semibold text-foreground">{eq ? usd(eq.cuow) : "—"}</span></div>
                  <div>Value from people: <span className="font-semibold text-foreground">{eq ? usd(eq.huop, { decimals: 0 }) : "—"}</span> · Value from AI: <span className="font-semibold text-foreground">{eq ? usd(eq.auop, { decimals: 0 }) : "—"}</span></div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <button type="button" className="aeos-btn aeos-btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button
                  type="button"
                  className="aeos-btn aeos-btn-primary"
                  onClick={() => publish.mutate({ name, classification, trustTier: tier })}
                  disabled={publish.isPending}
                  data-testid="btn-confirm-publish"
                >
                  {publish.isPending ? "Saving…" : "Save"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          The Cognition Plane rolls the Five Equations into the TUoP master equation — measuring how much value
          people and AI create together, and whether your fleet is paying for itself.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">Patent Family 2 · UoP Master Equation</Pill>
          <Pill tone="slate">RoP · CUoW · MER · CTR · GSTI</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load cognition metrics. Try refreshing the page or signing in again.
        </div>
      )}

      {!isError && noEvents && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No activity recorded yet. Once agents are running, open{" "}
          <Link href="/ecl/observation" className="text-[hsl(var(--primary))] hover:underline">Observation Plane</Link>
          {" "}to review events, then click <span className="font-medium text-foreground">Refresh</span> in the top bar above.
        </div>
      )}

      {!isError && needsRefresh && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          Activity is present but metrics have not been computed yet. Click{" "}
          <span className="font-medium text-foreground">Refresh</span> in the top bar to update RoP, cost per task, and total output.
        </div>
      )}

      <SectionCard className="aeos-cognition-hero mb-6 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Pill tone={health.tone}>
            <StatusDot tone={health.tone} />
            {health.label}
          </Pill>
          {justRefreshed && (
            <Pill tone="green">Numbers updated</Pill>
          )}
          {eq && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {num(eq.taskCount, 0)} tasks · last hour
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-foreground max-w-3xl break-words">
          In the last hour, your AI agents finished{" "}
          <span className="font-semibold tabular-nums">{eq ? num(eq.taskCount, 0) : "—"} tasks</span>, creating{" "}
          <span className="font-semibold tabular-nums">{eq ? usd(eq.tuop, { decimals: 0 }) : "—"}</span> of value —{" "}
          <span className="font-semibold text-primary tabular-nums">{usd(s?.economics.netSavingsUsd ?? 0)}</span> more
          than it cost to run them.
        </p>
      </SectionCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="orange"
          icon={<Coins className="h-4 w-4" />}
          label="COST PER TASK"
          value={eq ? usd(eq.cuow) : "—"}
          sub={
            <span className="inline-flex items-center gap-1">
              {eq?.taskCount ?? 0} tasks this hour
              <InfoTip text="The average amount it costs to run one AI task, including the model and coordination overhead. Lower is better." />
            </span>
          }
        />
        <KpiCard
          tone="primary"
          icon={<Workflow className="h-4 w-4" />}
          label="BREAK-EVEN"
          value={eq ? num(eq.abt, 2) + "×" : "—"}
          sub={
            <span className="inline-flex items-center gap-1">
              vs. doing it by hand
              <InfoTip text="How many times cheaper your AI is compared to a person doing the same task. Above 1× means the AI is the cheaper option." />
            </span>
          }
        />
        <KpiCard
          tone="green"
          icon={<Sparkles className="h-4 w-4" />}
          label="EFFICIENCY"
          value={eq ? num(eq.mer, 2) : "—"}
          sub={
            <span className="inline-flex items-center gap-1">
              quality per dollar
              <InfoTip text="How much accuracy and quality you get for each dollar spent. Higher means your AI is converting spend into good outcomes more efficiently." />
            </span>
          }
        />
        <KpiCard
          tone="amber"
          icon={<Users className="h-4 w-4" />}
          label="HUMAN CHECKS"
          value={eq ? pct(eq.ctr) : "—"}
          sub={
            <span className="inline-flex items-center gap-1">
              {s?.quality.humanReviewQueued ?? 0} queued
              <InfoTip text="The share of AI work that gets sent to a person to double-check before it's considered done." />
            </span>
          }
        />
        <KpiCard
          tone="primary"
          icon={<Brain className="h-4 w-4" />}
          label="SPEED GAIN"
          value={eq ? num(eq.tv, 2) + "×" : "—"}
          sub={
            <span className="inline-flex items-center gap-1">
              vs. target pace
              <InfoTip text="How much faster your AI is completing work compared to the pace you're aiming for. 1.0× means it's right on target." />
            </span>
          }
          footer={
            eq ? (
              <div className="text-xs text-muted-foreground">
                RoP <span className="font-semibold text-foreground tabular-nums">{num(eq.rop, 2)}×</span> this hour
              </div>
            ) : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-4 sm:gap-5 mb-6 items-start min-w-0">
        <SectionCard className="min-w-0" kicker="Master equation" title="Where the value comes from">
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            Some work is done by people, some by AI — and when they work together, they create
            extra value that neither could produce alone.
          </p>

          <div className="space-y-3 mb-4">
            <ContributionBar icon={<Users className="h-3.5 w-3.5" />} color="hsl(38 90% 50%)"
              label="People" value={eq ? usd(eq.huop, { decimals: 0 }) : "—"} share={peopleShare} delay={0} />
            <ContributionBar icon={<Bot className="h-3.5 w-3.5" />} color="hsl(213 84% 56%)"
              label="AI" value={eq ? usd(eq.auop, { decimals: 0 }) : "—"} share={aiShare} delay={0.12} />
            <ContributionBar icon={<Zap className="h-3.5 w-3.5" />} color="hsl(142 70% 45%)"
              label="Teamwork bonus" value={usd(synergyDollars, { decimals: 0 })} share={bonusShare} delay={0.24} />
          </div>

          <div className="aeos-cognition-total">
            <div className="text-[10px] uppercase tracking-[.18em] text-muted-foreground font-semibold flex items-center gap-1">
              Total value created (TUoP)
              <InfoTip text="Everything your AI and people produced, added together — including the extra value created when they collaborate." />
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-1">
              <div className="text-2xl sm:text-3xl font-bold tabular-nums text-primary">{eq ? usd(eq.tuop, { decimals: 0 }) : "—"}</div>
              <div className="text-xs text-muted-foreground">this period</div>
            </div>
          </div>

          <div className="rounded-none border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground flex items-start gap-2">
            <Zap className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            <span>
              Working together, people and AI are producing roughly{" "}
              <span className="font-semibold text-foreground tabular-nums">{eq ? usd(synergyDollars, { decimals: 0 }) : "—"}</span>{" "}
              more in value than if they each worked separately.
            </span>
          </div>
        </SectionCard>

        <SectionCard kicker="Return on investment" title="Is the AI worth it?" className="h-fit min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
            <div className="aeos-cognition-roi-value text-foreground max-w-full overflow-hidden">
              {eq ? num(eq.rop, 2) : "—"}
              <span className="text-2xl text-muted-foreground ml-0.5">×</span>
            </div>
            <Pill tone={health.tone}>{health.label}</Pill>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {eq
              ? <>For every <span className="font-semibold text-foreground">$1</span> spent running AI,
                  you get back about <span className="font-semibold text-foreground tabular-nums">{usd(eq.rop)}</span> in value —{" "}
                  {eq.rop > 1 ? "your fleet is paying for itself." : "costs currently exceed returns."}</>
              : "Once your AI starts running, this shows value returned for every dollar spent."}
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
            <Mini label="Tasks (1h)" value={eq?.taskCount ?? 0} />
            <Mini label="Net gain" value={usd(s?.economics.netSavingsUsd ?? 0)} />
            <Mini label="Weekly pace" value={usd(s?.economics.weeklyRunRateUsd ?? 0)} />
          </div>
        </SectionCard>
      </div>

      <SectionCard className="min-w-0" kicker="Snapshot history" title="How these numbers changed (24h)" padding={false}>
        <div className="overflow-x-auto -mx-1 sm:mx-0">
          <table className="w-full text-sm min-w-[52rem]">
            <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th>When</Th>
                <ThTip label="Cost / task" tip="The average cost to run one AI task at that point in time." />
                <ThTip label="Break-even" tip="How many times cheaper the AI was than doing the work by hand." />
                <ThTip label="Efficiency" tip="Quality delivered per dollar spent — higher is better." />
                <ThTip label="Human checks" tip="Share of AI work that needed a person to review it." />
                <ThTip label="Speed gain" tip="How much faster the AI was running compared to the target pace." />
                <ThTip label="Return" tip="Value returned for every dollar spent." />
                <ThTip label="People $" tip="Dollar value of work done by people in that snapshot." />
                <ThTip label="AI $" tip="Dollar value of work done by AI in that snapshot." />
                <ThTip label="Bonus" tip="Extra teamwork value when people and AI collaborated." />
                <Th>Tasks</Th>
              </tr>
            </thead>
            <tbody>
              {pagedHistory.map(sn => (
                <tr key={sn.id} className="border-b last:border-0 hover:bg-muted/40">
                  <Td mono>{ago(sn.computedAt)}</Td>
                  <Td>{usd(sn.cuow)}</Td>
                  <Td>{num(sn.abt, 2)}×</Td>
                  <Td>{num(sn.mer, 2)}</Td>
                  <Td>{pct(sn.ctr)}</Td>
                  <Td>{num(sn.tv, 2)}×</Td>
                  <Td className="text-primary font-semibold">{num(sn.rop, 2)}×</Td>
                  <Td>{usd(sn.huop, { decimals: 0 })}</Td>
                  <Td>{usd(sn.auop, { decimals: 0 })}</Td>
                  <Td>{num(sn.synergyS, 3)}</Td>
                  <Td>{sn.taskCount}</Td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-10 text-center text-muted-foreground">
                    No history yet — click <span className="font-medium text-foreground">Refresh</span> in the top bar to compute the first snapshot.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          page={historyPage}
          pageSize={historyPageSize}
          total={history.length}
          onPageChange={setHistoryPage}
          onPageSizeChange={setHistoryPageSize}
          itemLabel="snapshots"
        />
      </SectionCard>

      <div className="mt-6 mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
        Explore further
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 min-w-0">
        <PipelineCard icon={<Eye className="h-4 w-4" />} title="Observation Plane"
          desc="Every agent action, recorded in a tamper-proof activity log."
          to="/ecl/observation" />
        <PipelineCard icon={<BookCheck className="h-4 w-4" />} title="Predictive Ledger"
          desc="Compare predicted vs. actual outcomes, dollar for dollar."
          to="/ecl/ledger" />
        <PipelineCard icon={<ShieldCheck className="h-4 w-4" />} title="Audit Trail"
          desc="Trust tiers, governance rules, and the audit trail behind every decision."
          to="/governance/audit" />
      </div>
    </Layout>
  );
}

function ContributionBar({ icon, color, label, value, share, delay = 0 }: {
  icon: React.ReactNode; color: string; label: string; value: string; share: number; delay?: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,8.25rem)_1fr_auto] items-center gap-2 sm:gap-3 min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
        <span className="grid place-items-center h-6 w-6 shrink-0" style={{ background: `${color}1f`, color }}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="aeos-cognition-contribution-track min-w-0 w-full">
        <motion.div
          className="aeos-cognition-contribution-fill"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(share * 100, 3).toFixed(1)}%` }}
          transition={{ duration: 0.7, delay, ease: "easeOut" }}
        />
      </div>
      <div className="shrink-0 text-left sm:text-right sm:min-w-[5.5rem]">
        <span className="font-semibold tabular-nums text-sm text-foreground">{value}</span>
        <span className="text-[10px] text-muted-foreground ml-1">{pct(share, 0)}</span>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="aeos-cognition-mini min-w-0">
      <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground font-semibold truncate">{label}</div>
      <div className="font-semibold tabular-nums mt-0.5 truncate">{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 sm:px-5 py-2.5 font-semibold whitespace-nowrap">{children}</th>;
}

function ThTip({ label, tip }: { label: string; tip: string }) {
  return (
    <th className="text-left px-3 sm:px-5 py-2.5 font-semibold whitespace-nowrap">
      <span className="inline-flex items-center gap-1">{label}<InfoTip text={tip} /></span>
    </th>
  );
}

function Td({ children, mono, className }: { children: React.ReactNode; mono?: boolean; className?: string }) {
  return <td className={`px-3 sm:px-5 py-2.5 tabular-nums whitespace-nowrap ${mono ? "font-mono text-xs" : ""} ${className ?? ""}`}>{children}</td>;
}

function PipelineCard({ icon, title, desc, to }: { icon: React.ReactNode; title: string; desc: string; to: string }) {
  return (
    <Link href={to} className="aeos-link-card group min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="aeos-link-card-icon shrink-0">{icon}</div>
          <div className="text-sm font-semibold truncate">{title}</div>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </Link>
  );
}
