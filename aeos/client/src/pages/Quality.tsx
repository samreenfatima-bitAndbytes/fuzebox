import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Layout } from "@/components/Layout";
import { SectionCard, SectionTitle } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill, StatusDot } from "@/components/Pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ListChecks, BrainCircuit, Users, Bot, MessageSquareQuote,
  CheckCircle2, XCircle, Clock, Hourglass, Plus, ChevronDown, ChevronRight,
  Zap, Sparkles, Filter, Search, Slack, Cloud, ShieldCheck, History,
} from "lucide-react";
import { num, pct } from "@/lib/format";

// ============================================================================
// TYPES
// ============================================================================

type TaskStatus = "Completed" | "Failed" | "Running";
type TaskRow = {
  id: string;
  agent: string;
  task: string;
  status: TaskStatus;
  duration: string;
  timeSaved: string | null;
  timestamp: string;
};

type CanonicalEvent = {
  eventId: string;
  agentId: string;
  skill: string | null;
  passedThresholds: boolean;
  humanReview: string | null;
  wallMs: number;
  humanBaselineMinutes: number | null;
  capturedAt: string;
};

function wallMsToDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

function formatBaselineMinutes(min: number | null): string | null {
  if (min == null) return null;
  if (min < 60) return `${Math.round(min)}m`;
  const hrs = Math.floor(min / 60);
  const remMins = Math.round(min % 60);
  return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
}

function mapEventToRow(e: CanonicalEvent): TaskRow {
  let status: TaskStatus;
  if (e.humanReview === "pending") {
    status = "Running";
  } else if (e.passedThresholds) {
    status = "Completed";
  } else {
    status = "Failed";
  }
  return {
    id: e.eventId,
    agent: e.agentId,
    task: e.skill ?? "—",
    status,
    duration: wallMsToDuration(e.wallMs),
    timeSaved: formatBaselineMinutes(e.humanBaselineMinutes),
    timestamp: new Date(e.capturedAt).toUTCString().replace("GMT", "UTC"),
  };
}

const AGENT_NAMES = [
  "ATS & Candidate Data Quality Agent",
  "Interview Assessment & Rubric Agent",
  "Talent Acquisition Orchestrator",
  "Careers Site & Integrations Agent",
  "Hiring Compliance & Privacy Agent",
  "Recruiting Slack Agent",
  "Job Description & Offer Letter Agent",
  "Hiring Process Improvement Agent",
  "Resume & Application Review Agent",
  "Salesforce Recruiting (Agentforce) Agent",
  "Time-to-Hire & Pipeline Analytics Agent",
];

// AI Screening: histogram of GSTI scores 0–100 (binned in 10s)
const SCREENING_HIST = [
  { bin: "0–10", count: 2 },
  { bin: "10–20", count: 5 },
  { bin: "20–30", count: 9 },
  { bin: "30–40", count: 18 },
  { bin: "40–50", count: 31 },
  { bin: "50–60", count: 47 },
  { bin: "60–70", count: 68 }, // HITL gate band 60–70 mostly
  { bin: "70–80", count: 84 },
  { bin: "80–90", count: 41 },
  { bin: "90–100", count: 18 },
];
const SKILLS_FREQ = [
  { skill: "TypeScript", count: 218 },
  { skill: "React", count: 207 },
  { skill: "Node.js", count: 184 },
  { skill: "AWS", count: 152 },
  { skill: "Postgres", count: 138 },
  { skill: "GraphQL", count: 102 },
  { skill: "Python", count: 96 },
  { skill: "Kubernetes", count: 71 },
  { skill: "Tailwind", count: 64 },
  { skill: "Rust", count: 22 },
];

// Team Reviews — HITL gate decisions
type ReviewEvent = {
  eventId: string;
  agentId: string;
  skill: string | null;
  confidence: number | null;
  humanReview: string | null;
  policyOutcome: string | null;
  trustTier: string | null;
  capturedAt: string;
  humanUserId: string | null;
  reviewerName: string | null;
};

type ReviewerStat = {
  name: string;
  reviewed: number;
  advanceRate: number;
  calibration: "On" | "Drift";
};

