import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { TablePagination } from "@/components/TablePagination";
import { usd, pct, ago } from "@/lib/format";
import { ScanSearch, Lightbulb, RefreshCw, Check, X, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useListSelection } from "@/hooks/use-list-selection";
import { useEffect, useMemo, useState } from "react";

type Rec = {
  recId: string; title: string; rationale: string;
  template: string; severity: string; status: string;
  predictedDeltaUsd?: number; confidence?: number;
  agentId?: string; workflowId?: string; generatedAt: string;
  decidedAt?: string; decidedBy?: string;
};

const TEMPLATE_TONE: Record<string, "blue" | "amber" | "red" | "green" | "neutral" | "slate"> = {
  cost_optim: "blue",
  gsti_drift: "amber",
  boundary_violation: "red",
  vendor_swap: "blue",
  skill_preserve: "green",
  trust_promotion: "green",
  budget_gate: "amber",
};

const TEMPLATE_LABEL: Record<string, string> = {
  cost_optim: "Cost optimization",
  gsti_drift: "GSTI drift",
  boundary_violation: "Boundary violation",
  vendor_swap: "Vendor swap",
  skill_preserve: "Skill preserve",
  trust_promotion: "Trust promotion",
  budget_gate: "Budget gate",
};

const STATUS_TONE: Record<string, "amber" | "green" | "red" | "slate"> = {
  new: "amber",
  adopted: "green",
  rejected: "red",
  deferred: "slate",
};

const FILTER_LABELS: Record<"all" | "new" | "adopted" | "rejected", string> = {
  all: "All",
  new: "New",
  adopted: "Adopted",
  rejected: "Rejected",
};

