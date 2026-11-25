import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { TablePagination } from "@/components/TablePagination";
import { usd, num, ago } from "@/lib/format";
import { BookCheck, GitMerge, Repeat, Target, AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useListSelection } from "@/hooks/use-list-selection";

type Row = {
  decisionId: string; agentId: string; status: string; createdAt: string; closedAt?: string;
  predictedCostUsd: number; predictedOutcomeUsd: number;
  actualCostUsd?: number; actualOutcomeUsd?: number;
  techVarianceSigma?: number; techErrorRate?: number;
  econWinRateDelta?: number; econCostDelta?: number;
  attributionBucket?: string; attributionConfidence?: number;
  correctionType?: string; correctionRef?: string;
  cosignStatus?: string; uefGstiClassification?: string;
  rowHash: string; prevRowHash?: string;
};

const ATTR_TONE: Record<string, any> = { agent: "blue", prompt: "amber", data: "slate", policy: "red", environment: "neutral" };

export default function PredictiveLedger() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows, isLoading, isError } = useQuery<Row[]>({ queryKey: ["/api/pel/rows"] });
  const [filter, setFilter] = useState<"all" | "open" | "closed">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  const reconcile = useMutation({
    mutationFn: (decisionId: string) =>
      apiRequest("POST", "/api/pel/reconcile", {
        decisionId,
        actualCostUsd: 0.012 + Math.random() * 0.04,
        actualOutcomeUsd: 0.6 + Math.random() * 0.6,
        sor: ["salesforce", "sap", "hubspot", "oracle_gl"][Math.floor(Math.random() * 4)],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/pel/rows"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      toast({ title: "Row closed", description: "Actual cost and outcome recorded for this decision." });
    },
    onError: (e: unknown) => {
      toast({
        title: "Could not close row",
        description: e instanceof Error ? e.message : "Something went wrong while recording actuals.",
        variant: "destructive",
      });
    },
  });

  const allRows = rows ?? [];
  const open = allRows.filter(r => r.status === "open").length;
  const closed = allRows.filter(r => r.status === "closed").length;
  const cosigned = allRows.filter(r => r.cosignStatus === "complete").length;
  const correctionCount = allRows.filter(r => r.correctionType).length;
  const highVariance = allRows.filter(r => r.techVarianceSigma != null && Math.abs(r.techVarianceSigma) > 2).length;

  const list = useMemo(
    () => allRows.filter(r => filter === "all" ? true : r.status === filter),
    [allRows, filter],
  );

  const total = allRows.length;
  const openPct = total > 0 ? (open / total) * 100 : 0;
  const cosignRate = closed > 0 ? (cosigned / closed) * 100 : 0;
  const correctionPct = total > 0 ? (correctionCount / total) * 100 : 0;

  const paged = list.slice((page - 1) * pageSize, page * pageSize);

  const { selected: active, select: selectRow, id: activeId } = useListSelection(
    list,
    (r) => r.decisionId,
  );

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(list.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [list.length, page, pageSize]);

  return (
    <Layout
      title="Predictive Economic Ledger"
      kicker="Economic Cognition / PEL"
      headerRight={
        <Pill tone="blue" className="gap-1.5">
          <BookCheck className="h-3 w-3" />
          {isLoading ? "Loading…" : isError ? "Unavailable" : total > 0 ? `${total} rows` : "No rows yet"}
        </Pill>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Five-structure rows replace the single-event log of legacy observability:
          <span className="font-semibold text-foreground"> Predicted</span> →
          <span className="font-semibold text-foreground"> Actual</span> →
          <span className="font-semibold text-foreground"> Variance</span> →
          <span className="font-semibold text-foreground"> Attribution</span> →
          <span className="font-semibold text-foreground"> Correction</span>.
          Each row co-signed by both KMS roots; any tampering breaks the chain.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">Patent Family 8 · Economic Ledger</Pill>
          <Pill tone="slate">PEL-01..14</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load ledger rows. Try refreshing the page or signing in again.
        </div>
      )}

      {!isError && total === 0 && !isLoading && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No ledger rows yet. Each agent decision creates a predicted row when activity is recorded — open{" "}
          <Link href="/ecl/observation" className="text-[hsl(var(--primary))] hover:underline">Observation Plane</Link>
          {" "}to confirm events are flowing.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="primary"
          icon={<BookCheck className="h-4 w-4" />}
          label="LEDGER ROWS"
          value={num(total, 0)}
          sub="HMAC-chained five-structure rows"
          footer={
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span><span className="font-semibold text-foreground tabular-nums">{closed}</span> closed</span>
              <span><span className="font-semibold text-foreground tabular-nums">{open}</span> open</span>
            </div>
          }
        />
        <KpiCard
          tone="amber"
          icon={<Target className="h-4 w-4" />}
          label="OPEN ROWS"
          value={num(open, 0)}
          sub={`${num(openPct, 0)}% awaiting actual results`}
          trend={
            open > 0 ? (
              <span className="text-[11px] font-semibold text-[hsl(38_90%_38%)] tabular-nums">pending</span>
            ) : undefined
          }
        />
        <KpiCard
          tone="green"
          icon={<GitMerge className="h-4 w-4" />}
          label="CO-SIGNED CLOSED"
          value={num(cosigned, 0)}
          sub={`${num(cosignRate, 0)}% of closed rows dual-signed`}
          footer={
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{closed}</span> closed total
            </div>
          }
        />
        <KpiCard
          tone="orange"
          icon={<Repeat className="h-4 w-4" />}
          label="CORRECTION RATE"
          value={`${num(correctionPct, 1)}%`}
          sub={`${correctionCount} DIR patches written back`}
          trend={
            highVariance > 0 ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(0_72%_44%)]">
                <AlertTriangle className="h-3 w-3" />
                {highVariance} high σ
              </span>
            ) : undefined
          }
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4 sm:gap-5 items-start min-w-0">
        <SectionCard
          className="min-w-0"
          kicker="Ledger"
          title="Five-structure rows"
          padding={false}
          action={
            <div className="aeos-content-segment" role="tablist" aria-label="Row status filter">
              {(["all", "open", "closed"] as const).map(f => (
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
                  {f}
                </button>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[36rem] xl:min-w-0">
            <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th>Decision</Th><Th>Agent</Th><Th>Status</Th>
                <Th>Pred Cost</Th><Th>Actual</Th>
                <Th>σ Var</Th><Th>Attribution</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-sm">Loading ledger rows…</td></tr>
              )}
              {!isLoading && paged.map(r => (
                <tr
                  key={r.decisionId}
                  className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 ${activeId === r.decisionId ? "bg-primary/5" : ""}`}
                  onClick={() => selectRow(r)}
                  data-testid={`row-${r.decisionId}`}
                >
                  <Td mono className="text-xs">{r.decisionId.slice(0, 16)}…</Td>
                  <Td mono className="text-xs">{r.agentId}</Td>
                  <Td>
                    <Pill tone={r.status === "closed" ? "green" : r.status === "open" ? "amber" : "red"}>
                      {r.status}
                    </Pill>
                  </Td>
                  <Td>{usd(r.predictedCostUsd)}</Td>
                  <Td>{r.actualCostUsd != null ? usd(r.actualCostUsd) : "—"}</Td>
                  <Td className={r.techVarianceSigma != null && Math.abs(r.techVarianceSigma) > 2 ? "text-[hsl(0_72%_44%)] font-semibold" : ""}>
                    {r.techVarianceSigma != null ? num(r.techVarianceSigma, 2) + "σ" : "—"}
                  </Td>
                  <Td>
                    {r.attributionBucket
                      ? <Pill tone={ATTR_TONE[r.attributionBucket] ?? "neutral"}>{r.attributionBucket}</Pill>
                      : <span className="text-muted-foreground">—</span>}
                  </Td>
                </tr>
              ))}
              {!isLoading && list.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    {total === 0 ? "No ledger rows yet" : `No ${filter} rows — try another filter.`}
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
            itemLabel="rows"
          />
        </SectionCard>

        <SectionCard
          className="h-fit min-w-0"
          kicker={active ? "Five-structure detail" : "Detail"}
          title={active ? `Row · ${active.decisionId.slice(0, 14)}…` : "Select a row"}>
          {!active ? (
            <p className="text-sm text-muted-foreground">Click any row to inspect the predicted / actual / variance / attribution / correction structure and co-signing state.</p>
          ) : (
            <div className="space-y-4">
              <Block title="1 · Predicted" tone="blue">
                <KV k="Cost"     v={usd(active.predictedCostUsd)} />
                <KV k="Outcome"  v={usd(active.predictedOutcomeUsd, { decimals: 2 })} />
                <KV k="GSTI"     v={active.uefGstiClassification ?? "—"} />
                <KV k="Signed"   v={ago(active.createdAt)} />
              </Block>
              <Block title="2 · Actual" tone={active.status === "closed" ? "green" : "slate"}>
                {active.actualCostUsd == null ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Waiting for actual cost and outcome to be recorded…</div>
                    <button
                      type="button"
                      className="aeos-btn aeos-btn-primary w-full sm:w-auto"
                      onClick={() => reconcile.mutate(active.decisionId)}
                      disabled={reconcile.isPending}
                      data-testid="btn-reconcile"
                    >
                      {reconcile.isPending ? "Recording…" : "Record sample actuals"}
                    </button>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Demo action — fills in sample actual cost and outcome so you can see the full five-structure row.
                    </p>
                  </div>
                ) : (
                  <>
                    <KV k="Cost"      v={usd(active.actualCostUsd)} />
                    <KV k="Outcome"   v={usd(active.actualOutcomeUsd ?? 0, { decimals: 2 })} />
                    <KV k="Co-sign"   v={
                      <Pill tone={active.cosignStatus === "complete" ? "green" : "amber"}>
                        <StatusDot tone={active.cosignStatus === "complete" ? "green" : "amber"} />
                        {active.cosignStatus}
                      </Pill>
                    } />
                  </>
                )}
              </Block>
              <Block title="3 · Variance" tone="amber">
                <KV k="σ tech"     v={active.techVarianceSigma != null ? num(active.techVarianceSigma, 2) + "σ" : "—"} />
                <KV k="Cost Δ"     v={active.econCostDelta != null ? usd(active.econCostDelta) : "—"} />
                <KV k="Win-rate Δ" v={active.econWinRateDelta != null ? num(active.econWinRateDelta * 100, 1) + "%" : "—"} />
              </Block>
              <Block title="4 · Attribution" tone="orange">
                <KV k="Bucket" v={active.attributionBucket ?? "—"} />
                <KV k="Confidence" v={active.attributionConfidence != null ? num(active.attributionConfidence * 100, 0) + "%" : "—"} />
              </Block>
              <Block title="5 · Correction" tone="red">
                <KV k="Type" v={active.correctionType ?? "none"} />
                <KV k="Ref"  v={active.correctionRef ?? "—"} mono />
              </Block>
              <div className="border-t pt-3">
                <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground font-semibold mb-1">HMAC chain</div>
                <code className="block break-all text-[10px] bg-muted px-2 py-1.5 rounded font-mono">{active.rowHash}</code>
                <div className="text-[10px] text-muted-foreground mt-1">prev · {active.prevRowHash?.slice(0, 24) ?? "genesis"}…</div>
              </div>
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
function Td({ children, mono, className }: { children: React.ReactNode; mono?: boolean; className?: string }) {
  return <td className={`px-3 sm:px-5 py-2.5 tabular-nums whitespace-nowrap ${mono ? "font-mono" : ""} ${className ?? ""}`}>{children}</td>;
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
    <div className={`rounded-lg border-l-4 px-3 py-2 min-w-0 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-foreground/70 mb-1">{title}</div>
      <dl className="text-xs space-y-0.5">{children}</dl>
    </div>
  );
}
function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-3 min-w-0">
      <dt className="text-muted-foreground sm:w-24 shrink-0">{k}</dt>
      <dd className={`font-medium tabular-nums min-w-0 break-all ${mono ? "font-mono text-[10px]" : ""}`}>{v}</dd>
    </div>
  );
}
