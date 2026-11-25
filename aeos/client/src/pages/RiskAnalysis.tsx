import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill, StatusDot } from "@/components/Pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, ShieldAlert, FileWarning, CheckCircle2, Loader2, Plus,
  Activity, Search,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { num } from "@/lib/format";
import { useListSelection } from "@/hooks/use-list-selection";

type FmeaStatus = "OPEN" | "MITIGATING" | "MITIGATED" | "ACCEPTED" | "CLOSED";

interface FmeaRow {
  id: string;
  processScope: string;
  failureMode: string;
  effect: string;
  rootCause: string;
  mitigation: string;
  severity: number;
  occurrence: number;
  detection: number;
  status: FmeaStatus;
  owner: string;
  rpn: number;
  agentName: string | null;
  agentTrustTier: string | null;
  agentStatus: string | null;
  agentHyperscaler: string | null;
  agentModel: string | null;
  createdAt: string;
  updatedAt: string;
}

type StatusFilter = "all" | FmeaStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "MITIGATING", label: "Mitigating" },
  { value: "MITIGATED", label: "Mitigated" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "CLOSED", label: "Closed" },
];

function rpnTone(v: number): "red" | "amber" | "green" {
  return v >= 200 ? "red" : v >= 100 ? "amber" : "green";
}

function statusTone(s: FmeaStatus): "red" | "amber" | "green" | "slate" {
  if (s === "OPEN") return "red";
  if (s === "MITIGATING") return "amber";
  if (s === "MITIGATED") return "green";
  return "slate";
}

function ScoreCell({ label, v, max }: { label: string; v: number; max: number }) {
  const tone = v >= 8 ? "red" : v >= 5 ? "amber" : "green";
  const fill =
    tone === "red" ? "hsl(0 72% 50%)"
      : tone === "amber" ? "hsl(38 96% 50%)"
        : "hsl(142 70% 42%)";
  return (
    <div className="rounded-none border p-2 text-center min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{label}</div>
      <div className="text-lg sm:text-xl font-bold tabular-nums" style={{ color: fill }}>
        {v}<span className="text-[10px] text-muted-foreground">/{max}</span>
      </div>
    </div>
  );
}