export default function Recommendations() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: recs, isLoading, isError } = useQuery<Rec[]>({ queryKey: ["/api/recommendations"] });
  const [filter, setFilter] = useState<"all" | "new" | "adopted" | "rejected">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [genNote, setGenNote] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/pel/rollup");
      const res = await apiRequest("POST", "/api/recommendations/generate");
      const json = (await res.json()) as { generated?: number };
      return json.generated ?? 0;
    },
    onSuccess: (generated) => {
      void qc.invalidateQueries({ queryKey: ["/api/recommendations"] });
      void qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      if (generated > 0) {
        const msg = `Created ${generated} new proposal${generated === 1 ? "" : "s"}.`;
        setGenNote(msg);
        toast({ title: "Recommendations generated", description: msg });
      } else {
        const msg =
          "No new proposals right now — your metrics may already be healthy, or there may not be enough recent activity. Try refreshing on Cognition Plane, then run cognition again.";
        setGenNote(msg);
        toast({ title: "Nothing new to propose", description: msg });
      }
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not generate proposals.";
      setGenNote(null);
      toast({ title: "Could not generate proposals", description: msg, variant: "destructive" });
    },
  });

  const decide = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("POST", `/api/recommendations/${id}/decide`, { status }),
    onSuccess: (_data, { status }) => {
      void qc.invalidateQueries({ queryKey: ["/api/recommendations"] });
      void qc.invalidateQueries({ queryKey: ["/api/governance/decisions"] });
      void qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({
        title: status === "adopted" ? "Proposal adopted" : "Proposal rejected",
        description: status === "adopted"
          ? "Recorded in the governance trail."
          : "Marked as rejected — no changes applied.",
      });
    },
    onError: (e: unknown) => {
      toast({
        title: "Could not save decision",
        description: e instanceof Error ? e.message : "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const all = recs ?? [];
  const newCount = all.filter(r => r.status === "new").length;
  const adoptedCount = all.filter(r => r.status === "adopted").length;
  const rejectedCount = all.filter(r => r.status === "rejected").length;
  const decidedCount = adoptedCount + rejectedCount;
  const adoptionRate = decidedCount > 0 ? adoptedCount / decidedCount : 0;

  const projectedSavings = -all
    .filter(r => r.status === "new")
    .reduce((s, r) => s + (r.predictedDeltaUsd ?? 0), 0);

  const filterCounts = useMemo(() => ({
    all: all.length,
    new: newCount,
    adopted: adoptedCount,
    rejected: rejectedCount,
  }), [all.length, newCount, adoptedCount, rejectedCount]);

  const topTemplates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of all.filter(x => x.status === "new")) {
      counts.set(r.template, (counts.get(r.template) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [all]);

  const list = useMemo(
    () => all.filter(r => filter === "all" ? true : r.status === filter),
    [all, filter],
  );

  const paged = list.slice((page - 1) * pageSize, page * pageSize);

  const { selected: active, select: selectRec, id: activeRecId } = useListSelection(
    paged,
    (r) => r.recId,
  );

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(list.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [list.length, page, pageSize]);

  const criticalNew = all.filter(r => r.status === "new" && r.severity === "critical").length;

  return (
    <Layout
      title="Recommendations"
      kicker="Economic Cognition / Human disposition"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <Lightbulb className="h-3 w-3" />
            {isLoading ? "Loading…" : isError ? "Unavailable" : newCount > 0 ? `${newCount} pending` : all.length > 0 ? `${all.length} total` : "Empty"}
          </Pill>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark"
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            data-testid="btn-generate"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${generate.isPending ? "animate-spin" : ""}`} />
            {generate.isPending ? "Running…" : "Run cognition"}
          </button>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          The Cognition Plane proposes — humans dispose. Each recommendation is templated with a
          predicted economic delta and model confidence; adopt or reject to close the governance loop.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">7 cognition templates</Pill>
          <Pill tone="slate">Patent Family 5 · Trust tiers</Pill>
        </div>
      </div>

      {genNote && (
        <div className="rounded-none border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          {genNote}
        </div>
      )}

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load recommendations. Try refreshing the page or signing in again.
        </div>
      )}

      {!isError && !isLoading && all.length === 0 && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No proposals yet. Click <span className="font-medium text-foreground">Run cognition</span> in the header
          {" "}(refreshes metrics first, then scans for improvements). If the queue stays empty, open{" "}
          <Link href="/ecl/cognition" className="text-[hsl(var(--primary))] hover:underline">Cognition Plane</Link>
          {" "}and click <span className="font-medium text-foreground">Refresh</span> in the top bar, then try again.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="amber"
          icon={<Lightbulb className="h-4 w-4" />}
          label="NEW"
          value={String(newCount)}
          sub="Awaiting human decision"
          trend={newCount > 0 ? (
            <span className="text-[11px] font-semibold text-[hsl(38_90%_38%)]">pending</span>
          ) : undefined}
          footer={
            topTemplates.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {topTemplates.map(([tpl, n]) => (
                  <span key={tpl}>
                    <span className="font-semibold text-foreground tabular-nums">{n}</span>{" "}
                    {TEMPLATE_LABEL[tpl] ?? tpl.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            ) : undefined
          }
        />
        <KpiCard
          tone="green"
          icon={<Check className="h-4 w-4" />}
          label="ADOPTED"
          value={String(adoptedCount)}
          sub="Closed-loop applied"
          footer={
            decidedCount > 0 ? (
              <div className="text-xs text-muted-foreground">
                Adoption rate <span className="font-semibold text-foreground tabular-nums">{pct(adoptionRate, 0)}</span>
              </div>
            ) : undefined
          }
        />
        <KpiCard
          tone="orange"
          icon={<ScanSearch className="h-4 w-4" />}
          label="PROJECTED SAVINGS"
          value={usd(projectedSavings)}
          sub="If all NEW adopted (per week)"
        />
        <KpiCard
          tone="slate"
          icon={<RefreshCw className="h-4 w-4" />}
          label="TOTAL QUEUE"
          value={String(all.length)}
          sub={`${rejectedCount} rejected`}
        />
      </div>

      {newCount > 0 && (
        <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-none bg-[hsl(38_96%_92%)] text-[hsl(28_90%_38%)]">
              <Lightbulb className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
                Pending disposition
              </div>
              <div className="text-sm font-semibold text-foreground mt-1 break-words">
                {newCount} recommendation{newCount !== 1 ? "s" : ""} awaiting review
                {criticalNew > 0 && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(0_72%_44%)]">
                    <AlertTriangle className="h-3 w-3" />
                    {criticalNew} critical
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Combined projected savings if adopted:{" "}
                <span className="font-semibold text-[hsl(142_70%_30%)] tabular-nums">{usd(projectedSavings)}</span> / week
              </div>
            </div>
          </div>
          <button
            type="button"
            className="aeos-btn aeos-btn-primary shrink-0 w-full sm:w-auto"
            onClick={() => { setFilter("new"); setPage(1); }}
          >
            Review pending
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start min-w-0">
        <SectionCard
          className="min-w-0"
          kicker="Recommendation queue"
          title="Proposals awaiting disposition"
          padding={false}
          action={
            <div className="aeos-content-segment" role="tablist" aria-label="Recommendation status filter">
              {(["all", "new", "adopted", "rejected"] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  onClick={() => setFilter(f)}
                  className="aeos-content-segment-btn"
                  data-active={filter === f ? "true" : "false"}
                  aria-selected={filter === f}
                  data-testid={`filter-${f}`}
                >
                  {FILTER_LABELS[f]}
                  <span className="ml-1 tabular-nums opacity-70">({filterCounts[f]})</span>
                </button>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[40rem] xl:min-w-0">
            <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th>Proposal</Th>
                <Th>Template</Th>
                <Th>Status</Th>
                <Th>Δ / wk</Th>
                <Th>Conf</Th>
                <Th>Age</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Loading recommendations…
                  </td>
                </tr>
              )}
              {!isLoading && paged.map(r => (
                <tr
                  key={r.recId}
                  className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                    activeRecId === r.recId ? "bg-primary/5" : ""
                  } ${severityRowClass(r.severity)}`}
                  onClick={() => selectRec(r)}
                  data-testid={`row-${r.recId}`}
                >
                  <Td>
                    <div className="flex items-center gap-2 min-w-0">
                      <SeverityDot severity={r.severity} />
                      <span className="font-medium text-foreground truncate max-w-[10rem] sm:max-w-[14rem] xl:max-w-none" title={r.title}>{r.title}</span>
                    </div>
                  </Td>
                  <Td>
                    <Pill tone={TEMPLATE_TONE[r.template] ?? "neutral"}>
                      {TEMPLATE_LABEL[r.template] ?? r.template.replace(/_/g, " ")}
                    </Pill>
                  </Td>
                  <Td>
                    <Pill tone={STATUS_TONE[r.status] ?? "slate"}>
                      <StatusDot tone={STATUS_TONE[r.status] ?? "slate"} />
                      {r.status}
                    </Pill>
                  </Td>
                  <Td className={deltaClass(r.predictedDeltaUsd)}>
                    {r.predictedDeltaUsd != null
                      ? `${r.predictedDeltaUsd > 0 ? "+" : ""}${usd(r.predictedDeltaUsd)}`
                      : "—"}
                  </Td>
                  <Td className="tabular-nums">
                    {r.confidence != null ? pct(r.confidence) : "—"}
                  </Td>
                  <Td className="text-muted-foreground text-xs whitespace-nowrap">{ago(r.generatedAt)}</Td>
                </tr>
              ))}
              {!isLoading && list.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    {all.length === 0
                      ? <>No proposals yet — use <span className="font-medium text-foreground">Run cognition</span> in the header.</>
                      : "No recommendations for this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            total={list.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="recommendations"
          />
        </SectionCard>

        <SectionCard
          className="h-fit min-w-0"
          kicker={active ? "Disposition detail" : "Detail"}
          title={active ? active.title : "Select a proposal"}
        >
          {!active ? (
            <p className="text-sm text-muted-foreground">
              Click any row to inspect the full rationale, economic projection, and confidence score — then adopt or reject to close the loop.
            </p>
          ) : (
            <div className="space-y-4">
              <Block title="Proposal" tone={severityBlockTone(active.severity)}>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{active.rationale}</p>
                <KV k="Template" v={
                  <Pill tone={TEMPLATE_TONE[active.template] ?? "neutral"}>
                    {TEMPLATE_LABEL[active.template] ?? active.template.replace(/_/g, " ")}
                  </Pill>
                } />
                <KV k="Severity" v={
                  <Pill tone={active.severity === "critical" ? "red" : active.severity === "warn" ? "amber" : "blue"}>
                    {active.severity}
                  </Pill>
                } />
              </Block>

              <Block title="Scope" tone="slate">
                <KV k="Rec ID" v={active.recId} mono />
                {active.agentId && <KV k="Agent" v={active.agentId} mono />}
                {active.workflowId && <KV k="Workflow" v={active.workflowId} mono />}
                <KV k="Generated" v={ago(active.generatedAt)} />
              </Block>

              <Block title="Economics" tone="orange">
                <KV
                  k="Projected Δ"
                  v={
                    active.predictedDeltaUsd != null ? (
                      <span className={deltaClass(active.predictedDeltaUsd)}>
                        {active.predictedDeltaUsd > 0 ? "+" : ""}{usd(active.predictedDeltaUsd)} / week
                      </span>
                    ) : "—"
                  }
                />
                {active.confidence != null && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">Model confidence</span>
                      <span className="font-semibold tabular-nums">{pct(active.confidence)}</span>
                    </div>
                    <div className="aeos-cognition-contribution-track">
                      <div
                        className="aeos-cognition-contribution-fill bg-[hsl(var(--sidebar))]"
                        style={{ width: `${Math.round(active.confidence * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </Block>

              <Block title="Disposition" tone={STATUS_TONE[active.status] === "green" ? "green" : STATUS_TONE[active.status] === "red" ? "red" : "amber"}>
                <KV k="Status" v={
                  <Pill tone={STATUS_TONE[active.status] ?? "slate"}>
                    <StatusDot tone={STATUS_TONE[active.status] ?? "slate"} />
                    {active.status}
                  </Pill>
                } />
                {active.decidedAt && (
                  <>
                    <KV k="Decided" v={ago(active.decidedAt)} />
                    {active.decidedBy && <KV k="By" v={active.decidedBy} />}
                  </>
                )}
                {active.status === "new" && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-3 pt-2 border-t border-border/60">
                    <button
                      type="button"
                      className="aeos-btn aeos-btn-danger flex-1"
                      onClick={() => decide.mutate({ id: active.recId, status: "rejected" })}
                      disabled={decide.isPending}
                      data-testid={`btn-reject-${active.recId}`}
                    >
                      <X className="h-3.5 w-3.5" />
                      {decide.isPending ? "Saving…" : "Reject"}
                    </button>
                    <button
                      type="button"
                      className="aeos-btn aeos-btn-primary flex-1"
                      onClick={() => decide.mutate({ id: active.recId, status: "adopted" })}
                      disabled={decide.isPending}
                      data-testid={`btn-adopt-${active.recId}`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {decide.isPending ? "Saving…" : "Adopt"}
                    </button>
                  </div>
                )}
              </Block>
            </div>
          )}
        </SectionCard>
      </div>
    </Layout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 sm:px-5 py-2.5 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 sm:px-5 py-2.5 ${className ?? ""}`}>{children}</td>;
}

function Block({ title, tone, children }: { title: string; tone: "blue" | "amber" | "orange" | "red" | "green" | "slate"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    blue: "border-[hsl(213_94%_82%)] bg-[hsl(213_100%_97%)]",
    amber: "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]",
    orange: "border-[hsl(25_95%_80%)] bg-[hsl(25_100%_97%)]",
    red: "border-[hsl(0_85%_84%)]   bg-[hsl(0_100%_97%)]",
    green: "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]",
    slate: "border-border bg-muted",
  };
  return (
    <div className={`rounded-none border-l-4 px-3 py-2 min-w-0 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-foreground/70 mb-1">{title}</div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-3 py-0.5 min-w-0">
      <span className="text-muted-foreground sm:w-24 shrink-0">{k}</span>
      <span className={`font-medium min-w-0 break-all ${mono ? "font-mono text-[10px]" : ""}`}>{v}</span>
    </div>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const cls = severity === "critical"
    ? "bg-[hsl(0_72%_44%)]"
    : severity === "warn"
      ? "bg-[hsl(28_90%_38%)]"
      : "bg-[hsl(213_84%_42%)]";
  return <span className={`h-2 w-2 shrink-0 rounded-none ${cls}`} aria-hidden />;
}

function severityRowClass(severity: string) {
  if (severity === "critical") return "border-l-2 border-l-[hsl(0_72%_44%)]";
  if (severity === "warn") return "border-l-2 border-l-[hsl(28_90%_38%)]";
  return "";
}

function severityBlockTone(severity: string): "blue" | "amber" | "red" {
  if (severity === "critical") return "red";
  if (severity === "warn") return "amber";
  return "blue";
}

function deltaClass(delta?: number) {
  if (delta == null) return "";
  return delta <= 0
    ? "font-semibold text-[hsl(142_70%_30%)] tabular-nums"
    : "font-semibold text-[hsl(0_72%_44%)] tabular-nums";
}
