import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot, SigmaBadge } from "@/components/Pill";
import { TablePagination } from "@/components/TablePagination";
import { useAgents, type EnrichedAgent } from "@/hooks/use-agents";
import { useListSelection } from "@/hooks/use-list-selection";
import { ago, num, pct, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Network, ShieldCheck, AlertTriangle, Award, Search, ArrowRight,
} from "lucide-react";

const TRUST_LADDER = [
  { tier: "T0_unverified", label: "T0 · Unverified", desc: "New or unproven — observe only, no autonomy." },
  { tier: "T1_observed", label: "T1 · Observed", desc: "Telemetry captured; still needs human review." },
  { tier: "T2_supervised", label: "T2 · Supervised", desc: "Can act with human approval on each decision." },
  { tier: "T3_trusted", label: "T3 · Trusted", desc: "Autonomous within budget and policy limits." },
  { tier: "T4_autonomous", label: "T4 · Autonomous", desc: "Full delegated envelope — highest trust." },
];

const TRUST_LABEL: Record<string, string> = {
  T0_unverified: "T0 · Unverified",
  T1_observed: "T1 · Observed",
  T2_supervised: "T2 · Supervised",
  T3_trusted: "T3 · Trusted",
  T4_autonomous: "T4 · Autonomous",
};

const TRUST_TONE: Record<string, "slate" | "blue" | "amber" | "green"> = {
  T0_unverified: "slate",
  T1_observed: "blue",
  T2_supervised: "amber",
  T3_trusted: "green",
  T4_autonomous: "green",
};

function statusTone(s?: string | null): "green" | "amber" | "red" {
  if (s === "amber") return "amber";
  if (s === "red") return "red";
  return "green";
}

function statusLabel(s?: string | null): string {
  const tone = statusTone(s);
  if (tone === "red") return "Needs attention";
  if (tone === "amber") return "Watch";
  return "Healthy";
}