function RiskHeatmap({
  risks, selectedId, onSelect,
}: { risks: FmeaRow[]; selectedId: string; onSelect: (id: string) => void }) {
  const W = 560, H = 320, padL = 36, padR = 16, padT = 16, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const cx = (o: number) => padL + (o / 10) * innerW;
  const cy = (s: number) => padT + innerH - (s / 10) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 360 }}>
      <rect x={padL} y={padT} width={innerW * 0.4} height={innerH * 0.4} fill="hsl(142 72% 94%)" />
      <rect x={padL + innerW * 0.4} y={padT} width={innerW * 0.6} height={innerH * 0.4} fill="hsl(38 96% 95%)" />
      <rect x={padL} y={padT + innerH * 0.4} width={innerW * 0.4} height={innerH * 0.6} fill="hsl(38 96% 95%)" />
      <rect x={padL + innerW * 0.4} y={padT + innerH * 0.4} width={innerW * 0.6} height={innerH * 0.6} fill="hsl(0 85% 96%)" />
      {[2, 4, 6, 8, 10].map(g => (
        <line key={`gx${g}`} x1={cx(g)} y1={padT} x2={cx(g)} y2={H - padB} stroke="hsl(220 14% 88%)" strokeWidth="1" />
      ))}
      {[2, 4, 6, 8, 10].map(g => (
        <line key={`gy${g}`} x1={padL} y1={cy(g)} x2={W - padR} y2={cy(g)} stroke="hsl(220 14% 88%)" strokeWidth="1" />
      ))}
      <text x={W / 2} y={H - 6} fontSize="11" textAnchor="middle" fill="hsl(220 10% 40%)" fontWeight="600">
        Occurrence (1–10)
      </text>
      <text x="14" y={H / 2} fontSize="11" textAnchor="middle" fill="hsl(220 10% 40%)" fontWeight="600"
        transform={`rotate(-90 14 ${H / 2})`}>
        Severity (1–10)
      </text>
      {[2, 4, 6, 8, 10].map(g => (
        <text key={`tx${g}`} x={cx(g)} y={H - padB + 14} fontSize="9" textAnchor="middle" fill="hsl(220 10% 50%)">{g}</text>
      ))}
      {[2, 4, 6, 8, 10].map(g => (
        <text key={`ty${g}`} x={padL - 6} y={cy(g) + 3} fontSize="9" textAnchor="end" fill="hsl(220 10% 50%)">{g}</text>
      ))}
      {risks.map(r => {
        const color =
          r.rpn >= 200 ? "hsl(0 72% 52%)"
            : r.rpn >= 100 ? "hsl(38 90% 50%)"
              : "hsl(142 70% 42%)";
        const radius = 6 + r.detection * 1.4;
        const selected = r.id === selectedId;
        return (
          <g key={r.id} style={{ cursor: "pointer" }} onClick={() => onSelect(r.id)}>
            <circle
              cx={cx(r.occurrence)} cy={cy(r.severity)} r={radius}
              fill={color} fillOpacity={0.22}
              stroke={color} strokeWidth={selected ? 3 : 1.5}
            />
            <text
              x={cx(r.occurrence)} y={cy(r.severity) + 3}
              fontSize="9" textAnchor="middle" fontWeight="700" fill={color}
            >
              {r.rpn}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const EMPTY_FORM = {
  id: "",
  agentRegistryId: "",
  processScope: "",
  failureMode: "",
  effect: "",
  rootCause: "",
  mitigation: "",
  severity: "5",
  occurrence: "5",
  detection: "5",
  status: "OPEN" as FmeaStatus,
  owner: "",
};

function ScoreSelect({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-9 rounded-none">
        <SelectValue placeholder="—" />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 10 }, (_, i) => String(i + 1)).map(n => (
          <SelectItem key={n} value={n}>{n}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddRiskModal({
  open, onClose, agents,
}: {
  open: boolean;
  onClose: () => void;
  agents: { id: number; name: string }[];
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: typeof EMPTY_FORM) => {
      const body: Record<string, unknown> = {
        id: payload.id.trim(),
        processScope: payload.processScope.trim(),
        failureMode: payload.failureMode.trim(),
        effect: payload.effect.trim(),
        rootCause: payload.rootCause.trim(),
        mitigation: payload.mitigation.trim(),
        severity: Number(payload.severity),
        occurrence: Number(payload.occurrence),
        detection: Number(payload.detection),
        status: payload.status,
        owner: payload.owner.trim(),
      };
      if (payload.agentRegistryId) body.agentRegistryId = Number(payload.agentRegistryId);
      const res = await apiRequest("POST", "/api/fmea", body);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Save failed");
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fmea"] });
      setForm(EMPTY_FORM);
      setServerError(null);
      onClose();
    },
    onError: (err: Error) => setServerError(err.message),
  });

  function set(field: keyof typeof EMPTY_FORM, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-none">
        <DialogHeader>
          <DialogTitle>Add Risk Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); setServerError(null); mutation.mutate(form); }} className="space-y-4 mt-2">
          <div className="space-y-1">
            <Label htmlFor="fmea-id">ID <span className="text-red-500">*</span></Label>
            <Input id="fmea-id" placeholder="e.g. FMEA-101" value={form.id} onChange={e => set("id", e.target.value)} required className="rounded-none" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fmea-agent">Agent Registry</Label>
            <Select value={form.agentRegistryId} onValueChange={v => set("agentRegistryId", v)}>
              <SelectTrigger id="fmea-agent" className="h-9 rounded-none">
                <SelectValue placeholder="Select agent (optional)" />
              </SelectTrigger>
              <SelectContent>
                {agents.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fmea-scope">Process Scope <span className="text-red-500">*</span></Label>
            <Input id="fmea-scope" value={form.processScope} onChange={e => set("processScope", e.target.value)} required className="rounded-none" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fmea-failure">Failure Mode <span className="text-red-500">*</span></Label>
            <Input id="fmea-failure" value={form.failureMode} onChange={e => set("failureMode", e.target.value)} required className="rounded-none" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fmea-effect">Effect <span className="text-red-500">*</span></Label>
            <Input id="fmea-effect" value={form.effect} onChange={e => set("effect", e.target.value)} required className="rounded-none" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fmea-root">Root Cause <span className="text-red-500">*</span></Label>
            <Textarea id="fmea-root" rows={2} value={form.rootCause} onChange={e => set("rootCause", e.target.value)} required className="rounded-none" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="fmea-mitigation">Mitigation <span className="text-red-500">*</span></Label>
            <Textarea id="fmea-mitigation" rows={2} value={form.mitigation} onChange={e => set("mitigation", e.target.value)} required className="rounded-none" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="fmea-sev">Severity (S)</Label>
              <ScoreSelect id="fmea-sev" value={form.severity} onChange={v => set("severity", v)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fmea-occ">Occurrence (O)</Label>
              <ScoreSelect id="fmea-occ" value={form.occurrence} onChange={v => set("occurrence", v)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fmea-det">Detection (D)</Label>
              <ScoreSelect id="fmea-det" value={form.detection} onChange={v => set("detection", v)} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            RPN preview:{" "}
            <span className="font-semibold text-foreground tabular-nums">
              {Number(form.severity) * Number(form.occurrence) * Number(form.detection)}
            </span>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fmea-status">Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v as FmeaStatus)}>
              <SelectTrigger id="fmea-status" className="h-9 rounded-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["OPEN", "MITIGATING", "ACCEPTED", "MITIGATED"] as FmeaStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="fmea-owner">Owner <span className="text-red-500">*</span></Label>
            <Input id="fmea-owner" value={form.owner} onChange={e => set("owner", e.target.value)} required className="rounded-none" />
          </div>
          {serverError && <p className="text-xs text-red-500">{serverError}</p>}
          <DialogFooter className="gap-2">
            <button type="button" className="aeos-btn aeos-btn-secondary" onClick={onClose} disabled={mutation.isPending}>Cancel</button>
            <button type="submit" className="aeos-btn aeos-btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : "Save Risk"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RiskDetailPanel({ risk }: { risk: FmeaRow }) {
  return (
    <div className="space-y-4">
      <div className={`rounded-none border-l-4 px-3 py-2 ${
        rpnTone(risk.rpn) === "green"
          ? "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
          : rpnTone(risk.rpn) === "amber"
            ? "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]"
            : "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">{risk.id}</div>
            <div className="text-sm font-semibold mt-0.5 break-words">{risk.agentName ?? risk.processScope}</div>
          </div>
          <Pill tone={rpnTone(risk.rpn)} className="shrink-0">RPN {risk.rpn}</Pill>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">{risk.processScope}</div>

      <div className="space-y-3 text-xs">
        {[
          ["Failure mode", risk.failureMode],
          ["Effect", risk.effect],
          ["Root cause", risk.rootCause],
          ["Mitigation", risk.mitigation],
        ].map(([label, text]) => (
          <div key={label}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
            <div className="text-sm leading-relaxed break-words">{text}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 min-w-0">
        <ScoreCell label="S" v={risk.severity} max={10} />
        <ScoreCell label="O" v={risk.occurrence} max={10} />
        <ScoreCell label="D" v={risk.detection} max={10} />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pt-2 border-t border-border/60 text-sm min-w-0">
        <span className="text-muted-foreground">Owner</span>
        <span className="font-semibold break-words">{risk.owner}</span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-sm min-w-0">
        <span className="text-muted-foreground">Status</span>
        <Pill tone={statusTone(risk.status)} className="w-fit">{risk.status}</Pill>
      </div>

      {risk.agentModel && (
        <div className="pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-[11px] min-w-0">
          {risk.agentModel && <><span className="text-muted-foreground">Model</span><span className="font-medium">{risk.agentModel}</span></>}
          {risk.agentHyperscaler && <><span className="text-muted-foreground">Hyperscaler</span><span className="font-medium">{risk.agentHyperscaler}</span></>}
          {risk.agentTrustTier && <><span className="text-muted-foreground">Trust tier</span><span className="font-medium">{risk.agentTrustTier}</span></>}
        </div>
      )}
    </div>
  );
}

export default function RiskAnalysis() {
  const [addOpen, setAddOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");

  const { data, isLoading, isError, error, refetch } = useQuery<{ ok: boolean; data: FmeaRow[]; error?: string }>({
    queryKey: ["/api/fmea"],
  });

  const { data: agentsData } = useQuery<{ id: number; name: string; agentId: string }[]>({
    queryKey: ["/api/agents"],
  });

  const risks: FmeaRow[] = data?.ok ? (data.data ?? []) : [];
  const agentList = (agentsData ?? []).map(a => ({ id: a.id, name: a.name }));

  const filtered = useMemo(() => {
    return risks.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q.trim()) return true;
      const blob = [r.id, r.processScope, r.failureMode, r.agentName ?? "", r.owner, r.status].join(" ").toLowerCase();
      return blob.includes(q.toLowerCase());
    });
  }, [risks, statusFilter, q]);

  const { selected: featured, select: selectRisk, id: selectedId } = useListSelection(
    filtered,
    (r) => r.id,
  );

  const total = risks.length;
  const critical = risks.filter(r => r.rpn >= 200).length;
  const open = risks.filter(r => r.status === "OPEN" || r.status === "MITIGATING").length;
  const mitigated = risks.filter(r => r.status === "MITIGATED" || r.status === "ACCEPTED" || r.status === "CLOSED").length;

  const statusCounts = useMemo(() => ({
    all: risks.length,
    OPEN: risks.filter(r => r.status === "OPEN").length,
    MITIGATING: risks.filter(r => r.status === "MITIGATING").length,
    MITIGATED: risks.filter(r => r.status === "MITIGATED").length,
    ACCEPTED: risks.filter(r => r.status === "ACCEPTED").length,
    CLOSED: risks.filter(r => r.status === "CLOSED").length,
  }), [risks]);

  const addButton = (
    <button type="button" className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark" onClick={() => setAddOpen(true)}>
      <Plus className="h-4 w-4" /> Add Risk
    </button>
  );

  const errorMessage = error instanceof Error ? error.message : data?.error;

  return (
    <>
      <AddRiskModal open={addOpen} onClose={() => setAddOpen(false)} agents={agentList} />
      <Layout
        title="Risk Analysis · FMEA Register"
        kicker="Governance / Risk"
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="blue" className="gap-1.5">
              <Activity className="h-3 w-3" />
              {isLoading ? "Loading…" : `${num(total, 0)} items`}
            </Pill>
            {addButton}
          </div>
        }
      >
        <div className="mb-5">
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Failure Mode and Effects Analysis — every potential agent failure scored by Severity × Occurrence × Detection.
            RPN ≥ 200 auto-opens a Six Sigma improvement project. Items are also auto-captured from policy blocks and trust demotions.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Pill tone="blue">ISO 42001 · EU AI Act Art. 9</Pill>
            <Pill tone="slate">S × O × D → RPN</Pill>
          </div>
        </div>

        {isError && (
          <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-destructive">Could not load risk register</div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {errorMessage ?? "Try refreshing the page or signing in again."}
                </div>
              </div>
              <button type="button" className="aeos-btn aeos-btn-secondary shrink-0 w-full sm:w-auto" onClick={() => refetch()}>
                Retry
              </button>
            </div>
          </div>
        )}

        {!isError && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <KpiCard label="TOTAL RISK ITEMS" value={total} sub="Across all processes" tone="primary" icon={<FileWarning className="h-4 w-4" />} />
              <KpiCard label="CRITICAL (RPN ≥ 200)" value={critical} sub="Auto-open Six Sigma projects" tone="red" icon={<AlertTriangle className="h-4 w-4" />} />
              <KpiCard label="OPEN / MITIGATING" value={open} sub="In active treatment" tone="amber" icon={<ShieldAlert className="h-4 w-4" />} />
              <KpiCard label="MITIGATED / ACCEPTED" value={mitigated} sub="Closed-loop validated" tone="green" icon={<CheckCircle2 className="h-4 w-4" />} />
            </div>

            {total > 0 && (
              <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">FMEA snapshot</div>
                  <div className="text-sm font-semibold text-foreground mt-1 break-words">
                    {critical} critical · {open} active · {mitigated} closed
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Highest RPN {Math.max(...risks.map(r => r.rpn), 0)} · {total} registered failure modes
                  </div>
                </div>
                <Pill tone={critical > 0 ? "red" : open > 0 ? "amber" : "green"}>
                  <StatusDot tone={critical > 0 ? "red" : open > 0 ? "amber" : "green"} />
                  {critical > 0 ? `${critical} critical` : open > 0 ? `${open} in treatment` : "Register healthy"}
                </Pill>
              </div>
            )}

            {total > 0 && (
              <SectionCard kicker="Risk heatmap" title="Severity × Occurrence (bubble size = Detection)" className="mb-6 min-w-0">
                <RiskHeatmap risks={risks} selectedId={String(selectedId ?? "")} onSelect={(id) => { const r = risks.find(x => x.id === id); if (r) selectRisk(r); }} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-[11px] text-muted-foreground border-t border-border/60 pt-3">
                  <span className="flex items-center gap-1.5"><StatusDot tone="red" /> Critical (RPN ≥ 200)</span>
                  <span className="flex items-center gap-1.5"><StatusDot tone="amber" /> High (100–199)</span>
                  <span className="flex items-center gap-1.5"><StatusDot tone="green" /> Acceptable (&lt;100)</span>
                  <span className="sm:ml-auto w-full sm:w-auto">Click a bubble to inspect · size = Detection difficulty</span>
                </div>
              </SectionCard>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start mb-6 min-w-0">
              <SectionCard
                className="min-w-0"
                kicker="FMEA register"
                title="All risk items"
                padding={false}
                action={
                  <div className="aeos-content-segment" role="tablist" aria-label="Status filter">
                    {STATUS_FILTERS.map(f => (
                      <button
                        key={f.value}
                        type="button"
                        role="tab"
                        onClick={() => setStatusFilter(f.value)}
                        className="aeos-content-segment-btn"
                        data-active={statusFilter === f.value ? "true" : "false"}
                        aria-selected={statusFilter === f.value}
                      >
                        {f.label}
                        <span className="ml-1 tabular-nums opacity-70">({statusCounts[f.value]})</span>
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="px-3 sm:px-5 py-3 border-b">
                  <label className="aeos-filter-search w-full max-w-none sm:max-w-sm">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <input
                      value={q}
                      onChange={e => setQ(e.target.value)}
                      placeholder="Search ID, agent, failure mode, owner…"
                    />
                  </label>
                </div>

                {isLoading ? (
                  <div className="px-5 py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading FMEA data…
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-sm text-muted-foreground mb-4">
                      {total === 0 ? "No risk items yet — add one manually, or they appear when governance policies block a decision." : "No items match this filter."}
                    </p>
                    {total === 0 && (
                      <button type="button" className="aeos-btn aeos-btn-primary" onClick={() => setAddOpen(true)}>
                        <Plus className="h-4 w-4" /> Add first risk item
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[40rem] xl:min-w-0">
                      <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
                        <tr>
                          <Th>ID</Th>
                          <Th>Agent · Process</Th>
                          <Th>Failure mode</Th>
                          <Th align="center">S</Th>
                          <Th align="center">O</Th>
                          <Th align="center">D</Th>
                          <Th align="right">RPN</Th>
                          <Th>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(r => (
                          <tr
                            key={r.id}
                            className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                              featured?.id === r.id ? "bg-primary/5" : ""
                            } ${r.rpn >= 200 ? "border-l-2 border-l-[hsl(0_72%_52%)]" : r.rpn >= 100 ? "border-l-2 border-l-[hsl(38_96%_50%)]" : "border-l-2 border-l-[hsl(142_70%_42%)]"}`}
                            onClick={() => selectRisk(r)}
                            data-testid={`row-fmea-${r.id}`}
                          >
                            <Td mono>{r.id}</Td>
                            <Td>
                              <div className="font-medium text-xs truncate max-w-[8rem] sm:max-w-[10rem]">{r.agentName ?? "—"}</div>
                              <div className="text-[10px] text-muted-foreground truncate max-w-[8rem] sm:max-w-[10rem]" title={r.processScope}>{r.processScope}</div>
                            </Td>
                            <Td className="max-w-[8rem] sm:max-w-[12rem] truncate" title={r.failureMode}>{r.failureMode}</Td>
                            <Td align="center">{r.severity}</Td>
                            <Td align="center">{r.occurrence}</Td>
                            <Td align="center">{r.detection}</Td>
                            <Td align="right"><Pill tone={rpnTone(r.rpn)}>{r.rpn}</Pill></Td>
                            <Td><Pill tone={statusTone(r.status)}>{r.status}</Pill></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>

              <SectionCard className="h-fit min-w-0" kicker="Risk detail" title={featured?.id ?? "Select a risk item"}>
                {!featured ? (
                  <p className="text-sm text-muted-foreground">
                    Click a heatmap bubble or table row to inspect failure mode, scores, and mitigation plan.
                  </p>
                ) : (
                  <RiskDetailPanel risk={featured} />
                )}
              </SectionCard>
            </div>
          </>
        )}
      </Layout>
    </>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "center" | "right" }) {
  return (
    <th className={`px-3 sm:px-4 py-2.5 font-semibold whitespace-nowrap ${
      align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
    }`}>
      {children}
    </th>
  );
}

function Td({ children, mono, align, className }: {
  children: React.ReactNode; mono?: boolean; align?: "center" | "right"; className?: string;
}) {
  return (
    <td className={`px-3 sm:px-4 py-2.5 align-top tabular-nums whitespace-nowrap ${align === "right" ? "text-right" : align === "center" ? "text-center" : ""} ${mono ? "font-mono text-[11px]" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}
