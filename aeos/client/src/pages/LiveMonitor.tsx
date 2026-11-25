import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot, SigmaBadge } from "@/components/Pill";
import { Activity, Clock, ShieldCheck, Zap, Radio, Settings, CheckCircle2 } from "lucide-react";
import { usd, ago, num } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

type Event = { eventId: string; capturedAt: string; agentId: string; hyperscaler: string;
  model: string; wallMs: number; passedThresholds: boolean; vendorCostUsd: number; amortizedCostUsd: number };
type Agent = {
  agentId: string; name: string; hyperscaler: string; model: string; status: string;
  // Tenant-level deployment health — same for every agent of this tenant
  lastCheckedAt?: string | null;
  isReachable?: boolean | null;
  responseMs?: number | null;
  activeAgents?: number | null;
};

const STATUS_COLOR: Record<string, string> = {
  red:   "hsl(0 78% 55%)",
  amber: "hsl(38 96% 50%)",
  green: "hsl(142 71% 38%)",
};

function LatencySparkline({ data }: { data: { ms: number }[] }) {
  if (!data.length) return null;
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="hsl(38 96% 50%)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="hsl(38 96% 50%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="ms" stroke="hsl(38 96% 50%)"
          strokeWidth={1.5} fill="url(#sparkGrad)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TrendChart({ data }: { data: any[] }) {
  if (!data.length) return <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No data yet</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gradPass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="hsl(142 71% 38%)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(142 71% 38%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradFail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="hsl(0 78% 55%)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(0 78% 55%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis hide />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(v: any, name: string) => [v, name === "passed" ? "Passed" : "Failed"]}
        />
        <Area type="monotone" dataKey="passed" stackId="1" stroke="hsl(142 71% 38%)"
          strokeWidth={2} fill="url(#gradPass)" isAnimationActive={false} />
        <Area type="monotone" dataKey="failed" stackId="1" stroke="hsl(0 78% 55%)"
          strokeWidth={2} fill="url(#gradFail)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DonutChart({ passed, total }: { passed: number; total: number }) {
  const rate = total ? Math.round((passed / total) * 100) : 0;
  const data = [
    { name: "Passed", value: passed || 0 },
    { name: "Failed", value: Math.max(0, total - passed) },
  ];
  const cx = 80, cy = 80;
  return (
    <div className="relative" style={{ width: 160, height: 160 }}>
      <PieChart width={160} height={160}>
        <Pie data={data} cx={cx} cy={cy} innerRadius={52} outerRadius={70}
          dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0} isAnimationActive={false}>
          <Cell fill="hsl(142 71% 38%)" />
          <Cell fill="hsl(0 78% 55%)" />
        </Pie>
      </PieChart>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-xl font-bold leading-none">{rate}%</span>
        <span className="text-[10px] text-muted-foreground mt-0.5">pass rate</span>
      </div>
    </div>
  );
}

