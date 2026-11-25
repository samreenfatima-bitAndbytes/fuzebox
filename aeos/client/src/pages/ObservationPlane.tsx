import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard, SectionTitle } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { usd, num, pct, ago } from "@/lib/format";
import { Eye, Activity, Network, Database, Clock, Zap, Gauge, X, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

type Event = {
  id: number; eventId: string; capturedAt: string; tenantId: string;
  hyperscaler: string; endpoint: string; transport: string; capturedVia: string;
  agentId: string; agentKind: string; model: string;
  inputTokens: number; outputTokens: number; wallMs: number;
  vendorCostUsd: number; amortizedCostUsd: number; laborValueSavedUsd: number;
  passedThresholds: boolean; trustTier: string; auditHash: string; prevEventHash?: string;
  policyOutcome?: string; uopId?: string; ropValue?: number;
  humanReview?: string; confidence?: number;
};
type Coverage = { hyperscaler: string; surface: string; status: string; lastTelemetryAt?: string; signature?: string };

const VENDOR_TONES: Record<string, "blue" | "amber" | "green" | "slate"> = {
  anthropic: "amber", openai: "green", ms_copilot: "blue",
  uniphore_baic: "amber", mistral: "slate",
};

export default function ObservationPlane() {
  const [, navigate] = useLocation();
  const agentFilter = new URLSearchParams(window.location.search).get("agent");

  const { data: events }   = useQuery<Event[]>({ queryKey: ["/api/observation/events"] });
  const { data: coverage } = useQuery<Coverage[]>({ queryKey: ["/api/observation/coverage"] });

  const ev = events ?? [];
  const filteredEv = agentFilter ? ev.filter(e => e.agentId === agentFilter) : ev;
  const cov = coverage ?? [];
  const totalTokens = ev.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);
  const totalCost = ev.reduce((s, e) => s + e.amortizedCostUsd, 0);
  const totalSaved = ev.reduce((s, e) => s + (e.laborValueSavedUsd || 0), 0);
  const passed = ev.filter(e => e.passedThresholds).length;
  const passRate = ev.length ? passed / ev.length : 0;
  const avgWallMs = ev.length ? ev.reduce((s, e) => s + e.wallMs, 0) / ev.length : 0;
  const avgTokens = ev.length ? totalTokens / ev.length : 0;
  const avgCostPerEvent = ev.length ? totalCost / ev.length : 0;
  const queued = ev.filter(e => e.humanReview === "queued").length;

  // throughput — events per hour over the captured window
  const times = ev.map(e => new Date(e.capturedAt).getTime()).filter(n => !isNaN(n));
  const span = times.length > 1 ? (Math.max(...times) - Math.min(...times)) / 3_600_000 : 1;
  const throughput = span > 0 ? ev.length / Math.max(span, 0.0167) : 0;

  // by-vendor capture distribution
  const byVendor: Record<string, { n: number; cost: number; saved: number; tokens: number; avgMs: number }> = {};
  ev.forEach(e => {
    const k = e.hyperscaler;
    byVendor[k] ??= { n: 0, cost: 0, saved: 0, tokens: 0, avgMs: 0 };
    byVendor[k].n += 1;
    byVendor[k].cost += e.amortizedCostUsd;
    byVendor[k].saved += e.laborValueSavedUsd ?? 0;
    byVendor[k].tokens += e.inputTokens + e.outputTokens;
    byVendor[k].avgMs += e.wallMs;
  });
  const vendors = Object.entries(byVendor).map(([k, v]) => ({ k, ...v, avgMs: v.avgMs / Math.max(1, v.n) }))
    .sort((a, b) => b.n - a.n);

  const surfaces = new Set(cov.map(c => `${c.hyperscaler}/${c.surface}`));
  const gaps = cov.filter(c => c.status !== "covered").length;
  const captureRate = cov.length > 0 ? (cov.length - gaps) / cov.length : 0;

  const referrer = agentFilter ? "/monitor" : "/";

  return (
    <Layout title="Observation Plane" kicker="Economic Cognition / Observation Plane"
      headerRight={
        <Link href={referrer} className="aeos-btn aeos-btn--topbar aeos-btn-secondary-on-dark">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
      }>
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Five capture mechanisms — model gateway, hyperscaler proxy, OTel, vendor webhook, eBPF —
          translate every agent decision into the FuzeBox Canonical Event v1, signed and chained.
          This is the boundary observation layer (Patent Family 6).
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">Patent Family 6 · Boundary + Economic Routing</Pill>
          <Pill tone="slate">OBS-01..15</Pill>
          {agentFilter && (
            <button
              onClick={() => navigate("/ecl/observation")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(213_100%_94%)] text-[hsl(213_84%_42%)] text-[11px] font-semibold px-3 py-1 border border-[hsl(213_84%_80%)] hover:bg-[hsl(213_100%_88%)] transition-colors"
            >
              Agent: {agentFilter}
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard tone="primary" icon={<Eye className="h-4 w-4" />}
          label="OBSERVED EVENTS" value={num(ev.length, 0)}
          sub={`${num(throughput, 1)} events / hour throughput`} />
        <KpiCard tone="orange" icon={<Network className="h-4 w-4" />}
          label="ACTIVE SURFACES"
          value={`${surfaces.size}`}
          sub={`${pct(captureRate, 0)} capture rate · ${gaps} gap${gaps === 1 ? "" : "s"}`} />
        <KpiCard tone="green" icon={<Activity className="h-4 w-4" />}
          label="THRESHOLD PASS RATE" value={pct(passRate, 1)} sub={`${passed} / ${ev.length} passed · ${queued} queued for review`} />
        <KpiCard tone="amber" icon={<Database className="h-4 w-4" />}
          label="AMORTIZED SPEND" value={usd(totalCost)}
          sub={`${num(totalTokens, 0)} tokens · ${usd(totalSaved)} value saved`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard tone="primary" icon={<Clock className="h-4 w-4" />}
          label="AVG LATENCY"
          value={`${num(avgWallMs, 0)} ms`}
          sub={`p50 wall-clock per canonical event`} />
        <KpiCard tone="orange" icon={<Zap className="h-4 w-4" />}
          label="AVG TOKENS / EVENT"
          value={num(avgTokens, 0)}
          sub={`input + output tokens metered`} />
        <KpiCard tone="green" icon={<Gauge className="h-4 w-4" />}
          label="AVG COST / EVENT"
          value={usd(avgCostPerEvent)}
          sub={`amortized vendor + 15% governance`} />
        <KpiCard tone="slate" icon={<Activity className="h-4 w-4" />}
          label="HUMAN REVIEW QUEUED" value={num(queued, 0)}
          sub={`${pct(queued / Math.max(ev.length, 1), 0)} of stream · drives CTR`} />
      </div>

      <SectionTitle>Capture distribution by vendor</SectionTitle>
      <SectionCard kicker="Per-hyperscaler" title={`${vendors.length} vendors observed`}
        action={<Pill tone="slate">{ev.length} events</Pill>} className="mb-6">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
            <tr>
              <Th>Vendor</Th><Th align="right">Events</Th><Th align="right">% mix</Th>
              <Th align="right">Tokens</Th><Th align="right">Avg ms</Th>
              <Th align="right">Spend</Th><Th align="right">Saved</Th><Th align="right">MER</Th>
            </tr>
          </thead>
          <tbody>
            {vendors.map(v => {
              const mer = v.cost > 0 ? v.saved / v.cost : 0;
              return (
                <tr key={v.k} className="border-b last:border-0">
                  <Td><Pill tone={VENDOR_TONES[v.k] ?? "neutral"}>{v.k}</Pill></Td>
                  <Td align="right">{num(v.n, 0)}</Td>
                  <Td align="right">{pct(v.n / Math.max(ev.length, 1), 0)}</Td>
                  <Td align="right">{num(v.tokens, 0)}</Td>
                  <Td align="right">{num(v.avgMs, 0)}</Td>
                  <Td align="right">{usd(v.cost)}</Td>
                  <Td align="right" className="text-[hsl(142_70%_30%)] font-semibold">{usd(v.saved)}</Td>
                  <Td align="right" className="font-semibold">{num(mer, 2)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-5 mb-6">
        <SectionCard kicker="Live event stream" title={agentFilter ? `Events for ${agentFilter}` : "Canonical Event v1"}
          action={agentFilter ? <span className="text-xs text-muted-foreground">{filteredEv.length} events</span> : undefined}
          padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
                <tr><Th>Time</Th><Th>Vendor</Th><Th>Agent</Th><Th>Model</Th><Th align="right">Tokens</Th><Th align="right">ms</Th><Th align="right">Cost</Th><Th align="right">Saved</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {filteredEv.slice(0, 50).map(e => (
                  <tr key={e.eventId} className="border-b last:border-0 hover:bg-muted/40">
                    <Td mono>{ago(e.capturedAt)}</Td>
                    <Td><Pill tone={VENDOR_TONES[e.hyperscaler] ?? "neutral"}>{e.hyperscaler}</Pill></Td>
                    <Td mono className="text-xs">{e.agentId}</Td>
                    <Td className="text-xs">{e.model}</Td>
                    <Td align="right">{num(e.inputTokens + e.outputTokens, 0)}</Td>
                    <Td align="right">{num(e.wallMs, 0)}</Td>
                    <Td align="right">{usd(e.amortizedCostUsd)}</Td>
                    <Td align="right" className="text-[hsl(142_70%_30%)] font-semibold">{usd(e.laborValueSavedUsd, { decimals: 2 })}</Td>
                    <Td>
                      {e.passedThresholds
                        ? <Pill tone="green"><StatusDot tone="green" /> OK</Pill>
                        : <Pill tone="red"><StatusDot tone="red" /> FAIL</Pill>}
                    </Td>
                  </tr>
                ))}
                {filteredEv.length === 0 && (
                  <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">
                    {agentFilter ? `No events found for agent: ${agentFilter}` : "No events captured yet"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard kicker="Coverage manifest" title="Capture surface health" padding={false}>
          <ul className="divide-y">
            {cov.map((c, i) => {
              const tone = c.status === "covered" ? "green" : c.status === "degraded" ? "amber" : "red";
              return (
                <li key={i} className="px-5 py-3 flex items-center gap-3">
                  <StatusDot tone={tone} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">
                      <span className="font-mono">{c.hyperscaler}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span>{c.surface}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      last telemetry · {ago(c.lastTelemetryAt)} · sig {c.signature?.slice(0, 8) ?? "—"}
                    </div>
                  </div>
                  <Pill tone={tone === "green" ? "green" : tone === "amber" ? "amber" : "red"}>
                    {c.status.toUpperCase()}
                  </Pill>
                </li>
              );
            })}
            {cov.length === 0 && (
              <li className="px-5 py-8 text-center text-muted-foreground text-sm">No coverage data</li>
            )}
          </ul>
        </SectionCard>
      </div>

      <SectionCard kicker="Audit chain proof" title="HMAC chain integrity">
        <div className="grid md:grid-cols-2 gap-5 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground font-semibold mb-2">Most recent event hash</div>
            <code className="block break-all text-[11px] bg-muted px-3 py-2 rounded border font-mono">
              {ev[0]?.auditHash ?? "—"}
            </code>
            <div className="text-[10px] text-muted-foreground mt-1">previousHash · {ev[0]?.prevEventHash?.slice(0, 24) ?? "genesis"}…</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground font-semibold mb-2">Chain properties</div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Each event signed: <code className="font-mono">HMAC-SHA256(secret, prev_hash || canonical_payload)</code></li>
              <li>• Tamper-evident — any retroactive edit invalidates downstream rows</li>
              <li>• Co-signed by FuzeBox KMS + r-Potential KMS at SoR reconciliation</li>
              <li>• Surface signatures attest live capture of every meter point</li>
            </ul>
          </div>
        </div>
      </SectionCard>
    </Layout>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" | "left" }) {
  return <th className={`px-5 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>{children}</th>;
}
function Td({ children, mono, className, align }: { children: React.ReactNode; mono?: boolean; className?: string; align?: "right" | "left" }) {
  return <td className={`px-5 py-2 tabular-nums ${align === "right" ? "text-right" : ""} ${mono ? "font-mono text-xs" : ""} ${className ?? ""}`}>{children}</td>;
}
