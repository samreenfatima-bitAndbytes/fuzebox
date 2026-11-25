import React from "react";
import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill } from "@/components/Pill";
import {
  GitMerge, AlertTriangle, Database, Network,
} from "lucide-react";
import { AGENTS } from "@/lib/personas";
import { sigma as sigFmt, num } from "@/lib/format";

const SHARED_RESOURCES = [
  { id: "odds_feed",      name: "Odds Feed API",         agents: ["odds_analysis", "line_comparison"],          status: "stale" as const,   detail: "14-min latency on player props — exceeds SLA of 5 min" },
  { id: "vehicle_tel",    name: "Vehicle Telematics API",agents: ["fnol_triage", "damage_estimator"],           status: "healthy" as const, detail: "Live FNOL evidence stream — 99.4% uptime last 30 days" },
  { id: "kyb_provider",   name: "KYB Vendor Score",      agents: ["loan_underwriter", "aml_screener"],          status: "healthy" as const, detail: "Used during onboarding and quarterly re-screen" },
  { id: "parts_pricing",  name: "Parts Pricing Feed",    agents: ["damage_estimator", "estimate_composer"],     status: "stale" as const,   detail: "Vendor feed 9 days behind — drives FMEA-104 / FMEA-108" },
  { id: "ledger",         name: "Predictive Ledger",     agents: ["covenant_check", "vip_segmenter", "folio_reconciler", "aml_screener"], status: "healthy" as const, detail: "Authoritative truth store for downstream reconciliation" },
];

const RISKS = [
  { id: "DR-01", desc: "Recommendation Writer cascade — failure drops 2.9σ exposure across all SBA outbound", impact: "HIGH",   blast: "$2,400 / week leakage potential" },
  { id: "DR-02", desc: "Stale Parts Pricing Feed — single point of failure for two agents (FMEA-104, FMEA-108)",     impact: "HIGH",   blast: "Estimate variance > $400 / claim" },
  { id: "DR-03", desc: "Sanctions Match dependency on KYB Vendor — vendor outage blocks AML auto-clear",      impact: "MEDIUM", blast: "Onboarding queue grows 45% / outage hour" },
  { id: "DR-04", desc: "Folio Reconciler relies on POS webhook — replay required at peak (suite checkout)",   impact: "LOW",    blast: "Comp leakage $250 / event" },
];

const agentMap = Object.fromEntries(AGENTS.map(a => [a.id, a]));

type DependencyNode = {
  agentId: string;
  name: string;
  model: string | null;
  hyperscaler: string;
  trustTier: string;
  vendor: string | null;
  status: string;
  sigma: number;
  runs: number;
  eventCount: number;
};

type DependencyChain = {
  processId: string;
  name: string;
  avgSigma: number;
  nodes: DependencyNode[];
};

function nodeColor(sigma: number) {
  if (sigma >= 4.0) return { fill: "hsl(142 72% 92%)", stroke: "hsl(142 70% 38%)", text: "hsl(142 70% 24%)" };
  if (sigma >= 3.0) return { fill: "hsl(38 96% 92%)",  stroke: "hsl(28 90% 44%)",  text: "hsl(28 90% 28%)" };
  return                    { fill: "hsl(0 85% 94%)",  stroke: "hsl(0 72% 48%)",   text: "hsl(0 72% 36%)" };
}