// Agent Registry — fused AgentFuze + Otto fields
type AgentRow = {
  name: string;
  model: "Claude Sonnet 4" | "Claude Opus 4" | "GPT-4o" | "Gemini 2.5";
  trust: "L1 Supervised" | "L2 Guided" | "L3 Trusted" | "L4 Autonomous";
  gsti: number;        // 0–100
  successRate: number; // 0–1
  runs: number;
  hoursSaved: number;
  active: boolean;
};
const AGENTS: AgentRow[] = [
  { name: "Talent Acquisition Orchestrator",      model: "Claude Sonnet 4", trust: "L4 Autonomous", gsti: 94, successRate: 0.982, runs: 1247, hoursSaved: 20.6, active: true },
  { name: "Resume & Application Review Agent",    model: "Claude Sonnet 4", trust: "L4 Autonomous", gsti: 91, successRate: 0.971, runs:  892, hoursSaved: 20.4, active: true },
  { name: "Interview Assessment & Rubric Agent",  model: "Claude Opus 4",   trust: "L3 Trusted",    gsti: 88, successRate: 0.968, runs:  634, hoursSaved: 12.5, active: true },
  { name: "Recruiting Slack Agent",               model: "GPT-4o",          trust: "L3 Trusted",    gsti: 82, successRate: 0.945, runs:  456, hoursSaved: 15.3, active: true },
  { name: "Hiring Compliance & Privacy Agent",    model: "Claude Sonnet 4", trust: "L2 Guided",     gsti: 79, successRate: 0.893, runs:  348, hoursSaved: 18.1, active: true },
  { name: "Careers Site & Integrations Agent",    model: "GPT-4o",          trust: "L2 Guided",     gsti: 76, successRate: 0.917, runs:  302, hoursSaved: 18.3, active: true },
  { name: "ATS & Candidate Data Quality Agent",   model: "Claude Opus 4",   trust: "L1 Supervised", gsti: 71, successRate: 0.872, runs:  221, hoursSaved: 19.2, active: true },
  { name: "Time-to-Hire & Pipeline Analytics",    model: "Claude Sonnet 4", trust: "L1 Supervised", gsti: 68, successRate: 0.856, runs:  198, hoursSaved: 14.6, active: false },
];


// ============================================================================
// MAIN PAGE
// ============================================================================

const SUBTABS = [
  { key: "tasks",    label: "Task Log",       icon: ListChecks },
  { key: "screen",   label: "AI Screening",   icon: BrainCircuit },
  { key: "reviews",  label: "Team Reviews",   icon: Users },
  { key: "history",  label: "Audit History",  icon: History },
  { key: "agents",   label: "Agent Registry", icon: Bot },
  { key: "outreach", label: "Outreach QA",    icon: MessageSquareQuote },
] as const;
type SubTab = typeof SUBTABS[number]["key"];

