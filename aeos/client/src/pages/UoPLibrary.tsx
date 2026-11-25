import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { TablePagination } from "@/components/TablePagination";
import { useToast } from "@/hooks/use-toast";
import { usd, num, pct, ago } from "@/lib/format";
import {
  BookCheck, Repeat, Coins, Sparkles, Brain, Search, TrendingUp, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useListSelection } from "@/hooks/use-list-selection";

type UoP = {
  id: number; uopId: string; tenantId: string; name: string;
  workflowId?: string; agentId?: string;
  publishedAt: string; publishedBy?: string;
  classification: string; description?: string;
  laborValueSavedUsd: number; amortizedCostUsd: number;
  ropValue: number; cuow: number; mer: number;
  huopShare: number; auopShare: number; synergyShare: number;
  trustTier: string; signature: string; status: string; reuseCount: number;
};

type ClassFilter = "all" | "AI-Primary" | "Hybrid" | "AI-Assisted" | "Human-Only";

const TRUST_LABEL: Record<string, string> = {
  T0_unverified: "T0 · Unverified",
  T1_observed: "T1 · Observed",
  T2_supervised: "T2 · Supervised",
  T3_trusted: "T3 · Trusted",
  T3_autonomous: "T3 · Trusted",
  T4_autonomous: "T4 · Autonomous",
};

const TRUST_TONE: Record<string, "slate" | "blue" | "amber" | "green"> = {
  T0_unverified: "slate",
  T1_observed: "blue",
  T2_supervised: "amber",
  T3_trusted: "green",
  T3_autonomous: "green",
  T4_autonomous: "green",
};

const CLASS_TONE: Record<string, "blue" | "green" | "amber" | "slate"> = {
  "AI-Primary": "blue",
  "Hybrid": "amber",
  "AI-Assisted": "green",
  "Human-Only": "slate",
};

const CLASS_FILTERS: { id: ClassFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "AI-Primary", label: "AI-Primary" },
  { id: "Hybrid", label: "Hybrid" },
  { id: "AI-Assisted", label: "AI-Assisted" },
  { id: "Human-Only", label: "Human-Only" },
];