function CostChart({ data }: { data: { i: number; cost: number }[] }) {
  if (!data.length) return <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No data yet</div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="hsl(213 84% 42%)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(213 84% 42%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide />
        <XAxis hide />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(v: any) => [`$${Number(v).toFixed(4)}`, "Cumulative cost"]}
          labelFormatter={() => ""}
        />
        <Area type="monotone" dataKey="cost" stroke="hsl(213 84% 42%)"
          strokeWidth={2} fill="url(#gradCost)" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function AgentBarChart({ data, onBarClick }: { data: any[]; onBarClick?: (agentId: string) => void }) {
  if (!data.length) return <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No data yet</div>;
  const truncate = (s: string, n = 10) => s.length > n ? s.slice(0, n - 1) + "…" : s;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 24, left: 0 }} barSize={16}
        onClick={(payload) => { if (payload?.activePayload?.[0]?.payload?.agentId) onBarClick?.(payload.activePayload[0].payload.agentId); }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => truncate(v, 10)}
          interval={0}
          angle={-25}
          textAnchor="end"
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          formatter={(v: any, _: any, props: any) => [v + " events · " + props.payload.rate + "% pass", props.payload.name]}
          labelFormatter={() => ""}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false} cursor="pointer">
          {data.map((d, i) => (
            <Cell key={i} fill={STATUS_COLOR[d.status] ?? STATUS_COLOR.green} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function LivePulsePanel({ eventsPerMin, dataUpdatedAt }: { eventsPerMin: number; dataUpdatedAt: number }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-4">
      <div className="relative flex items-center justify-center h-16 w-16">
        <span className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-green-400 opacity-20" />
        <span className="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-green-400 opacity-30" style={{ animationDelay: "0.5s" }} />
        <span className="relative flex h-6 w-6 rounded-full bg-green-500 items-center justify-center">
          <Radio className="h-3.5 w-3.5 text-white" />
        </span>
      </div>
      <div className="text-center">
        <div className="text-3xl font-bold tabular-nums leading-none">{eventsPerMin}</div>
        <div className="text-xs text-muted-foreground mt-1">events / min</div>
      </div>
      <div className="text-[11px] text-muted-foreground text-center">
        Last refresh<br />
        <span className="font-medium">{ago(new Date(dataUpdatedAt).toISOString())}</span>
      </div>
    </div>
  );
}

export default function LiveMonitor() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [configOpen, setConfigOpen] = useState(false);
  const [healthUrlInput, setHealthUrlInput] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: events, dataUpdatedAt } = useQuery<Event[]>({
    queryKey: ["/api/observation/events"],
    refetchInterval: 5000,
  });
  const { data: agents } = useQuery<Agent[]>({ queryKey: ["/api/agents"], refetchInterval: 30_000 });
  const { data: tenantConfig } = useQuery<{ deploymentHealthUrl: string | null }>({
    queryKey: ["/api/tenant"],
  });

  const saveHealthUrl = useMutation({
    mutationFn: (url: string | null) =>
      apiRequest("PATCH", "/api/tenant/deployment-health-url", { deploymentHealthUrl: url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tenant"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agents"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });
  const ev = events ?? [];
  const passed = ev.filter(e => e.passedThresholds).length;
  const successRate = ev.length ? passed / ev.length : 0;
  const avgLatency = ev.length ? ev.reduce((s, e) => s + e.wallMs, 0) / ev.length : 0;

  const latencySparkData = useMemo(() =>
    [...ev].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
           .slice(-30).map(e => ({ ms: e.wallMs })),
    [ev]);

  const trendData = useMemo(() => {
    if (!ev.length) return [];
    const sorted = [...ev].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const N = sorted.length < 6 ? 4 : 12;
    const chunkSize = Math.ceil(sorted.length / N);
    return Array.from({ length: N }, (_, i) => {
      const chunk = sorted.slice(i * chunkSize, (i + 1) * chunkSize);
      if (!chunk.length) return null;
      return {
        label: ago(chunk[0].capturedAt),
        passed: chunk.filter(e => e.passedThresholds).length,
        failed: chunk.filter(e => !e.passedThresholds).length,
      };
    }).filter(Boolean);
  }, [ev]);

  const costCumData = useMemo(() => {
    let cum = 0;
    return [...ev]
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
      .map((e, i) => { cum += e.vendorCostUsd; return { i, cost: cum }; });
  }, [ev]);

  const agentBarData = useMemo(() => {
    const agentNameMap: Record<string, string> = {};
    (agents ?? []).forEach(a => { agentNameMap[a.agentId] = a.name; });
    const map: Record<string, { count: number; passed: number; status: string }> = {};
    ev.forEach(e => {
      map[e.agentId] ??= { count: 0, passed: 0, status: "green" };
      map[e.agentId].count++;
      if (e.passedThresholds) map[e.agentId].passed++;
    });
    (agents ?? []).forEach(a => { if (map[a.agentId]) map[a.agentId].status = a.status; });
    return Object.entries(map)
      .map(([id, v]) => ({
        name: agentNameMap[id] ?? id.split("-").slice(-1)[0],
        agentId: id,
        count: v.count,
        rate: v.count ? Math.round((v.passed / v.count) * 100) : 0,
        status: v.status,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [ev, agents]);

  const eventsPerMin = useMemo(() => {
    if (ev.length < 2) return 0;
    const times = ev.map(e => new Date(e.capturedAt).getTime()).filter(n => !isNaN(n));
    const spanMs = Math.max(...times) - Math.min(...times);
    return spanMs > 0 ? Math.round(ev.length / (spanMs / 60_000)) : 0;
  }, [ev]);

  return (
    <Layout title="Live Monitor" kicker="Home / Live Monitor">
      {/* Status Banner */}
      <div className="rounded-xl bg-[hsl(142_72%_96%)] border border-[hsl(142_72%_82%)] px-5 py-4 mb-5 flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-[hsl(142_70%_30%)]" />
        <div className="flex-1">
          <div className="font-semibold text-[hsl(142_70%_22%)]">All Systems Operational</div>
          <div className="text-xs text-[hsl(142_70%_30%)]">Last refresh · {ago(new Date(dataUpdatedAt).toISOString())} · auto-refresh every 5s</div>
        </div>
        <div className="flex items-center gap-2 text-sm text-[hsl(142_70%_30%)] mr-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="font-medium tabular-nums">{eventsPerMin}</span> evt/min
        </div>
        <Button size="sm" variant="outline" className="border-[hsl(142_72%_72%)] text-[hsl(142_70%_28%)] hover:bg-[hsl(142_72%_90%)]"
          onClick={() => { setHealthUrlInput(tenantConfig?.deploymentHealthUrl ?? ""); setConfigOpen(true); }}>
          <Settings className="h-3.5 w-3.5 mr-1.5" />
          Configure
        </Button>
        <Button size="sm" variant="destructive" data-testid="btn-pause-all">
          Emergency Pause All Agents
        </Button>
      </div>

      {/* Deployment health URL config sheet */}
      <Sheet open={configOpen} onOpenChange={setConfigOpen}>
        <SheetContent side="right" className="w-[380px] sm:w-[420px]">
          <SheetHeader>
            <SheetTitle>Deployment Health Endpoint</SheetTitle>
            <SheetDescription>
              Fuzebox will poll this URL every 30 seconds to check how many agents are live on your deployment server. It should be the <code className="text-xs bg-muted px-1 py-0.5 rounded">/health</code> endpoint of your webhook server.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="health-url">Health endpoint URL</Label>
              <Input
                id="health-url"
                placeholder="https://your-server.com/health"
                value={healthUrlInput}
                onChange={e => setHealthUrlInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Expected response: <code className="bg-muted px-1 py-0.5 rounded">{"{ \"status\": \"ok\", \"active_agents\": 3 }"}</code>
              </p>
            </div>

            {tenantConfig?.deploymentHealthUrl && (
              <div className="text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-muted/40">
                Current: <span className="font-mono break-all">{tenantConfig.deploymentHealthUrl}</span>
              </div>
            )}
          </div>

          <SheetFooter className="mt-6 flex-col gap-2">
            <Button
              className="w-full"
              disabled={saveHealthUrl.isPending}
              onClick={() => saveHealthUrl.mutate(healthUrlInput.trim() || null)}
            >
              {saved
                ? <><CheckCircle2 className="h-4 w-4 mr-1.5" />Saved</>
                : saveHealthUrl.isPending ? "Saving…" : "Save & Start Polling"
              }
            </Button>
            {tenantConfig?.deploymentHealthUrl && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground"
                onClick={() => saveHealthUrl.mutate(null)}>
                Clear endpoint
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard tone="primary" icon={<Activity className="h-4 w-4" />}
          label="EVENTS OBSERVED" value={ev.length + ""} sub="last 200 captured" />
        <KpiCard tone="green" icon={<Zap className="h-4 w-4" />}
          label="SUCCESS RATE" value={(successRate * 100).toFixed(0) + "%"} sub={`${passed} / ${ev.length} threshold pass`} />
        <KpiCard tone="amber" icon={<Clock className="h-4 w-4" />}
          label="AVG LATENCY" value={num(avgLatency, 0) + " ms"} sub="wall-time per call"
          footer={<LatencySparkline data={latencySparkData} />} />
        <KpiCard tone="orange" icon={<Activity className="h-4 w-4" />}
          label="ACTIVE AGENTS" value={(agents ?? []).length + ""} sub="across 5 vendors" />
      </div>

      {/* Trend Overview — full width */}
      <SectionCard kicker="Trend" title="Success / Fail Trend" className="mb-5">
        <div className="flex gap-6 items-center">
          <div className="flex-1 h-[180px]">
            <TrendChart data={trendData} />
          </div>
          <div className="shrink-0">
            <DonutChart passed={passed} total={ev.length} />
          </div>
        </div>
      </SectionCard>

      {/* 3-column chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <SectionCard kicker="Cost" title="Cumulative Cost">
          <div className="h-[160px]">
            <CostChart data={costCumData} />
          </div>
        </SectionCard>
        <SectionCard kicker="Agents" title="Events per Agent">
          <div className="h-[160px]">
            <AgentBarChart data={agentBarData} onBarClick={(agentId) => navigate(`/ecl/observation?agent=${encodeURIComponent(agentId)}`)} />
          </div>
        </SectionCard>
        <SectionCard kicker="Live" title="Live Pulse">
          <div className="h-[160px]">
            <LivePulsePanel eventsPerMin={eventsPerMin} dataUpdatedAt={dataUpdatedAt} />
          </div>
        </SectionCard>
      </div>

      {/* Original 2-column row — unchanged */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        <SectionCard kicker="Agents" title="Real-time agent health" padding={false}>
          <ul className="divide-y">
            {(agents ?? []).map(a => {
              const sigma = a.status === "red" ? 2.7 : a.status === "amber" ? 3.2 : 4.1;
              const myEvents = ev.filter(e => e.agentId === a.agentId);
              const myPass = myEvents.filter(e => e.passedThresholds).length;
              const rate = myEvents.length ? Math.round((myPass / myEvents.length) * 100) : 0;

              // Derive liveness from tenant-level deployment health probe
              let livenessTone: "green" | "amber" | "red" | "gray" = "gray";
              let livenessLabel = "Not configured";
              let livenessDetail = "";
              if (a.isReachable == null && a.lastCheckedAt == null) {
                // no probe yet — healthUrl may or may not be set; shown as gray
              } else if (a.lastCheckedAt == null) {
                livenessTone = "amber";
                livenessLabel = "Pending";
                livenessDetail = "first check pending";
              } else if (a.isReachable) {
                if ((a.activeAgents ?? 0) === 0) {
                  livenessTone = "amber";
                  livenessLabel = "0 agents running";
                  livenessDetail = ago(a.lastCheckedAt);
                } else {
                  livenessTone = "green";
                  livenessLabel = "Live";
                  livenessDetail = a.responseMs != null ? `${a.responseMs}ms · ${ago(a.lastCheckedAt)}` : ago(a.lastCheckedAt);
                }
              } else {
                livenessTone = "red";
                livenessLabel = "Unreachable";
                livenessDetail = a.lastCheckedAt ? ago(a.lastCheckedAt) : "";
              }

              return (
                <li key={a.agentId}
                  className="px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  onClick={() => navigate(`/ecl/observation?agent=${encodeURIComponent(a.agentId)}`)}>
                  <StatusDot tone={livenessTone as any} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2">
                      {a.name}
                      <span className={`text-[11px] font-semibold ${
                        livenessTone === "green" ? "text-[hsl(142_71%_38%)]" :
                        livenessTone === "red" ? "text-[hsl(0_78%_55%)]" :
                        livenessTone === "amber" ? "text-[hsl(38_96%_40%)]" :
                        "text-muted-foreground"
                      }`}>{livenessLabel}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{a.model}</span> · {myEvents.length} events
                      {livenessDetail ? <span className="ml-1.5 opacity-70">· {livenessDetail}</span> : null}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums w-16 text-right">{rate}%</div>
                  <SigmaBadge value={sigma} trend={a.status === "red" ? "down" : undefined} />
                </li>
              );
            })}
          </ul>
        </SectionCard>

        <SectionCard kicker="Live event feed" title="Last 30 calls" padding={false}>
          <ul className="divide-y max-h-[600px] overflow-y-auto">
            {ev.slice(0, 30).map(e => (
              <li key={e.eventId} className="px-5 py-2.5 flex items-center gap-3 text-xs">
                <span className="font-mono text-muted-foreground w-12 shrink-0">{ago(e.capturedAt)}</span>
                {e.passedThresholds
                  ? <Pill tone="green">OK</Pill>
                  : <Pill tone="red">FAIL</Pill>}
                <span className="font-mono text-[11px] truncate flex-1">{e.agentId}</span>
                <span className="tabular-nums text-muted-foreground">{e.wallMs}ms</span>
                <span className="tabular-nums">{usd(e.vendorCostUsd)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </Layout>
  );
}