export default function Quality() {
  const [tab, setTab] = useState<SubTab>("tasks");
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Layout
      title="Quality"
      kicker="QUALITY · Tasks, screening, reviews, agents & customer comms"
      headerRight={
        <button type="button" className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark" onClick={() => setCreateOpen(true)} data-testid="button-new-task">
          <Plus className="h-4 w-4" /> New task
        </button>
      }
    >
      {/* KPI strip — always visible above sub-tabs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <KpiCard label="TOTAL TASKS"    value="586"    tone="primary" icon={<ListChecks className="h-4 w-4" />} sub="last 30 days" />
        <KpiCard label="COMPLETED"      value="442"    tone="green"   icon={<CheckCircle2 className="h-4 w-4" />} sub="75.4% success" />
        <KpiCard label="FAILED"         value="57"     tone="red"     icon={<XCircle className="h-4 w-4" />}      sub="9.7% — most retryable" />
        <KpiCard label="RUNNING"        value="87"     tone="amber"   icon={<Hourglass className="h-4 w-4" />}    sub="14.8% in-flight" />
        <KpiCard label="TIME SAVED"     value="195h"   tone="primary" icon={<Clock className="h-4 w-4" />}        sub="$12K cost avoided" />
        <KpiCard label="AVG GSTI"       value="83.4"   tone="green"   icon={<ShieldCheck className="h-4 w-4" />}  sub="trust index, agent fleet" />
      </div>

      {/* Sub-tab strip */}
      <div className="mb-5">
        <Tabs value={tab} onValueChange={(v) => setTab(v as SubTab)}>
          <TabsList className="bg-card border h-auto p-1">
            {SUBTABS.map(s => {
              const Icon = s.icon;
              return (
                <TabsTrigger key={s.key} value={s.key} className="gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" data-testid={`subtab-${s.key}`}>
                  <Icon className="h-4 w-4" />
                  {s.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </div>

      {/* Sub-tab content */}
      {tab === "tasks"    && <TaskLogView onCreate={() => setCreateOpen(true)} />}
      {tab === "screen"   && <AIScreeningView />}
      {tab === "reviews"  && <TeamReviewsView />}
      {tab === "history"  && <AuditHistoryView />}
      {tab === "agents"   && <AgentRegistryView />}
      {tab === "outreach" && <OutreachView />}

      <CreateTaskModal open={createOpen} onOpenChange={setCreateOpen} />
    </Layout>
  );
}

// ============================================================================
// 1. TASK LOG
// ============================================================================

function TaskLogView({ onCreate }: { onCreate: () => void }) {
  const { data: events, isLoading, isError } = useQuery<CanonicalEvent[]>({
    queryKey: ["/api/observation/events"],
  });

  const allTasks = useMemo(
    () => (events ?? []).map(mapEventToRow),
    [events],
  );

  const [filter, setFilter] = useState<"all" | TaskStatus>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;

  const filtered = allTasks.filter(t => {
    if (filter !== "all" && t.status !== filter) return false;
    if (query && !`${t.agent} ${t.task}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const tasks = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const counts = {
    all:       allTasks.length,
    Completed: allTasks.filter(t => t.status === "Completed").length,
    Failed:    allTasks.filter(t => t.status === "Failed").length,
    Running:   allTasks.filter(t => t.status === "Running").length,
  };

  return (
    <SectionCard
      kicker="EXECUTION LOG"
      title="Task runs across the agent fleet"
      action={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-background text-xs">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search agent or task…"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(0); }}
              className="bg-transparent outline-none w-48 placeholder:text-muted-foreground"
              data-testid="input-task-search"
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-3.5 w-3.5 mr-1.5" /> Filter
          </Button>
          <Button size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4 mr-1" /> New task
          </Button>
        </div>
      }
      padding={false}
    >
      <div className="px-5 pt-4 pb-3 flex flex-wrap items-center gap-2 border-b">
        {(["all", "Completed", "Failed", "Running"] as const).map(s => (
          <button
            key={s}
            onClick={() => { setFilter(s); setPage(0); }}
            data-testid={`filter-${s}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filter === s
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {s === "all" ? "All" : s} <span className="opacity-70 ml-1 tabular-nums">{counts[s]}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">Loading task log…</div>
        ) : isError ? (
          <div className="px-5 py-12 text-center text-sm text-destructive">Failed to load task log.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[.14em] text-muted-foreground border-b">
                <th className="text-left px-5 py-3 font-semibold">Agent</th>
                <th className="text-left px-3 py-3 font-semibold">Task</th>
                <th className="text-left px-3 py-3 font-semibold">Status</th>
                <th className="text-right px-3 py-3 font-semibold">Duration</th>
                <th className="text-right px-3 py-3 font-semibold">Time saved</th>
                <th className="text-right px-5 py-3 font-semibold">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-task-${t.id}`}>
                  <td className="px-5 py-3 font-medium text-foreground">{t.agent}</td>
                  <td className="px-3 py-3 text-muted-foreground">{t.task}</td>
                  <td className="px-3 py-3">
                    {t.status === "Completed" && <Pill tone="green"><StatusDot tone="green" /> Completed</Pill>}
                    {t.status === "Failed"    && <Pill tone="red"><StatusDot tone="red" /> Failed</Pill>}
                    {t.status === "Running"   && <Pill tone="blue"><StatusDot tone="blue" /> Running / Held</Pill>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{t.duration}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground">{t.timeSaved ?? "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-muted-foreground text-xs">{t.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && !isError && tasks.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">No tasks match these filters.</div>
        )}
      </div>

      <div className="px-5 py-3 flex items-center justify-between text-xs text-muted-foreground border-t">
        <span>
          Showing {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} tasks
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>
    </SectionCard>
  );
}

// ============================================================================
// 2. AI SCREENING — histogram + skills frequency
// ============================================================================

type ScreeningData = {
  histogram: { bin: string; count: number }[];
  totalCandidates: number;
  hitlAwaiting: number;
  reviewerAlignment: number | null;
  skills: { skill: string; count: number }[];
};

const SCREENING_HIST_FALLBACK = [
  { bin: "0–10", count: 0 }, { bin: "10–20", count: 0 }, { bin: "20–30", count: 0 },
  { bin: "30–40", count: 0 }, { bin: "40–50", count: 0 }, { bin: "50–60", count: 0 },
  { bin: "60–70", count: 0 }, { bin: "70–80", count: 0 }, { bin: "80–90", count: 0 },
  { bin: "90–100", count: 0 },
];

function AIScreeningView() {
  const { data, isLoading } = useQuery<ScreeningData>({
    queryKey: ["/api/observation/screening"],
  });

  const histogram = data?.histogram ?? SCREENING_HIST_FALLBACK;
  const totalCandidates = data?.totalCandidates ?? 0;
  const hitlAwaiting = data?.hitlAwaiting ?? 0;
  const reviewerAlignment = data?.reviewerAlignment;
  const skills = data?.skills ?? [];

  const maxHist = Math.max(1, ...histogram.map(b => b.count));
  const maxSkill = Math.max(1, ...skills.map(s => s.count));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Histogram */}
      <SectionCard
        className="lg:col-span-2"
        kicker="DISTRIBUTION"
        title="AI screening score histogram"
        action={<Pill tone="blue">{num(totalCandidates, 0)} candidates</Pill>}
      >
        <div className="grid grid-cols-10 gap-2 items-end" style={{ height: 220 }}>
          {histogram.map(b => {
            const isHITL = b.bin === "60–70";
            const h = (b.count / maxHist) * 100;
            return (
              <div key={b.bin} className="flex flex-col items-center justify-end gap-1.5 h-full">
                <div className="text-[10px] tabular-nums text-muted-foreground font-semibold">{b.count}</div>
                <div
                  className="w-full rounded-md transition-all"
                  style={{
                    height: `${Math.max(h, 2)}%`,
                    background: isHITL ? "hsl(38 96% 60%)" : "hsl(213 84% 56%)",
                    boxShadow: isHITL ? "0 0 0 2px hsl(38 96% 60% / 0.25)" : undefined,
                  }}
                  title={`${b.bin}: ${b.count}`}
                />
                <div className="text-[10px] text-muted-foreground tabular-nums">{b.bin}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(213 84% 56%)" }} />Auto-classified</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(38 96% 60%)" }} />HITL gate (60–70)</span>
          <span className="ml-auto">Threshold: advance ≥ 70 · reject &lt; 50 · review 50–69</span>
        </div>
      </SectionCard>

      {/* HITL gate counter */}
      <SectionCard kicker="HITL GATE" title="Awaiting human review">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="text-5xl font-bold text-foreground tabular-nums">{hitlAwaiting}</div>
            <div className="text-xs text-muted-foreground mt-1">candidates in 60–70 score band</div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reviewer alignment</span>
                <span className="font-semibold tabular-nums">
                  {reviewerAlignment != null ? pct(reviewerAlignment, 1) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">SLA breach risk</span><Pill tone="amber">2 today</Pill></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Auto-routed channel</span><Pill tone="blue"><Slack className="h-3 w-3" /> #hitl-recruiting</Pill></div>
            </div>
            <Button variant="outline" size="sm" className="w-full mt-4">Open review queue <ChevronRight className="h-3.5 w-3.5 ml-1" /></Button>
          </>
        )}
      </SectionCard>

      {/* Skills frequency */}
      <SectionCard className="lg:col-span-3" kicker="SKILL COVERAGE" title="Top skills detected across qualified pool">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : skills.length === 0 ? (
          <div className="text-sm text-muted-foreground">No skill data available.</div>
        ) : (
          <div className="space-y-2.5">
            {skills.map(s => (
              <div key={s.skill} className="flex items-center gap-3">
                <div className="text-sm font-medium w-28 shrink-0">{s.skill}</div>
                <div className="flex-1 h-6 rounded-md bg-muted relative overflow-hidden">
                  <div
                    className="h-full rounded-md transition-all"
                    style={{ width: `${(s.count / maxSkill) * 100}%`, background: "hsl(213 84% 56%)" }}
                  />
                </div>
                <div className="text-sm tabular-nums w-12 text-right text-muted-foreground">{s.count}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ============================================================================
// 3. TEAM REVIEWS — HITL decisions + reviewer summary
// ============================================================================

function TeamReviewsView() {
  const queryClient = useQueryClient();
  const { data: events, isLoading, isError } = useQuery<ReviewEvent[]>({
    queryKey: ["/api/governance/reviews"],
  });

  const { data: perfStats, isLoading: perfLoading } = useQuery<ReviewerStat[]>({
    queryKey: ["/api/governance/performance"],
  });

  const decide = useMutation({
    mutationFn: ({ taskId, decision }: { taskId: string; decision: "Advance" | "Reject" | "Hold" }) =>
      apiRequest("POST", `/api/governance/reviews/${taskId}/decide`, { decision }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/governance/reviews"] }),
  });

  const pending = (events ?? []).filter(e => e.humanReview === "queued" || e.humanReview === "pending");
  const decided = (events ?? []).filter(e => e.humanReview === "verified" || e.humanReview === "rejected");

  function decisionPill(hr: string | null) {
    if (hr === "verified")  return <Pill tone="green">Advance</Pill>;
    if (hr === "rejected")  return <Pill tone="red">Reject</Pill>;
    if (hr === "pending")   return <Pill tone="amber">Hold</Pill>;
    return <Pill tone="blue">Queued</Pill>;
  }

  function aiScoreDisplay(confidence: number | null) {
    if (confidence == null) return "—";
    return Math.round(confidence * 100).toString();
  }

  const allRows = [...pending, ...decided];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <SectionCard className="lg:col-span-2" kicker="REVIEW QUEUE" title="Escalated & blocked tasks awaiting human decision" padding={false}>
        {isLoading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">Loading review queue…</div>
        ) : isError ? (
          <div className="px-5 py-12 text-center text-sm text-destructive">Failed to load review queue.</div>
        ) : allRows.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">No escalated items — queue is clear.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[.14em] text-muted-foreground border-b">
                  <th className="text-left px-5 py-3 font-semibold">Candidate / Context</th>
                  <th className="text-left px-3 py-3 font-semibold">Role</th>
                  <th className="text-right px-3 py-3 font-semibold">AI Score</th>
                  <th className="text-left px-3 py-3 font-semibold">Reviewer</th>
                  <th className="text-left px-3 py-3 font-semibold">Decision</th>
                  <th className="text-left px-3 py-3 font-semibold">Aligned</th>
                  <th className="text-right px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map(e => {
                  const isPending = e.humanReview === "queued" || e.humanReview === "pending";
                  const isDeciding = decide.isPending && (decide.variables as any)?.taskId === e.eventId;
                  const aligned = e.humanReview === "verified" && (e.confidence ?? 0) >= 0.7;
                  return (
                    <tr key={e.eventId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3 font-medium text-foreground max-w-[180px] truncate">{e.agentId}</td>
                      <td className="px-3 py-3 text-muted-foreground max-w-[140px] truncate">{e.skill ?? "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold">{aiScoreDisplay(e.confidence)}</td>
                      <td className="px-3 py-3 text-muted-foreground">{e.reviewerName ?? "—"}</td>
                      <td className="px-3 py-3">{decisionPill(e.humanReview)}</td>
                      <td className="px-3 py-3">
                        {!isPending
                          ? aligned
                            ? <Pill tone="blue">Yes</Pill>
                            : <Pill tone="amber">Override</Pill>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-green-500 text-green-600 hover:bg-green-50"
                              disabled={isDeciding}
                              onClick={() => decide.mutate({ taskId: e.eventId, decision: "Advance" })}
                            >
                              Advance
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-red-400 text-red-600 hover:bg-red-50"
                              disabled={isDeciding}
                              onClick={() => decide.mutate({ taskId: e.eventId, decision: "Reject" })}
                            >
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {new Date(e.capturedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard kicker="REVIEWER PERFORMANCE" title="Alignment with AI recommendation">
        {perfLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading reviewer stats…</div>
        ) : !perfStats || perfStats.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No reviewer decisions recorded yet. Stats will appear once reviewers start processing the queue.
          </div>
        ) : (
          <div className="space-y-4">
            {perfStats.map(r => (
              <div key={r.name} className="rounded-lg border p-3 bg-background/40">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="font-semibold text-sm">{r.name}</div>
                  <Pill tone={r.calibration === "On" ? "green" : "amber"}>
                    Calibration · {r.calibration}
                  </Pill>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-muted-foreground">Reviewed</div>
                    <div className="font-semibold text-base tabular-nums">{r.reviewed}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Advance rate</div>
                    <div className="font-semibold text-base tabular-nums">{pct(r.advanceRate, 1)}</div>
                  </div>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${r.advanceRate * 100}%`,
                      background: r.advanceRate >= 0.9 ? "hsl(142 70% 42%)" : "hsl(38 96% 50%)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// ============================================================================
// 4. AUDIT HISTORY
// ============================================================================

type AuditEvent = {
  eventId: string;
  agentId: string;
  skill: string | null;
  confidence: number | null;
  humanReview: string | null;
  capturedAt: string;
  humanUserId: string | null;
  reviewerName: string | null;
};

function AuditHistoryView() {
  const { data: events, isLoading, isError } = useQuery<AuditEvent[]>({
    queryKey: ["/api/governance/history"],
  });

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  const rows = (events ?? []).filter(e => {
    if (!query) return true;
    return `${e.eventId} ${e.skill ?? ""} ${e.agentId} ${e.reviewerName ?? ""}`.toLowerCase().includes(query.toLowerCase());
  });

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const advanceCount = (events ?? []).filter(e => e.humanReview === "verified").length;
  const rejectCount  = (events ?? []).filter(e => e.humanReview === "rejected").length;

  return (
    <SectionCard
      kicker="AUDIT LOG"
      title="Completed review decisions"
      action={
        <div className="flex items-center gap-2">
          <Pill tone="green">{advanceCount} Advanced</Pill>
          <Pill tone="red">{rejectCount} Rejected</Pill>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border bg-background text-xs">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search event, skill, reviewer…"
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(0); }}
              className="bg-transparent outline-none w-44 placeholder:text-muted-foreground"
            />
          </div>
        </div>
      }
      padding={false}
    >
      {isLoading ? (
        <div className="px-5 py-12 text-center text-sm text-muted-foreground">Loading audit history…</div>
      ) : isError ? (
        <div className="px-5 py-12 text-center text-sm text-destructive">Failed to load audit history.</div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-12 text-center text-sm text-muted-foreground">
          No completed decisions yet — advance or reject items from the Team Reviews queue to see them here.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-[.14em] text-muted-foreground border-b">
                  <th className="text-left px-5 py-3 font-semibold">Event ID</th>
                  <th className="text-left px-3 py-3 font-semibold">Skill</th>
                  <th className="text-left px-3 py-3 font-semibold">Reviewer</th>
                  <th className="text-right px-3 py-3 font-semibold">AI Score</th>
                  <th className="text-left px-3 py-3 font-semibold">Decision</th>
                  <th className="text-right px-5 py-3 font-semibold">Date / Time</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(e => (
                  <tr key={e.eventId} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{e.eventId}</td>
                    <td className="px-3 py-3 max-w-[160px] truncate">{e.skill ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-3 text-muted-foreground">{e.reviewerName ?? <span className="italic text-muted-foreground/60">system</span>}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {e.confidence != null ? Math.round(e.confidence * 100) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {e.humanReview === "verified"
                        ? <Pill tone="green"><CheckCircle2 className="h-3 w-3" /> Advance</Pill>
                        : <Pill tone="red"><XCircle className="h-3 w-3" /> Reject</Pill>}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-xs text-muted-foreground">
                      {new Date(e.capturedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 flex items-center justify-between text-xs text-muted-foreground border-t">
            <span>
              Showing {rows.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, rows.length)} of {rows.length} records
            </span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" disabled={safePage === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ============================================================================
// 6. AGENT REGISTRY (was 4, shifted by Audit History insertion)
// ============================================================================

type RegistryAgent = {
  agentId: string;
  name: string;
  model: string | null;
  trustTier: string;
  status: string;
  totalRuns: number;
  successRate: number;
  hoursSaved: number;
};

function trustTierLabel(tier: string): string {
  if (tier === "T4_autonomous") return "Autonomous";
  if (tier === "T3_trusted")    return "Trusted";
  if (tier === "T2_supervised") return "Supervised";
  if (tier === "T1_observed")   return "Observed";
  return "Unverified";
}

function trustTierTone(tier: string): "green" | "blue" | "amber" | "slate" {
  if (tier === "T4_autonomous") return "green";
  if (tier === "T3_trusted")    return "blue";
  if (tier === "T2_supervised") return "amber";
  return "slate";
}

function AgentRegistryView() {
  const { data: agents, isLoading, isError } = useQuery<RegistryAgent[]>({
    queryKey: ["/api/observation/registry"],
  });

  const list = agents ?? [];

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Loading agent registry…</div>;
  }
  if (isError) {
    return <div className="py-12 text-center text-sm text-destructive">Failed to load agent registry.</div>;
  }

  return (
    <div>
      <SectionTitle>FLEET · {list.length} AGENTS</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map(a => {
          const ttTone = trustTierTone(a.trustTier);
          const ttLabel = trustTierLabel(a.trustTier);
          const model = a.model ?? "Unknown";
          const modelTone: "blue" | "amber" | "slate" =
            model.toLowerCase().includes("claude") ? "blue" :
            model.toLowerCase().includes("gpt") ? "amber" : "slate";
          const isActive = a.status === "green";
          return (
            <div key={a.agentId} className="rounded-xl border bg-card p-4 ecl-card-shadow flex flex-col gap-3" data-testid={`agent-${a.name}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground mb-1">FUZEBOX AGENT</div>
                  <div className="font-semibold text-sm truncate">{a.name}</div>
                </div>
                <div className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${isActive ? "bg-[hsl(142_72%_92%)] text-[hsl(142_70%_30%)]" : "bg-muted text-muted-foreground"}`}>
                  <Bot className="h-4 w-4" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone={modelTone}>
                  {model.toLowerCase().includes("claude") && <Sparkles className="h-3 w-3" />}
                  {model.toLowerCase().includes("gpt") && <Cloud className="h-3 w-3" />}
                  {model}
                </Pill>
                <Pill tone={ttTone as any}>{ttLabel}</Pill>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t">
                <div>
                  <div className="text-muted-foreground">Success</div>
                  <div className="font-semibold tabular-nums">{pct(a.successRate, 1)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground"><Zap className="h-3 w-3 inline" /> Runs</div>
                  <div className="font-semibold tabular-nums">{num(a.totalRuns, 0)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground"><Clock className="h-3 w-3 inline" /> Saved</div>
                  <div className="font-semibold tabular-nums">{a.hoursSaved}h</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// 5. OUTREACH QA
// ============================================================================

type OutreachDraft = {
  id: string;
  candidateName: string;
  channel: string;
  messageText: string;
  personalizationScore: number;
  status: "Sent" | "Awaiting review";
  capturedAt: string;
  humanReview: string | null;
};

type OutreachData = {
  drafts: OutreachDraft[];
  kpis: {
    draftsThisWeek: number;
    avgPersonalization: number;
    flaggedForReview: number;
    channelMix: { LinkedIn: number; Email: number; Slack: number };
  };
};

function OutreachView() {
  const { data, isLoading, isError } = useQuery<OutreachData>({
    queryKey: ["/api/observation/outreach"],
  });

  const drafts = data?.drafts ?? [];
  const kpis = data?.kpis;

  const draftsThisWeek = kpis?.draftsThisWeek ?? 0;
  const avgPersonalization = kpis?.avgPersonalization ?? 0;
  const flaggedForReview = kpis?.flaggedForReview ?? 0;
  const channelMix = kpis?.channelMix ?? { LinkedIn: 58, Email: 34, Slack: 8 };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <SectionCard className="lg:col-span-2" kicker="DRAFTS" title="AI-drafted outreach pending or sent">
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading outreach drafts…</div>
        ) : isError ? (
          <div className="py-8 text-center text-sm text-destructive">Failed to load outreach data.</div>
        ) : drafts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No outreach events found.</div>
        ) : (
          <div className="space-y-3">
            {drafts.map(o => {
              const tone = o.personalizationScore >= 0.85 ? "green" : o.personalizationScore >= 0.7 ? "blue" : "amber";
              return (
                <div key={o.id} className="rounded-lg border p-4 hover:bg-muted/20 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{o.candidateName}</div>
                      <div className="text-xs text-muted-foreground">{o.channel}</div>
                    </div>
                    <Pill tone={tone as any}>
                      {pct(o.personalizationScore, 0)} personalized
                    </Pill>
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed line-clamp-2 mb-2">"{o.messageText}"</p>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {new Date(o.capturedAt).toLocaleDateString()}
                    </span>
                    <Pill tone={o.status === "Sent" ? "green" : "blue"}>
                      {o.status}
                    </Pill>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard kicker="OUTREACH SUMMARY" title="Quality at a glance">
        <div className="space-y-4">
          <Stat label="Drafts this week"    value={String(draftsThisWeek)}         sub="last 7 days" />
          <Stat label="Avg personalization" value={pct(avgPersonalization, 1)}      sub="threshold: 75%" />
          <Stat label="Reply rate"          value="22.4%"                           sub="industry: 8–12%" />
          <Stat label="Flagged for review"  value={String(flaggedForReview)}        sub="low personalization" tone={flaggedForReview > 0 ? "amber" : "default"} />
          <Stat label="Sent without edit"   value="71%"                             sub="human-approved drafts" />
        </div>
        <div className="mt-5 pt-4 border-t">
          <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground mb-2">CHANNEL MIX</div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
            <div style={{ width: `${channelMix.LinkedIn}%`, background: "hsl(213 84% 56%)" }} title={`LinkedIn ${channelMix.LinkedIn}%`} />
            <div style={{ width: `${channelMix.Email}%`,    background: "hsl(170 70% 45%)" }} title={`Email ${channelMix.Email}%`} />
            <div style={{ width: `${channelMix.Slack}%`,    background: "hsl(38 96% 50%)"  }} title={`Slack ${channelMix.Slack}%`} />
          </div>
          <div className="flex items-center justify-between text-[11px] mt-2 text-muted-foreground">
            <span>LinkedIn {channelMix.LinkedIn}%</span>
            <span>Email {channelMix.Email}%</span>
            <span>Slack {channelMix.Slack}%</span>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function Stat({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: "default" | "amber" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70">{sub}</div>}
      </div>
      <div className={`text-xl font-bold tabular-nums ${tone === "amber" ? "text-[hsl(28_90%_38%)]" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

// ============================================================================
// CREATE TASK MODAL
// ============================================================================

const TEMPLATES = [
  { id: "slack-reminder",     name: "Interview reminder",      platform: "SLACK"      as const, desc: "Post same-day interview reminder to hiring channel", channel: "#hiring", message: "Reminder: interview today at {{time}} for {{candidate}} — {{role}}. Loop links in thread." },
  { id: "slack-status",       name: "Candidate status update", platform: "SLACK"      as const, desc: "Short pipeline update for recruiters + hiring managers", channel: "#hiring", message: "Pipeline update — {{role}}: {{advanced}} advanced, {{declined}} declined, {{pending}} pending review." },
  { id: "slack-ops",          name: "TA ops note",             platform: "SLACK"      as const, desc: "Lightweight note to talent team (intake/scheduling)", channel: "#ta-ops", message: "Heads up: scheduling capacity tight Thursday — please pre-book with HMs by EOD Tuesday." },
  { id: "af-screen",          name: "Screen applicants",       platform: "AGENTFORCE" as const, desc: "Compare applicants against must-haves" },
  { id: "af-schedule",        name: "Interview brief",         platform: "AGENTFORCE" as const, desc: "Draft schedule constraints/outline" },
  { id: "af-outreach",        name: "Candidate outreach draft",platform: "AGENTFORCE" as const, desc: "Polite first outreach for passive candidate" },
];

function CreateTaskModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [showTemplates, setShowTemplates] = useState(true);
  const [selected, setSelected] = useState<typeof TEMPLATES[number] | null>(null);
  const [agent, setAgent] = useState<string>("");
  const [capability, setCapability] = useState<string>("");
  const [channel, setChannel] = useState("#hiring");
  const [message, setMessage] = useState("");
  const [autoExecute, setAutoExecute] = useState(true);

  const isSlack = selected?.platform === "SLACK";
  const isAF    = selected?.platform === "AGENTFORCE";
  const required = !!agent && !!capability && (!isSlack || (!!channel && !!message));

  const pickTemplate = (t: typeof TEMPLATES[number]) => {
    setSelected(t);
    if (t.platform === "SLACK") {
      setAgent("Recruiting Slack Agent");
      setCapability("send_slack_message");
      setChannel(t.channel ?? "#hiring");
      setMessage(t.message ?? "");
    } else {
      setAgent("Salesforce Recruiting (Agentforce) Agent");
      setCapability("agentforce_invoke");
      setMessage("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>Slack or Agentforce — same flow as the legacy Tasks page</DialogDescription>
        </DialogHeader>

        {/* Templates accordion */}
        <div className="border rounded-lg">
          <button
            type="button"
            onClick={() => setShowTemplates(s => !s)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 text-sm font-semibold hover:bg-muted/40"
            data-testid="toggle-templates"
          >
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Recruiting templates</span>
            {showTemplates ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {showTemplates && (
            <div className="border-t p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className={`text-left rounded-md border p-2.5 hover:bg-muted/40 transition-colors ${selected?.id === t.id ? "ring-2 ring-primary border-primary" : ""}`}
                  data-testid={`template-${t.id}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="text-sm font-semibold">{t.name}</div>
                    <Pill tone={t.platform === "SLACK" ? "blue" : "amber"}>{t.platform}</Pill>
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{t.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Form */}
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Agent <span className="text-destructive">*</span></Label>
            <Select value={agent} onValueChange={setAgent}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Choose agent" /></SelectTrigger>
              <SelectContent>
                {AGENT_NAMES.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Capability <span className="text-destructive">*</span></Label>
            <Input value={capability} onChange={e => setCapability(e.target.value)} placeholder="e.g., send_slack_message" className="mt-1" />
          </div>

          {isSlack && (
            <>
              <div>
                <Label className="text-xs">Channel <span className="text-destructive">*</span></Label>
                <Input value={channel} onChange={e => setChannel(e.target.value)} placeholder="#hiring" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Message <span className="text-destructive">*</span></Label>
                <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Type the Slack message…" rows={4} className="mt-1" />
              </div>
            </>
          )}

          {isAF && (
            <div>
              <Label className="text-xs">Brief / instruction</Label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe the goal — e.g., compare 12 applicants against must-have skills for Senior PM" rows={4} className="mt-1" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">User ID</Label>
              <Select defaultValue="user-001">
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user-001">user-001</SelectItem>
                  <SelectItem value="user-002">user-002</SelectItem>
                  <SelectItem value="user-003">user-003</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Team ID</Label>
              <Select defaultValue="team-001">
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="team-001">team-001</SelectItem>
                  <SelectItem value="team-002">team-002</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
            <Checkbox checked={autoExecute} onCheckedChange={(v) => setAutoExecute(!!v)} />
            <span>Auto-execute after create</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-task-cancel">Cancel</Button>
          <Button disabled={!required} onClick={() => onOpenChange(false)} data-testid="button-task-create">Create &amp; run</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