export default function UoPLibrary() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: items, isLoading, isError } = useQuery<UoP[]>({ queryKey: ["/api/uop/library"] });

  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailFlash, setDetailFlash] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const reuse = useMutation({
    mutationFn: (uopId: string) => apiRequest("POST", `/api/uop/${uopId}/reuse`),
    onSuccess: (_data, uopId) => {
      void qc.invalidateQueries({ queryKey: ["/api/uop/library"] });
      toast({ title: "Reuse recorded", description: "This unit's reuse count was updated." });
    },
    onError: (e: unknown) => {
      toast({
        title: "Could not record reuse",
        description: e instanceof Error ? e.message : "Something went wrong.",
        variant: "destructive",
      });
    },
  });

  const all = items ?? [];
  const totalSaved = all.reduce((s, u) => s + u.laborValueSavedUsd, 0);
  const totalCost = all.reduce((s, u) => s + u.amortizedCostUsd, 0);
  const netTotal = totalSaved - totalCost;
  const totalReuse = all.reduce((s, u) => s + u.reuseCount, 0);
  const avgRoP = all.length ? all.reduce((s, u) => s + u.ropValue, 0) / all.length : 0;
  const topRoP = all.length ? [...all].sort((a, b) => b.ropValue - a.ropValue)[0] : null;

  const classCounts = useMemo(() => {
    const counts: Record<string, number> = { "AI-Primary": 0, Hybrid: 0, "AI-Assisted": 0, "Human-Only": 0 };
    for (const u of all) counts[u.classification] = (counts[u.classification] ?? 0) + 1;
    return counts;
  }, [all]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter(u => classFilter === "all" || u.classification === classFilter)
      .filter(u => {
        if (!needle) return true;
        return (
          u.name.toLowerCase().includes(needle)
          || u.uopId.toLowerCase().includes(needle)
          || (u.agentId?.toLowerCase().includes(needle) ?? false)
          || (u.workflowId?.toLowerCase().includes(needle) ?? false)
          || (u.description?.toLowerCase().includes(needle) ?? false)
        );
      })
      .sort((a, b) => b.ropValue - a.ropValue);
  }, [all, classFilter, q]);

  const paged = list.slice((page - 1) * pageSize, page * pageSize);

  const { selected: active, select: selectUop, id: activeUopId } = useListSelection(
    paged,
    (u) => u.uopId,
  );

  useEffect(() => {
    setPage(1);
  }, [classFilter, q]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(list.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [list.length, page, pageSize]);

  const inspectUop = useCallback((uop: UoP) => {
    const sorted = [...all].sort((a, b) => b.ropValue - a.ropValue);
    const idx = sorted.findIndex(u => u.uopId === uop.uopId);
    setClassFilter("all");
    setQ("");
    if (idx >= 0) setPage(Math.floor(idx / pageSize) + 1);
    selectUop(uop);
    window.setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setDetailFlash(true);
      window.setTimeout(() => setDetailFlash(false), 1400);
    }, 50);
  }, [all, pageSize, selectUop]);

  return (
    <Layout
      title="UoP Library"
      kicker="Economic Cognition / UoP Library"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <BookCheck className="h-3 w-3" />
            {isLoading ? "Loading…" : isError ? "Unavailable" : all.length > 0 ? `${all.length} published` : "Empty"}
          </Pill>
          <Link
            href="/ecl/cognition"
            className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark"
            data-testid="link-publish-uop"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Save from Cognition Plane
          </Link>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Catalogue of measured Units of Production. Each entry is signed with the FuzeBox KMS root,
          composes into higher-order workflows, and increments its reuse counter every time it is
          invoked downstream — feeding back into the master TUoP equation.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">Patent Family 5 · TUoP equation</Pill>
          <Pill tone="slate">KMS-signed · Reusable primitives</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load the UoP catalogue. Try refreshing the page or signing in again.
        </div>
      )}

      {!isError && !isLoading && all.length === 0 && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No saved units yet. Open{" "}
          <Link href="/ecl/cognition" className="text-[hsl(var(--primary))] hover:underline">Cognition Plane</Link>
          , click <span className="font-medium text-foreground">Refresh</span> in the top bar if needed, then{" "}
          <span className="font-medium text-foreground">Save snapshot</span> to add your first entry here.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="primary"
          icon={<BookCheck className="h-4 w-4" />}
          label="PUBLISHED UoPs"
          value={num(all.length, 0)}
          sub="Signed and chained"
          footer={
            all.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span><span className="font-semibold text-foreground tabular-nums">{classCounts["AI-Primary"]}</span> AI-Primary</span>
                <span><span className="font-semibold text-foreground tabular-nums">{classCounts.Hybrid}</span> Hybrid</span>
                <span><span className="font-semibold text-foreground tabular-nums">{classCounts["AI-Assisted"]}</span> AI-Assisted</span>
              </div>
            ) : undefined
          }
        />
        <KpiCard
          tone="green"
          icon={<Coins className="h-4 w-4" />}
          label="VALUE CAPTURED"
          value={usd(totalSaved)}
          sub={`Net ${usd(netTotal)} after spend`}
          footer={
            <div className="text-xs text-muted-foreground">
              Total spend <span className="font-semibold text-foreground tabular-nums">{usd(totalCost)}</span>
            </div>
          }
        />
        <KpiCard
          tone="orange"
          icon={<TrendingUp className="h-4 w-4" />}
          label="AVG RoP"
          value={`${num(avgRoP, 2)}×`}
          sub="Return on production across fleet"
          trend={
            topRoP ? (
              <span className="text-[11px] font-semibold text-[hsl(142_70%_30%)] tabular-nums">
                peak {num(topRoP.ropValue, 2)}×
              </span>
            ) : undefined
          }
        />
        <KpiCard
          tone="amber"
          icon={<Repeat className="h-4 w-4" />}
          label="LIFETIME REUSES"
          value={num(totalReuse, 0)}
          sub="Across the tenant fleet"
          footer={
            all.length > 0 ? (
              <div className="text-xs text-muted-foreground">
                Avg <span className="font-semibold text-foreground tabular-nums">{num(totalReuse / all.length, 1)}</span> per UoP
              </div>
            ) : undefined
          }
        />
      </div>

      {topRoP && (
        <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-none bg-[hsl(213_100%_94%)] text-[hsl(213_84%_42%)]">
              <Brain className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
                Top performer
              </div>
              <div className="text-sm font-semibold text-foreground mt-1 break-words">
                <span className="truncate block sm:inline">{topRoP.name}</span>
                <span className="sm:ml-2 text-[hsl(142_70%_30%)] tabular-nums whitespace-nowrap">{num(topRoP.ropValue, 2)}× RoP</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 break-words">
                {usd(topRoP.laborValueSavedUsd)} saved · {num(topRoP.reuseCount, 0)} reuses · {TRUST_LABEL[topRoP.trustTier] ?? topRoP.trustTier}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="aeos-btn aeos-btn-primary shrink-0 w-full sm:w-auto"
            onClick={() => inspectUop(topRoP)}
          >
            View details
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start min-w-0">
        <SectionCard
          className="min-w-0"
          kicker="Catalogue"
          title="Published Units of Production"
          padding={false}
          action={
            <div className="aeos-content-segment" role="tablist" aria-label="Classification filter">
              {CLASS_FILTERS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  onClick={() => setClassFilter(f.id)}
                  className="aeos-content-segment-btn"
                  data-active={classFilter === f.id ? "true" : "false"}
                  aria-selected={classFilter === f.id}
                  data-testid={`filter-${f.id}`}
                >
                  {f.label}
                  {f.id !== "all" && (
                    <span className="ml-1 tabular-nums opacity-70">({classCounts[f.id] ?? 0})</span>
                  )}
                  {f.id === "all" && (
                    <span className="ml-1 tabular-nums opacity-70">({all.length})</span>
                  )}
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
                placeholder="Search name, ID, agent, workflow…"
                data-testid="input-search-uop"
              />
            </label>
            <div className="text-xs text-muted-foreground tabular-nums sm:ml-auto shrink-0">
              {list.length} of {all.length}
            </div>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[40rem] xl:min-w-0">
            <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th>UoP</Th>
                <Th>Class</Th>
                <Th>RoP</Th>
                <Th>Saved</Th>
                <Th>Reuses</Th>
                <Th>Trust</Th>
                <Th>Age</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    Loading UoP catalogue…
                  </td>
                </tr>
              )}
              {!isLoading && paged.map(u => (
                <tr
                  key={u.uopId}
                  className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                    activeUopId === u.uopId ? "bg-primary/5" : ""
                  }`}
                  onClick={() => selectUop(u)}
                  data-testid={`row-${u.uopId}`}
                >
                  <Td>
                    <div className="min-w-0">
                      <div className="font-medium text-foreground truncate max-w-[10rem] sm:max-w-[14rem] xl:max-w-none" title={u.name} data-testid={`uop-name-${u.uopId}`}>
                        {u.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[10rem] sm:max-w-[14rem] xl:max-w-none" title={u.uopId}>{u.uopId}</div>
                    </div>
                  </Td>
                  <Td>
                    <Pill tone={CLASS_TONE[u.classification] ?? "neutral"}>{u.classification}</Pill>
                  </Td>
                  <Td className="font-semibold text-primary tabular-nums">{num(u.ropValue, 2)}×</Td>
                  <Td className="font-semibold text-[hsl(142_70%_30%)] tabular-nums">{usd(u.laborValueSavedUsd)}</Td>
                  <Td className="tabular-nums">{num(u.reuseCount, 0)}</Td>
                  <Td>
                    <Pill tone={TRUST_TONE[u.trustTier] ?? "slate"}>
                      {TRUST_LABEL[u.trustTier]?.split(" · ")[0] ?? u.trustTier}
                    </Pill>
                  </Td>
                  <Td className="text-muted-foreground text-xs whitespace-nowrap">{ago(u.publishedAt)}</Td>
                </tr>
              ))}
              {!isLoading && list.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    {all.length === 0 ? (
                      <>No saved units yet — use <span className="font-medium text-foreground">Save snapshot</span> on Cognition Plane.</>
                    ) : (
                      "No UoPs match this filter."
                    )}
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
            itemLabel="UoPs"
          />
        </SectionCard>

        <div ref={detailRef} id="uop-detail-panel" className="scroll-mt-6 min-w-0">
          <SectionCard
            className={cn("h-fit min-w-0 transition-shadow duration-300", detailFlash && "aeos-detail-flash")}
            kicker={active ? "UoP detail" : "Detail"}
            title={active ? active.name : "Select a UoP"}
          >
          {!active ? (
            <p className="text-sm text-muted-foreground">
              Click any row to inspect measured economics, H/A/S composition, KMS signature, and reuse history.
            </p>
          ) : (
            <div className="space-y-4">
              <Block title="Overview" tone={CLASS_TONE[active.classification] === "blue" ? "blue" : CLASS_TONE[active.classification] === "amber" ? "amber" : CLASS_TONE[active.classification] === "green" ? "green" : "slate"}>
                {active.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">{active.description}</p>
                )}
                <KV k="Classification" v={<Pill tone={CLASS_TONE[active.classification] ?? "neutral"}>{active.classification}</Pill>} />
                <KV k="Trust tier" v={<Pill tone={TRUST_TONE[active.trustTier] ?? "slate"}>{TRUST_LABEL[active.trustTier] ?? active.trustTier}</Pill>} />
                <KV k="Status" v={active.status} />
              </Block>

              <Block title="Economics" tone="orange">
                <KV k="RoP" v={<span className="text-primary font-bold tabular-nums">{num(active.ropValue, 2)}×</span>} />
                <KV k="Labor saved" v={<span className="text-[hsl(142_70%_30%)] font-semibold tabular-nums">{usd(active.laborValueSavedUsd)}</span>} />
                <KV k="Amortized spend" v={<span className="tabular-nums">{usd(active.amortizedCostUsd)}</span>} />
                <KV k="Net" v={
                  <span className={`font-semibold tabular-nums ${active.laborValueSavedUsd - active.amortizedCostUsd >= 0 ? "text-[hsl(142_70%_30%)]" : "text-[hsl(0_72%_44%)]"}`}>
                    {usd(active.laborValueSavedUsd - active.amortizedCostUsd)}
                  </span>
                } />
                <KV k="MER" v={<span className="tabular-nums">{num(active.mer, 2)}</span>} />
                <KV k="CUoW" v={<span className="tabular-nums">{usd(active.cuow)}</span>} />
              </Block>

              <Block title="Composition" tone="blue">
                <HasBar huop={active.huopShare} auop={active.auopShare} synergy={active.synergyShare} />
              </Block>

              <Block title="Provenance" tone="slate">
                <KV k="UoP ID" v={active.uopId} mono />
                {active.agentId && <KV k="Agent" v={active.agentId} mono />}
                {active.workflowId && <KV k="Workflow" v={active.workflowId} mono />}
                <KV k="Published" v={`${ago(active.publishedAt)} · ${active.publishedBy ?? "system"}`} />
                <KV k="Reuses" v={num(active.reuseCount, 0)} />
                <div className="mt-2 pt-2 border-t border-border/60">
                  <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground font-semibold mb-1">KMS signature</div>
                  <code className="block break-all text-[10px] bg-muted px-2 py-1.5 rounded-none font-mono">{active.signature}</code>
                </div>
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/60">
                  <button
                    type="button"
                    className="aeos-btn aeos-btn-primary w-full"
                    onClick={() => reuse.mutate(active.uopId)}
                    disabled={reuse.isPending}
                    data-testid={`btn-reuse-${active.uopId}`}
                  >
                    <Repeat className="h-3.5 w-3.5" />
                    {reuse.isPending ? "Recording…" : "Reuse UoP"}
                  </button>
                </div>
              </Block>
            </div>
          )}
          </SectionCard>
        </div>
      </div>
    </Layout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 sm:px-5 py-2.5 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 sm:px-5 py-2.5 whitespace-nowrap ${className ?? ""}`}>{children}</td>;
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

function HasBar({ huop, auop, synergy }: { huop: number; auop: number; synergy: number }) {
  const total = huop + auop;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] uppercase tracking-[.16em] text-muted-foreground font-semibold mb-1.5">
        <span>H / A / S share</span>
        <span className="font-mono normal-case tracking-normal tabular-nums shrink-0">S = {num(synergy, 3)}</span>
      </div>
      <div className="aeos-cognition-contribution-track flex min-w-0">
        <div
          title={`HUoP ${pct(huop, 0)}`}
          className="aeos-cognition-contribution-fill bg-[hsl(220_15%_45%)]"
          style={{ width: `${huop * 100}%` }}
        />
        <div
          title={`AUoP ${pct(auop, 0)}`}
          className="aeos-cognition-contribution-fill bg-[hsl(213_84%_56%)]"
          style={{ width: `${auop * 100}%` }}
        />
        {synergy > 0 && (
          <div
            title={`Synergy ${num(synergy, 2)}`}
            className="aeos-cognition-contribution-fill bg-[hsl(25_95%_55%)]"
            style={{ width: `${Math.min(synergy, 0.34) * 100 * 0.6}%` }}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-muted-foreground mt-1.5">
        <span className="tabular-nums">H · {pct(huop, 0)}</span>
        <span className="tabular-nums">A · {pct(auop, 0)}</span>
        <span className="tabular-nums">S · {num(synergy, 2)}</span>
      </div>
      {total > 0 && (
        <div className="text-[10px] text-muted-foreground mt-1">
          AI share of H+A: <span className="font-semibold text-foreground tabular-nums">{pct(auop / total, 0)}</span>
        </div>
      )}
    </div>
  );
}