export default function Dependencies() {
  const [chains, setChains] = React.useState<DependencyChain[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/observation/dependencies", { credentials: "include" });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
        const data = (await res.json()) as DependencyChain[];
        if (!cancelled) setChains(Array.isArray(data) ? data : []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load data flow");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalChains = chains.length;
  const totalAgents = chains.reduce((n, c) => n + c.nodes.length, 0);
  const sharedResources = SHARED_RESOURCES.length;
  const highRisks = RISKS.filter(r => r.impact === "HIGH").length;

  return (
    <Layout title="Agent Dependencies & Data Flow" kicker="MY AI AGENTS / DEPENDENCIES">
      <p className="text-sm text-muted-foreground mb-5 max-w-3xl">
        Map of how agents feed into each other and what shared resources they rely on. Cascade-impact warnings show where a single failure ripples across processes.
      </p>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="PROCESS CHAINS" value={totalChains} sub={`Across ${totalChains} process${totalChains === 1 ? "" : "es"}`} tone="primary" icon={<Network className="h-4 w-4" />} />
        <KpiCard label="AGENTS WIRED" value={totalAgents} sub="From agent registry" tone="primary" icon={<GitMerge className="h-4 w-4" />} />
        <KpiCard label="SHARED RESOURCES" value={sharedResources} sub="APIs / data feeds reused across agents" tone="amber" icon={<Database className="h-4 w-4" />} />
        <KpiCard label="HIGH-IMPACT RISKS" value={highRisks} sub="Cascade-prone failure points" tone="red" icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      {/* Chain map */}
      <SectionCard kicker="DATA FLOW" title="Per-process pipelines (color = sigma)">
        {loading && (
          <p className="text-sm text-muted-foreground">Loading process chains…</p>
        )}
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
        {!loading && !error && chains.length === 0 && (
          <p className="text-sm text-muted-foreground">No agents in the registry yet. Ingest telemetry or seed the demo tenant to populate this view.</p>
        )}
        <div className="space-y-5">
          {!loading && !error && chains.map(chain => (
            <div key={chain.processId} className="rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide">{chain.name}</div>
                <Pill tone={chain.avgSigma >= 4 ? "green" : chain.avgSigma >= 3 ? "amber" : "red"}>{sigFmt(chain.avgSigma)} avg</Pill>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {chain.nodes.map((node, i) => {
                  const col = nodeColor(node.sigma);
                  const modelLabel = node.model ?? "—";
                  return (
                    <div key={node.agentId} className="flex items-center gap-2">
                      <div className="rounded-md border px-3 py-2 min-w-[180px]"
                           style={{ background: col.fill, borderColor: col.stroke + "55" }}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: col.stroke }} />
                          <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: col.text }}>{sigFmt(node.sigma)}</div>
                        </div>
                        <div className="text-xs font-semibold">{node.name}</div>
                        <div className="text-[10px] text-muted-foreground">{modelLabel} · {num(node.runs, 0)} closed runs</div>
                      </div>
                      {i < chain.nodes.length - 1 && (
                        <span className="text-muted-foreground text-xs whitespace-nowrap" aria-hidden>feeds into →</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 pt-4 border-t text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[hsl(142_70%_38%)]" /> ≥ 4σ healthy</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[hsl(28_90%_44%)]" /> 3–4σ watch</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[hsl(0_72%_48%)]" /> &lt; 3σ at-risk</span>
        </div>
      </SectionCard>

      {/* Shared resources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
        <SectionCard kicker="SHARED RESOURCES" title="APIs & data feeds reused across agents" padding={false}>
          <div className="divide-y">
            {SHARED_RESOURCES.map(r => {
              const tone = r.status === "healthy" ? "green" : "red";
              return (
                <div key={r.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="font-semibold text-sm flex items-center gap-2">
                      <Database className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.name}
                    </div>
                    <Pill tone={tone}>{r.status === "healthy" ? "HEALTHY" : "STALE"}</Pill>
                  </div>
                  <div className="text-[11px] text-muted-foreground mb-2">{r.detail}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.agents.map(aid => {
                      const a = agentMap[aid];
                      return a ? (
                        <span key={aid} className="text-[10px] px-2 py-0.5 rounded border bg-card">
                          {a.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard kicker="DEPENDENCY RISKS" title="Cascade-prone failure points">
          <div className="space-y-3">
            {RISKS.map(r => (
              <div key={r.id}
                   className={`rounded-lg border-l-4 p-3 ${r.impact === "HIGH" ? "border-l-[hsl(0_72%_52%)] bg-[hsl(0_85%_98%)] dark:bg-[hsl(0_30%_14%)]"
                              : r.impact === "MEDIUM" ? "border-l-[hsl(38_90%_50%)] bg-[hsl(38_96%_98%)] dark:bg-[hsl(28_30%_14%)]"
                              : "border-l-[hsl(213_84%_56%)] bg-[hsl(213_100%_98%)] dark:bg-[hsl(222_47%_18%)]"}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-mono text-[10px] text-muted-foreground">{r.id}</div>
                  <Pill tone={r.impact === "HIGH" ? "red" : r.impact === "MEDIUM" ? "amber" : "blue"}>{r.impact}</Pill>
                </div>
                <div className="text-xs leading-relaxed mb-1.5">{r.desc}</div>
                <div className="text-[10px] text-muted-foreground">Blast radius: <span className="font-semibold text-foreground">{r.blast}</span></div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </Layout>
  );
}