export default function AgentRoster() {
  const { data: agents, isLoading, isError } = useAgents();
  const list = agents ?? [];
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const green = list.filter(a => statusTone(a.status) === "green").length;
  const amber = list.filter(a => statusTone(a.status) === "amber").length;
  const red = list.filter(a => statusTone(a.status) === "red").length;
  const byTier = (t: string) => list.filter(a => (a.trustTier ?? "T0_unverified") === t).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(a => {
      const blob = [a.name, a.agentId, a.model, a.hyperscaler, a.vendor, a.trustTier].join(" ").toLowerCase();
      return blob.includes(needle);
    });
  }, [list, q]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const { selected: active, select: selectAgent, id: activeId } = useListSelection(
    filtered,
    (a) => a.agentId,
  );

  useEffect(() => setPage(1), [q, pageSize]);

  return (
    <Layout
      title="Agent Registry"
      kicker="Agents / Registry"
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Read-only view of agents registered in your deployment workspace. When you create or update
          an agent there, it syncs here automatically with trust tier, quality level, and health status.
        </p>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load agents. Try refreshing the page or signing in again.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KpiCard tone="primary" icon={<Network className="h-4 w-4" />}
          label="REGISTERED AGENTS" value={isLoading ? "…" : String(list.length)}
          sub={isLoading ? "Loading…" : `${green} healthy · ${amber} watch · ${red} attention`} />
        <KpiCard tone="green" icon={<Award className="h-4 w-4" />}
          label="TRUSTED (T3+)" value={isLoading ? "…" : String(byTier("T3_trusted") + byTier("T4_autonomous"))}
          sub="cleared for autonomous run" />
        <KpiCard tone="amber" icon={<ShieldCheck className="h-4 w-4" />}
          label="SUPERVISED (T2)" value={isLoading ? "…" : String(byTier("T2_supervised"))}
          sub="human-gated decisions" />
        <KpiCard tone="red" icon={<AlertTriangle className="h-4 w-4" />}
          label="OBSERVED (T0/T1)" value={isLoading ? "…" : String(byTier("T0_unverified") + byTier("T1_observed"))}
          sub="not yet promoted" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start mb-6 min-w-0">
        <SectionCard
          kicker="Registry"
          title="All registered agents"
          padding={false}
          className="min-w-0"
        >
          <div className="px-3 sm:px-5 py-3 border-b flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 min-w-0">
            <label className="aeos-filter-search flex-1 min-w-0 w-full sm:min-w-[200px] sm:max-w-sm">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search by name, model, or ID…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search agents"
              />
            </label>
            <span className="text-xs text-muted-foreground tabular-nums sm:ml-auto shrink-0">
              {isLoading ? "Loading…" : `${filtered.length} of ${list.length}`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
                <tr>
                  <Th>Agent</Th>
                  <Th>Vendor / Model</Th>
                  <Th>Trust tier</Th>
                  <Th>Quality</Th>
                  <Th>Runs</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={6} className="px-3 sm:px-5 py-10 text-center text-muted-foreground">
                      Loading agents…
                    </td>
                  </tr>
                )}
                {!isLoading && pageItems.map(a => (
                  <AgentRow
                    key={a.agentId}
                    agent={a}
                    selected={activeId === a.agentId}
                    onSelect={() => selectAgent(a)}
                  />
                ))}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 sm:px-5 py-10 text-center text-muted-foreground">
                      {list.length === 0
                        ? "No agents in registry yet. Create agents in your deployment workspace and they will appear here."
                        : "No agents match your search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {!isLoading && filtered.length > 0 && (
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              itemLabel="agents"
            />
          )}
        </SectionCard>

        <SectionCard
          className="h-fit min-w-0"
          kicker="Agent detail"
          title={active?.name ?? "Select an agent"}
        >
          {!active ? (
            <p className="text-sm text-muted-foreground">
              Click any row to see trust tier, quality metrics, and run history.
            </p>
          ) : (
            <AgentDetail agent={active} />
          )}
        </SectionCard>
      </div>

      <SectionCard kicker="Trust governance" title="Trust tier ladder" className="min-w-0">
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Agents start at T0 and are promoted when quality, coverage, and oversight gates pass.
          Demotions happen automatically on sustained quality regression.
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {TRUST_LADDER.map(t => {
            const count = byTier(t.tier);
            return (
              <li key={t.tier} className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={TRUST_TONE[t.tier] ?? "slate"}>{t.label}</Pill>
                  <span className="text-[11px] text-muted-foreground">
                    {isLoading ? "…" : `${count} agent${count === 1 ? "" : "s"}`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.desc}</p>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 pt-4 border-t border-border">
          <Link href="/governance/audit" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
            View trust changes in audit trail
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </SectionCard>
    </Layout>
  );
}

function AgentRow({
  agent: a,
  selected,
  onSelect,
}: {
  agent: EnrichedAgent;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = statusTone(a.status);
  const tier = a.trustTier ?? "T0_unverified";
  const hasSigma = a.sigma != null && a.sigma > 0;

  return (
    <tr
      className={cn(
        "border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors",
        selected && "bg-primary/5",
      )}
      onClick={onSelect}
      data-testid={`row-agent-${a.agentId}`}
    >
      <Td>
        <div className="font-medium max-w-[14rem] truncate">{a.name}</div>
        <div className="font-mono text-[11px] text-muted-foreground truncate max-w-[14rem]">{a.agentId}</div>
      </Td>
      <Td>
        <div className="text-xs"><Pill tone="slate">{a.hyperscaler ?? "—"}</Pill></div>
        <div className="text-xs text-muted-foreground mt-0.5 font-mono truncate max-w-[10rem]">{a.model ?? "—"}</div>
      </Td>
      <Td>
        <Pill tone={TRUST_TONE[tier] ?? "slate"}>{TRUST_LABEL[tier] ?? tier.replace(/_/g, " · ")}</Pill>
      </Td>
      <Td>
        {hasSigma ? (
          <SigmaBadge value={a.sigma} />
        ) : (
          <span className="text-xs text-muted-foreground">No data</span>
        )}
        {a.success > 0 && (
          <div className="text-[10px] text-muted-foreground mt-0.5">{pct(a.success)} pass rate</div>
        )}
      </Td>
      <Td>
        <span className="tabular-nums">{num(a.runs, 0)}</span>
      </Td>
      <Td>
        <Pill tone={tone}>
          <StatusDot tone={tone} />
          {statusLabel(a.status)}
        </Pill>
      </Td>
    </tr>
  );
}

function AgentDetail({ agent: a }: { agent: EnrichedAgent }) {
  const tone = statusTone(a.status);
  const tier = a.trustTier ?? "T0_unverified";
  const hasSigma = a.sigma != null && a.sigma > 0;
  const hasRuns = a.runs > 0;

  return (
    <div className="space-y-4">
      <div className={cn(
        "rounded-none border-l-4 px-3 py-2",
        tone === "green"
          ? "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
          : tone === "amber"
            ? "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]"
            : "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]",
      )}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">Health</div>
            <div className="text-sm font-semibold mt-0.5 break-words">{statusLabel(a.status)}</div>
          </div>
          <Pill tone={tone} className="shrink-0">
            <StatusDot tone={tone} />
            {statusLabel(a.status)}
          </Pill>
        </div>
      </div>

      <div className="space-y-0 text-sm">
        <DetailRow k="Agent ID" v={<span className="font-mono text-xs break-all">{a.agentId}</span>} />
        <DetailRow
          k="Trust tier"
          v={<Pill tone={TRUST_TONE[tier] ?? "slate"}>{TRUST_LABEL[tier] ?? tier}</Pill>}
        />
        <DetailRow k="Vendor" v={a.hyperscaler ?? a.vendor ?? "—"} />
        <DetailRow k="Model" v={<span className="font-mono text-xs">{a.model ?? "—"}</span>} />
        {a.workflowId && (
          <DetailRow k="Workflow" v={<span className="font-mono text-xs">{a.workflowId}</span>} />
        )}
        {a.createdAt && (
          <DetailRow k="Registered" v={ago(a.createdAt)} />
        )}
      </div>

      <div className="pt-2 border-t border-border/60">
        <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-2">
          Performance
        </div>
        <div className="space-y-0 text-sm">
          <DetailRow k="Total runs" v={num(a.runs, 0)} />
          <DetailRow
            k="Pass rate"
            v={hasRuns && a.success > 0 ? pct(a.success) : "—"}
          />
          <DetailRow
            k="Quality (σ)"
            v={hasSigma ? <SigmaBadge value={a.sigma} /> : "—"}
          />
          <DetailRow
            k="Cost per run"
            v={a.costPerRun > 0 ? usd(a.costPerRun) : "—"}
          />
          <DetailRow
            k="Avg latency"
            v={a.p95Latency > 0 ? `${num(a.p95Latency, 0)} ms` : "—"}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-2 border-t border-border/60">
        <Link href="/insights/financial" className="aeos-btn aeos-btn-secondary w-full text-xs">
          Financial impact
          <ArrowRight className="h-3 w-3" />
        </Link>
        <Link href="/governance/audit" className="aeos-btn aeos-btn-secondary w-full text-xs">
          Audit trail
          <ArrowRight className="h-3 w-3" />
        </Link>
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

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 sm:px-5 py-2.5 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 sm:px-5 py-2.5 align-top", className)}>{children}</td>;
}
