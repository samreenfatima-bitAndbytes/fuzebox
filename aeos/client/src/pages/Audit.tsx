import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill, StatusDot } from "@/components/Pill";
import { AeosSelect } from "@/components/AeosSelect";
import { TablePagination } from "@/components/TablePagination";
import {
  ShieldCheck, AlertTriangle, Clock, CheckCircle2, Search, Download,
  Activity,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { pct, num } from "@/lib/format";
import { useListSelection } from "@/hooks/use-list-selection";
import { Link } from "wouter";

type GovernanceRow = {
  id: number;
  decisionId: string;
  tenantId: string;
  firedAt: string;
  policyId: string;
  policyOutcome: string;
  rationale: string | null;
  prevTrustTier: string | null;
  newTrustTier: string | null;
  rerouteFromModel: string | null;
  rerouteToModel: string | null;
  subject: string | null;
  actor: string | null;
  relatedRecId: string | null;
};

type UiBucket = "APPROVED" | "OVERRIDDEN" | "ESCALATED";

function parseFiredAt(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function outcomeBucket(outcome: string): UiBucket {
  const o = outcome.toLowerCase();
  if (o === "adopted" || o === "promoted" || o === "allowed") return "APPROVED";
  if (o === "rejected" || o === "demoted" || o === "blocked" || o === "human_gate") {
    return "OVERRIDDEN";
  }
  return "ESCALATED";
}

const ROLLING_WINDOW_MS = 7 * 86400000;

function formatTs(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function interventionOutcomes(outcome: string): boolean {
  const o = outcome.toLowerCase();
  return o === "rejected" || o === "demoted" || o === "blocked" || o === "human_gate";
}

const BUCKET_FILTERS = [
  { value: "all", label: "All outcomes" },
  { value: "APPROVED", label: "Approved-style" },
  { value: "OVERRIDDEN", label: "Intervention-style" },
  { value: "ESCALATED", label: "Escalation-style" },
] as const;

export default function Audit() {
  const [q, setQ] = useState("");
  const [policyFilter, setPolicyFilter] = useState("all");
  const [dec, setDec] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const { data: decisions = [], isLoading, isError } = useQuery<GovernanceRow[]>({
    queryKey: ["/api/governance/decisions"],
  });

  const inLast7d = useMemo(
    () => decisions.filter(g => parseFiredAt(g.firedAt) >= Date.now() - ROLLING_WINDOW_MS),
    [decisions],
  );

  /** KPIs/charts use 7d when populated; otherwise all-time so cards match the decision log. */
  const usingFallbackWindow = inLast7d.length === 0 && decisions.length > 0;
  const analyticsSlice = usingFallbackWindow ? decisions : inLast7d;
  const windowLabel = usingFallbackWindow ? "all time" : "7d";

  const policyIds = useMemo(
    () => Array.from(new Set(decisions.map(d => d.policyId))).sort(),
    [decisions],
  );

  const policyOptions = useMemo(
    () => [
      { value: "all", label: "All policies" },
      ...policyIds.map(pid => ({ value: pid, label: pid })),
    ],
    [policyIds],
  );

  const rows = useMemo(() => {
    return decisions.filter(r => {
      if (policyFilter !== "all" && r.policyId !== policyFilter) return false;
      if (dec !== "all" && outcomeBucket(r.policyOutcome) !== dec) return false;
      if (!q) return true;
      const blob = [
        r.decisionId, r.policyId, r.policyOutcome, r.rationale ?? "",
        r.subject ?? "", r.actor ?? "", r.relatedRecId ?? "",
        r.prevTrustTier ?? "", r.newTrustTier ?? "",
      ].join(" ").toLowerCase();
      return blob.includes(q.toLowerCase());
    });
  }, [decisions, policyFilter, dec, q]);

  const bucketBase = useMemo(() => {
    return decisions.filter(r => {
      if (policyFilter !== "all" && r.policyId !== policyFilter) return false;
      if (!q) return true;
      const blob = [
        r.decisionId, r.policyId, r.policyOutcome, r.rationale ?? "",
        r.subject ?? "", r.actor ?? "", r.relatedRecId ?? "",
        r.prevTrustTier ?? "", r.newTrustTier ?? "",
      ].join(" ").toLowerCase();
      return blob.includes(q.toLowerCase());
    });
  }, [decisions, policyFilter, q]);

  const bucketCounts = useMemo(() => ({
    all: bucketBase.length,
    APPROVED: bucketBase.filter(r => outcomeBucket(r.policyOutcome) === "APPROVED").length,
    OVERRIDDEN: bucketBase.filter(r => outcomeBucket(r.policyOutcome) === "OVERRIDDEN").length,
    ESCALATED: bucketBase.filter(r => outcomeBucket(r.policyOutcome) === "ESCALATED").length,
  }), [bucketBase]);

  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const { selected: active, select: selectRow, id: activeRowId } = useListSelection(
    pagedRows,
    (r) => r.id,
  );

  useEffect(() => {
    setPage(1);
  }, [policyFilter, dec, q]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(rows.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [rows.length, page, pageSize]);

  const { overrideRate, totalInWindow, interventionCount, isoScore, humanDisp } = useMemo(() => {
    const n = analyticsSlice.length;
    if (n === 0) {
      return {
        overrideRate: 0,
        totalInWindow: 0,
        interventionCount: 0,
        isoScore: null as number | null,
        humanDisp: 0,
      };
    }
    const interv = analyticsSlice.filter(g => interventionOutcomes(g.policyOutcome)).length;
    const hard = analyticsSlice.filter(g => {
      const o = g.policyOutcome.toLowerCase();
      return o === "blocked" || o === "human_gate";
    }).length;
    return {
      overrideRate: interv / n,
      totalInWindow: n,
      interventionCount: interv,
      isoScore: 1 - hard / n,
      humanDisp: analyticsSlice.filter(g => g.actor).length,
    };
  }, [analyticsSlice]);

  const trendDays = useMemo(() => {
    if (usingFallbackWindow) {
      const byDay = new Map<string, { decisions: number; overrides: number }>();
      for (const g of decisions) {
        const key = dayKey(parseFiredAt(g.firedAt));
        const cur = byDay.get(key) ?? { decisions: 0, overrides: 0 };
        cur.decisions += 1;
        if (outcomeBucket(g.policyOutcome) === "OVERRIDDEN") cur.overrides += 1;
        byDay.set(key, cur);
      }
      return Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-7)
        .map(([key, v]) => ({
          key,
          label: key.slice(5),
          decisions: v.decisions,
          overrides: v.overrides,
        }));
    }
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const days: { key: string; label: string; decisions: number; overrides: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = dayKey(d.getTime());
      const slice = inLast7d.filter(g => dayKey(parseFiredAt(g.firedAt)) === key);
      days.push({
        key,
        label: labels[d.getDay()]!,
        decisions: slice.length,
        overrides: slice.filter(g => outcomeBucket(g.policyOutcome) === "OVERRIDDEN").length,
      });
    }
    return days;
  }, [decisions, inLast7d, usingFallbackWindow]);

  const maxTrend = Math.max(1, ...trendDays.map(t => t.decisions));

  const reviewerAgg = useMemo(() => {
    type ActorAgg = { overrides: number; n: number; policies: Set<string> };
    const m = new Map<string, ActorAgg>();
    for (const g of analyticsSlice) {
      const name = g.actor?.trim() || "System";
      const cur = m.get(name) ?? { overrides: 0, n: 0, policies: new Set<string>() };
      cur.n += 1;
      cur.policies.add(g.policyId);
      if (outcomeBucket(g.policyOutcome) === "OVERRIDDEN") cur.overrides += 1;
      m.set(name, cur);
    }
    const policiesPreview = (set: Set<string>) => {
      const arr = Array.from(set).sort();
      const head = arr.slice(0, 3).join(", ");
      return arr.length > 3 ? `${head}…` : head;
    };
    return Array.from(m.entries())
      .map(([name, v]) => ({
        name,
        overrides: v.overrides,
        helpful: v.n > 0 ? 1 - v.overrides / v.n : 0,
        processes: policiesPreview(v.policies),
        events: v.n,
      }))
      .sort((a, b) => b.overrides - a.overrides);
  }, [analyticsSlice]);

  const hourChart = useMemo(() => {
    const buckets = Array.from({ length: 18 }, (_, i) => ({ h: String(8 + i).padStart(2, "0"), c: 0 }));
    let dayStart = startOfLocalDay(new Date());
    let dayLabel = "today";

    if (usingFallbackWindow && decisions.length > 0) {
      const latestTs = Math.max(...decisions.map(g => parseFiredAt(g.firedAt)));
      dayStart = startOfLocalDay(new Date(latestTs));
      dayLabel = dayKey(latestTs);
    }

    const dayEnd = dayStart + 86400000;
    const slice = analyticsSlice.filter(g => {
      const t = parseFiredAt(g.firedAt);
      return t >= dayStart && t < dayEnd;
    });

    for (const g of slice) {
      const hr = new Date(parseFiredAt(g.firedAt)).getHours();
      if (hr >= 8 && hr <= 17) buckets[hr - 8]!.c += 1;
    }

    return { buckets, dayLabel, count: slice.length };
  }, [analyticsSlice, decisions, usingFallbackWindow]);

  const maxHour = Math.max(1, ...hourChart.buckets.map(h => h.c));
  const decisionsToday = inLast7d.filter(g => parseFiredAt(g.firedAt) >= startOfLocalDay(new Date())).length;

  const exportCsv = () => {
    const header = ["decisionId", "firedAt", "policyId", "policyOutcome", "subject", "actor", "relatedRecId", "rationale", "prevTrustTier", "newTrustTier"];
    const lines = [header.join(",")];
    for (const r of rows) {
      const esc = (s: string | null | undefined) => `"${(s ?? "").replace(/"/g, '""')}"`;
      lines.push([
        esc(r.decisionId), esc(r.firedAt), esc(r.policyId), esc(r.policyOutcome),
        esc(r.subject), esc(r.actor), esc(r.relatedRecId), esc(r.rationale),
        esc(r.prevTrustTier), esc(r.newTrustTier),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `governance-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const showOverrideWarning = totalInWindow >= 5 && overrideRate > 0.2 && !alertDismissed;
  const interventionTone = overrideRate > 0.2 ? "red" : overrideRate > 0.1 ? "amber" : "green";

  return (
    <Layout
      title="Audit Trail"
      kicker="Governance Layer / Human Oversight"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <Activity className="h-3 w-3" />
            {isLoading ? "Loading…" : `${num(totalInWindow, 0)} events (${windowLabel})`}
          </Pill>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-secondary-on-dark"
            onClick={exportCsv}
            disabled={rows.length === 0}
            data-testid="button-export-audit"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Live decisions from the governance plane: policy outcomes, trust-tier changes, and
          recommendation adopt/reject — aligned with ISO/IEC 42001 Article 14 (human disposition on AI proposals).
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">ISO/IEC 42001 · Article 14</Pill>
          <Pill tone="slate">Governance plane events</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-5">
          Could not load governance decisions. Try refreshing the page or signing in again.
        </div>
      )}

      {usingFallbackWindow && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-5 leading-relaxed">
          No governance events in the last 7 days. KPIs and charts below use{" "}
          <span className="font-semibold text-foreground">all {decisions.length} decisions</span>{" "}
          so they match the log.
        </div>
      )}

      {!isError && !isLoading && decisions.length === 0 && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No governance events yet. Decisions appear when you adopt or reject proposals on{" "}
          <Link href="/ecl/recommendations" className="text-[hsl(var(--primary))] hover:underline">Recommendations</Link>
          {" "}or when trust-tier and policy outcomes are recorded.
        </div>
      )}

      {showOverrideWarning && (
        <div className="aeos-audit-alert flex-wrap">
          <AlertTriangle className="h-5 w-5 text-[hsl(0_72%_44%)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[hsl(0_72%_36%)]">
              Intervention rate {pct(overrideRate, 0)} above 20% threshold (rolling 7 days)
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Counts rejections, demotions, blocks, and human-gate outcomes. Tune prompts, policies, or trust tiers.
            </div>
          </div>
          <button
            type="button"
            className="aeos-btn aeos-btn-secondary shrink-0 w-full sm:w-auto"
            data-testid="button-acknowledge-override"
            onClick={() => setAlertDismissed(true)}
          >
            Acknowledge
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="primary"
          icon={<ShieldCheck className="h-4 w-4" />}
          label={usingFallbackWindow ? "TOTAL DECISIONS" : "TOTAL DECISIONS (7D)"}
          value={isLoading ? "…" : num(totalInWindow, 0)}
          sub={usingFallbackWindow ? "All time · none in last 7 days" : "Governance plane events"}
          footer={
            !usingFallbackWindow ? (
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{decisions.length}</span> all time
              </div>
            ) : undefined
          }
        />
        <KpiCard
          tone={overrideRate > 0.2 ? "red" : "green"}
          icon={<AlertTriangle className="h-4 w-4" />}
          label="INTERVENTION RATE"
          value={totalInWindow === 0 ? "—" : pct(overrideRate, 0)}
          sub={usingFallbackWindow ? "Target ≤ 20% · all time" : "Target ≤ 20% · rolling 7 days"}
          trend={
            totalInWindow > 0 ? (
              <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                {interventionCount} events
              </span>
            ) : undefined
          }
        />
        <KpiCard
          tone="slate"
          icon={<Clock className="h-4 w-4" />}
          label="HUMAN DISPOSITIONS"
          value={isLoading ? "…" : num(humanDisp, 0)}
          sub={usingFallbackWindow ? "Named actors · all time" : "Rows with named actor"}
          footer={
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{decisionsToday}</span> today
            </div>
          }
        />
        <KpiCard
          tone="amber"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="ISO 42001 SIGNAL"
          value={isoScore == null ? "—" : pct(isoScore, 0)}
          sub={usingFallbackWindow ? "1 − (blocked + human_gate) / all" : "1 − (blocked + human_gate) / 7d"}
        />
      </div>

      {!isLoading && totalInWindow > 0 && (
        <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
              {usingFallbackWindow ? "All-time governance" : "Rolling 7-day governance"}
            </div>
            <div className="text-sm font-semibold text-foreground mt-1 break-words">
              {num(totalInWindow, 0)} decisions · {num(interventionCount, 0)} interventions · {num(humanDisp, 0)} human dispositions
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              ISO signal {isoScore == null ? "—" : pct(isoScore, 0)} · {decisionsToday} today · {decisions.length} all time
            </div>
          </div>
          <Pill tone={interventionTone}>
            <StatusDot tone={interventionTone} />
            Intervention {totalInWindow === 0 ? "—" : pct(overrideRate, 0)}
          </Pill>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5 mb-6 items-start min-w-0">
        <SectionCard
          className="min-w-0"
          kicker={usingFallbackWindow ? "All time" : "Last 7 days"}
          title="Decisions vs overrides"
        >
          {totalInWindow === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
              No governance events in the last 7 days.
            </div>
          ) : (
            <>
              <div className="flex items-end gap-1 sm:gap-3 h-40 sm:h-48 px-1 sm:px-2 overflow-x-auto">
                {trendDays.map((d, i) => (
                  <div key={i} className="flex-1 min-w-[2rem] flex flex-col items-center gap-1">
                    <div className="relative w-full flex items-end justify-center" style={{ height: 128 }}>
                      <div
                        className="w-4 sm:w-7 aeos-audit-bar bg-[hsl(213_84%_56%)]"
                        style={{ height: `${(d.decisions / maxTrend) * 100}%` }}
                        title={`${d.decisions} decisions`}
                      />
                      <div
                        className="absolute bottom-0 w-3 aeos-audit-bar bg-[hsl(0_72%_52%)] -translate-x-5"
                        style={{ height: `${(d.overrides / maxTrend) * 100}%`, left: "50%" }}
                        title={`${d.overrides} overrides`}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground tabular-nums">{d.label}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 aeos-audit-bar bg-[hsl(213_84%_56%)]" /> Decisions</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 aeos-audit-bar bg-[hsl(0_72%_52%)]" /> Overrides</span>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard
          kicker="By policy"
          title={usingFallbackWindow ? "Decision counts (all time)" : "Decision counts (7d)"}
          className="h-fit min-w-0"
        >
          {totalInWindow === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
              Policy mix will appear once events exist.
            </div>
          ) : (
            <ul className="space-y-2 text-sm max-h-48 overflow-y-auto pr-1">
              {Array.from(new Set(analyticsSlice.map(g => g.policyId))).sort().map(pid => {
                const c = analyticsSlice.filter(g => g.policyId === pid).length;
                const w = Math.max(8, (c / analyticsSlice.length) * 100);
                return (
                  <li key={pid} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 truncate font-mono text-xs" title={pid}>{pid}</div>
                    <div className="w-24 h-2 aeos-cognition-contribution-track overflow-hidden shrink-0">
                      <div className="h-full aeos-cognition-contribution-fill bg-[hsl(213_84%_56%)]" style={{ width: `${w}%` }} />
                    </div>
                    <span className="tabular-nums text-xs text-muted-foreground w-8 text-right">{c}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5 mb-6 items-start min-w-0">
        <SectionCard
          className="xl:col-span-2 min-w-0"
          kicker="Actor activity"
          title={usingFallbackWindow ? "Per-actor intervention pattern (all time)" : "Per-actor intervention pattern (7d)"}
          padding={false}
        >
          {reviewerAgg.length === 0 ? (
            <div className="px-3 sm:px-5 py-10 text-center text-sm text-muted-foreground">No rows in the selected window.</div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[32rem] xl:min-w-0">
              <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
                <tr>
                  <Th>Actor</Th>
                  <Th>Coverage</Th>
                  <Th align="right">Interventions</Th>
                  <Th align="right">Non-intervention</Th>
                  <Th align="right">Events</Th>
                </tr>
              </thead>
              <tbody>
                {reviewerAgg.map(r => (
                  <tr key={r.name} className="border-b last:border-0 hover:bg-muted/40">
                    <Td className="font-medium">{r.name}</Td>
                    <Td muted>{r.processes}</Td>
                    <Td align="right" className="font-semibold">{r.overrides}</Td>
                    <Td align="right">
                      <Pill tone={r.helpful >= 0.85 ? "green" : r.helpful >= 0.75 ? "blue" : "amber"}>{pct(r.helpful, 0)}</Pill>
                    </Td>
                    <Td align="right" muted>{r.events}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </SectionCard>

        <SectionCard
          kicker="Local workday"
          title={usingFallbackWindow ? `Decisions by hour (${hourChart.dayLabel})` : "Decisions by hour (today)"}
          className="h-fit min-w-0"
        >
          <div className="flex items-end gap-0.5 sm:gap-1 h-32 sm:h-40 px-0.5 sm:px-1 overflow-x-auto">
            {hourChart.buckets.map((h, i) => (
              <div key={i} className="flex-1 min-w-[1.1rem] flex flex-col items-center justify-end gap-1">
                <div
                  className="w-full aeos-audit-bar bg-[hsl(213_84%_56%)]"
                  style={{ height: `${(h.c / maxHour) * 100}%`, minHeight: h.c ? 2 : 0 }}
                  title={`${h.c} at ${h.h}:00`}
                />
                <div className="text-[9px] text-muted-foreground tabular-nums">{h.h}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/60">
            <span className="font-semibold text-foreground tabular-nums">{hourChart.count}</span>{" "}
            decisions {usingFallbackWindow ? `on ${hourChart.dayLabel}` : "today"} (08–17 local)
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start min-w-0">
        <SectionCard
          className="min-w-0"
          kicker="Decision log"
          title="Governance decisions (newest first)"
          padding={false}
          action={
            <div className="aeos-content-segment" role="tablist" aria-label="Outcome filter">
              {BUCKET_FILTERS.map(f => (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  onClick={() => setDec(f.value)}
                  className="aeos-content-segment-btn"
                  data-active={dec === f.value ? "true" : "false"}
                  aria-selected={dec === f.value}
                  data-testid={`filter-outcome-${f.value}`}
                >
                  {f.label}
                  <span className="ml-1 tabular-nums opacity-70">
                    ({f.value === "all" ? bucketCounts.all : bucketCounts[f.value]})
                  </span>
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
                placeholder="Search policy, outcome, subject, actor…"
                data-testid="input-search-audit"
              />
            </label>
            <AeosSelect
              value={policyFilter}
              onChange={setPolicyFilter}
              options={policyOptions}
              className="w-full sm:w-52"
              menuMinWidth="12rem"
              data-testid="select-process"
            />
            <div className="text-xs text-muted-foreground tabular-nums sm:ml-auto shrink-0">
              {rows.length} of {decisions.length}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[36rem] xl:min-w-0">
              <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
                <tr>
                  <Th>ID / Time</Th>
                  <Th>Policy</Th>
                  <Th>Outcome</Th>
                  <Th>Actor</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">Loading…</td></tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">No decisions match filters.</td></tr>
                )}
                {pagedRows.map(r => {
                  const bucket = outcomeBucket(r.policyOutcome);
                  return (
                    <tr
                      key={r.id}
                      className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                        activeRowId === r.id ? "bg-primary/5" : ""
                      } ${bucket === "APPROVED" ? "border-l-2 border-l-[hsl(142_70%_42%)]" : bucket === "OVERRIDDEN" ? "border-l-2 border-l-[hsl(0_72%_52%)]" : "border-l-2 border-l-[hsl(38_96%_50%)]"}`}
                      onClick={() => selectRow(r)}
                      data-testid={`row-decision-${r.id}`}
                    >
                      <Td mono>
                        <div className="font-mono text-[11px]">{r.decisionId}</div>
                        <div className="text-[10px] text-muted-foreground">{formatTs(r.firedAt)}</div>
                      </Td>
                      <Td>
                        <div className="font-medium text-xs font-mono truncate max-w-[8rem] sm:max-w-[10rem] xl:max-w-[160px]" title={r.policyId}>{r.policyId}</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[8rem] sm:max-w-[10rem] xl:max-w-[160px]">{r.subject ?? "—"}</div>
                      </Td>
                      <Td>
                        <Pill tone={bucket === "APPROVED" ? "green" : bucket === "OVERRIDDEN" ? "red" : "amber"}>
                          {r.policyOutcome}
                        </Pill>
                      </Td>
                      <Td>{r.actor ?? "System"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            total={rows.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            itemLabel="decisions"
          />
        </SectionCard>

        <SectionCard
          className="h-fit min-w-0"
          kicker="Decision detail"
          title={active ? active.decisionId : "Select a decision"}
        >
          {!active ? (
            <p className="text-sm text-muted-foreground">
              Click any row to inspect policy outcome, rationale, trust-tier changes, and related recommendation.
            </p>
          ) : (
            <DecisionDetail row={active} />
          )}
        </SectionCard>
      </div>
    </Layout>
  );
}

function DecisionDetail({ row }: { row: GovernanceRow }) {
  const bucket = outcomeBucket(row.policyOutcome);
  const tone = bucket === "APPROVED" ? "green" : bucket === "OVERRIDDEN" ? "red" : "amber";

  return (
    <div className="space-y-4">
      <div className={`rounded-none border-l-4 px-3 py-2 ${
        tone === "green" ? "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
          : tone === "red" ? "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]"
            : "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <div>
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">Outcome</div>
            <div className="text-sm font-semibold mt-0.5">{row.policyOutcome}</div>
          </div>
          <Pill tone={tone}>
            <StatusDot tone={tone} />
            {bucket}
          </Pill>
        </div>
      </div>

      <div className="space-y-0 text-sm">
        <DetailRow k="Fired at" v={formatTs(row.firedAt)} />
        <DetailRow k="Policy" v={<span className="font-mono text-xs">{row.policyId}</span>} />
        <DetailRow k="Subject" v={row.subject ?? "—"} />
        <DetailRow k="Actor" v={row.actor ?? "System"} />
        {row.relatedRecId && (
          <DetailRow
            k="Related rec"
            v={
              <Link href="/ecl/recommendations" className="text-[hsl(var(--primary))] hover:underline font-mono text-xs">
                {row.relatedRecId}
              </Link>
            }
          />
        )}
      </div>

      {(row.prevTrustTier || row.newTrustTier) && (
        <div className="rounded-none border border-border/60 bg-muted/30 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-1">Trust tier</div>
          <div className="font-mono text-xs">
            {row.prevTrustTier ?? "—"} → {row.newTrustTier ?? "—"}
          </div>
        </div>
      )}

      {(row.rerouteFromModel || row.rerouteToModel) && (
        <div className="rounded-none border border-border/60 bg-muted/30 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-1">Model reroute</div>
          <div className="font-mono text-xs">
            {row.rerouteFromModel ?? "—"} → {row.rerouteToModel ?? "—"}
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-1.5">Rationale</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{row.rationale ?? "No rationale recorded."}</p>
      </div>
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
    <th className={`px-3 sm:px-5 py-2.5 font-semibold whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({ children, mono, muted, align, className }: {
  children: React.ReactNode;
  mono?: boolean;
  muted?: boolean;
  align?: "right";
  className?: string;
}) {
  return (
    <td className={`px-3 sm:px-5 py-2.5 align-top tabular-nums ${align === "right" ? "text-right" : ""} ${mono ? "font-mono" : ""} ${muted ? "text-muted-foreground" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}
