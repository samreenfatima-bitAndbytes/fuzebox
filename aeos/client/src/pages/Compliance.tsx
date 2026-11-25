import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill, StatusDot } from "@/components/Pill";
import {
  BadgeCheck, FileText, ShieldCheck, Download, ArrowRight,
  CheckCircle2, AlertTriangle, Clock, Activity,
} from "lucide-react";
import { pct } from "@/lib/format";
import { useListSelection } from "@/hooks/use-list-selection";

type Status = "PASS" | "PARTIAL" | "NOT STARTED";
type Framework = "ISO 42001" | "EU AI Act";
type StatusFilter = "all" | Status;
type FrameworkFilter = "all" | Framework;

type Control = {
  id: string;
  name: string;
  framework: Framework;
  status: Status;
  note: string;
  remediation?: string;
};

const CONTROLS: Control[] = [
  { id: "6.1.1", framework: "ISO 42001", name: "AI risk-assessment framework", status: "PASS", note: "FMEA register active across 7 processes" },
  { id: "6.1.3", framework: "ISO 42001", name: "Risk-treatment plan", status: "PASS", note: "10 mitigations tracked, 2 closed" },
  { id: "7.5", framework: "ISO 42001", name: "Documented information", status: "PASS", note: "Decisions chained on Predictive Ledger" },
  { id: "8.1", framework: "ISO 42001", name: "Operational planning & control", status: "PASS", note: "Build-vs-buy + maturity scoring documented" },
  { id: "9.1", framework: "ISO 42001", name: "Performance evaluation", status: "PASS", note: "Six Sigma rollups every 60 min" },
  { id: "10.1", framework: "ISO 42001", name: "Continual improvement", status: "PASS", note: "Recommendations engine drives weekly cadence" },
  { id: "Art. 9", framework: "EU AI Act", name: "Risk management system", status: "PASS", note: "FMEA register feeds Article 9 controls" },
  {
    id: "Art. 13", framework: "EU AI Act", name: "Transparency & user information", status: "PARTIAL",
    note: "Customer-facing disclosures missing on 2 channels",
    remediation: "Publish AI disclosure copy on web chat and email auto-reply surfaces.",
  },
  {
    id: "Art. 14", framework: "EU AI Act", name: "Human oversight", status: "PARTIAL",
    note: "3 unreviewed-decision gaps (HIGH risk)",
    remediation: "Clear human review queue in Oversight; resolve HIGH-risk agent gaps.",
  },
  {
    id: "Art. 15", framework: "EU AI Act", name: "Accuracy, robustness, security", status: "NOT STARTED",
    note: "Adversarial-test program kicks off Q2",
    remediation: "Schedule red-team sprint and document robustness KPIs before Q2 gate.",
  },
];

const HITL_EVIDENCE = [
  {
    process: "Sports Betting Analyst",
    agent: "Recommendation Writer",
    decisionId: "DEC-2614",
    auditId: "AUD-2614",
    decision: "Reprice NFL parlay (Steelers vs Ravens) — $2,400 payout",
    review: "Marcus Webb · OVERRIDDEN — hallucinated odds outside book range",
    outcome: "Override saved $2,400 leakage; FMEA-101 opened with RPN 225",
  },
  {
    process: "Auto Insurance Claims",
    agent: "Damage Estimator",
    decisionId: "DEC-2610",
    auditId: "AUD-2610",
    decision: "Estimate front-bumper repair (Camry 2021) — $4,180",
    review: "Maria Lopez · OVERRIDDEN — parts price feed stale by 9 days",
    outcome: "Estimate corrected to $4,860; vendor feed escalated to Mitchell live",
  },
  {
    process: "Commercial Loan Origination",
    agent: "Loan Underwriter",
    decisionId: "DEC-2612",
    auditId: "AUD-2612",
    decision: "Underwrite $4.2M term loan (Acme Mfg) — DSCR 1.18× borderline",
    review: "Sarah Chen · ESCALATED — committee review per R-006",
    outcome: "Approved with adjusted covenants; risk-rated grade 4 retained",
  },
];

const READINESS = 0.85;
const CERT_THRESHOLD = 0.9;

function statusTone(s: Status): "green" | "amber" | "slate" {
  if (s === "PASS") return "green";
  if (s === "PARTIAL") return "amber";
  return "slate";
}

export default function Compliance() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [frameworkFilter, setFrameworkFilter] = useState<FrameworkFilter>("all");

  const passing = CONTROLS.filter(c => c.status === "PASS").length;
  const partial = CONTROLS.filter(c => c.status === "PARTIAL").length;
  const notStarted = CONTROLS.filter(c => c.status === "NOT STARTED").length;

  const isoPassing = CONTROLS.filter(c => c.framework === "ISO 42001" && c.status === "PASS").length;
  const isoTotal = CONTROLS.filter(c => c.framework === "ISO 42001").length;
  const euPassing = CONTROLS.filter(c => c.framework === "EU AI Act" && c.status === "PASS").length;
  const euTotal = CONTROLS.filter(c => c.framework === "EU AI Act").length;

  const list = useMemo(() => CONTROLS.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (frameworkFilter !== "all" && c.framework !== frameworkFilter) return false;
    return true;
  }), [statusFilter, frameworkFilter]);

  const { selected: active, select: selectControl, id: activeControlId } = useListSelection(
    list,
    (c) => `${c.framework}:${c.id}`,
  );

  const certEligible = READINESS >= CERT_THRESHOLD && partial === 0 && notStarted === 0;

  return (
    <Layout
      title="Compliance & Certification"
      kicker="Governance / Certification"
      headerRight={
        <div className="flex items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <Activity className="h-3 w-3" />
            {pct(READINESS, 0)} ready
          </Pill>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark"
            data-testid="button-generate-cert"
            disabled={!certEligible}
            title={certEligible ? "Generate compliance certificate" : "Requires ≥90% readiness and zero partial/not-started controls"}
          >
            <BadgeCheck className="h-3.5 w-3.5" />
            Generate certificate
          </button>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Audit readiness scored against ISO/IEC 42001 and EU AI Act — backed by signed decisions on the
          Predictive Ledger, FMEA register, and human oversight evidence chain.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">ISO/IEC 42001 · EU AI Act</Pill>
          <Pill tone="slate">Ledger-chained evidence</Pill>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          tone="primary"
          icon={<BadgeCheck className="h-4 w-4" />}
          label="AUDIT READINESS"
          value={pct(READINESS, 0)}
          sub={`Target ≥ ${pct(CERT_THRESHOLD, 0)} for certificate`}
        />
        <KpiCard
          tone="green"
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="PASSING"
          value={String(passing)}
          sub={`of ${CONTROLS.length} controls`}
        />
        <KpiCard
          tone="amber"
          icon={<AlertTriangle className="h-4 w-4" />}
          label="PARTIAL"
          value={String(partial)}
          sub="Needs remediation"
        />
        <KpiCard
          tone="slate"
          icon={<Clock className="h-4 w-4" />}
          label="NOT STARTED"
          value={String(notStarted)}
          sub="Planned controls"
        />
      </div>

      <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
            Certification posture
          </div>
          <div className="text-sm font-semibold text-foreground mt-1">
            {passing} passing · {partial} partial · {notStarted} not started
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Recommended formal audit window: Q3 2026 · ISO {isoPassing}/{isoTotal} · EU AI Act {euPassing}/{euTotal}
          </div>
        </div>
        <Pill tone={certEligible ? "green" : READINESS >= 0.8 ? "amber" : "red"}>
          <StatusDot tone={certEligible ? "green" : READINESS >= 0.8 ? "amber" : "red"} />
          {certEligible ? "Certificate eligible" : "Not yet certifiable"}
        </Pill>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <SectionCard kicker="Readiness gauge" title="Composite score">
          <div className="flex items-center gap-6">
            <Donut value={READINESS} />
            <div className="text-xs text-muted-foreground space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[hsl(142_70%_42%)]" /> {passing} passing
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[hsl(38_90%_50%)]" /> {partial} partial
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[hsl(220_15%_55%)]" /> {notStarted} not started
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard className="lg:col-span-2" kicker="By framework" title="Control coverage">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FrameworkCard name="ISO/IEC 42001" desc="AI Management Systems" passing={isoPassing} total={isoTotal} />
            <FrameworkCard name="EU AI Act" desc="High-risk systems regulation" passing={euPassing} total={euTotal} />
          </div>
          <p className="mt-4 pt-4 border-t border-border/60 text-xs text-muted-foreground leading-relaxed">
            Evidence is cryptographically chained on the Predictive Ledger. Certificates issue only when score ≥ 90%
            and zero HIGH-risk oversight gaps remain.
          </p>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5 items-start mb-6">
        <SectionCard
          kicker="Control checklist"
          title="ISO/IEC 42001 + EU AI Act"
          padding={false}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <div className="aeos-content-segment" role="tablist" aria-label="Framework filter">
                {([
                  ["all", "All", CONTROLS.length],
                  ["ISO 42001", "ISO", isoTotal],
                  ["EU AI Act", "EU AI Act", euTotal],
                ] as const).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    onClick={() => setFrameworkFilter(id)}
                    className="aeos-content-segment-btn"
                    data-active={frameworkFilter === id ? "true" : "false"}
                    aria-selected={frameworkFilter === id}
                  >
                    {label}
                    <span className="ml-1 tabular-nums opacity-70">({count})</span>
                  </button>
                ))}
              </div>
              <button type="button" className="aeos-btn aeos-btn-secondary aeos-btn--sm" data-testid="button-export-checklist">
                <Download className="h-3 w-3" /> Export
              </button>
            </div>
          }
        >
          <div className="px-5 py-3 border-b">
            <div className="aeos-content-segment inline-flex" role="tablist" aria-label="Status filter">
              {([
                ["all", "All", CONTROLS.length],
                ["PASS", "Pass", passing],
                ["PARTIAL", "Partial", partial],
                ["NOT STARTED", "Not started", notStarted],
              ] as const).map(([id, label, count]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  onClick={() => setStatusFilter(id)}
                  className="aeos-content-segment-btn"
                  data-active={statusFilter === id ? "true" : "false"}
                  aria-selected={statusFilter === id}
                >
                  {label}
                  <span className="ml-1 tabular-nums opacity-70">({count})</span>
                </button>
              ))}
            </div>
          </div>

          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
              <tr>
                <Th>Framework</Th>
                <Th>Control</Th>
                <Th>Requirement</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => (
                <tr
                  key={`${c.framework}-${c.id}`}
                  className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                    `${c.framework}:${c.id}` === activeControlId ? "bg-primary/5" : ""
                  } ${c.status === "PASS" ? "border-l-2 border-l-[hsl(142_70%_42%)]" : c.status === "PARTIAL" ? "border-l-2 border-l-[hsl(38_96%_50%)]" : "border-l-2 border-l-[hsl(220_15%_55%)]"}`}
                  onClick={() => selectControl(c)}
                  data-testid={`row-control-${c.id}`}
                >
                  <Td muted>{c.framework}</Td>
                  <Td mono>{c.id}</Td>
                  <Td><span className="font-medium">{c.name}</span></Td>
                  <Td>
                    <Pill tone={statusTone(c.status)}>
                      <StatusDot tone={statusTone(c.status)} />
                      {c.status}
                    </Pill>
                  </Td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    No controls match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard className="h-fit" kicker="Control detail" title={active?.name ?? "Select a control"}>
          {!active ? (
            <p className="text-sm text-muted-foreground">
              Click any row to see evidence notes and remediation guidance.
            </p>
          ) : (
            <ControlDetail control={active} />
          )}
        </SectionCard>
      </div>

      <SectionCard kicker="HITL evidence chain" title="Sample audit traces" className="mb-6">
        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Representative human-in-the-loop traces showing agent decision → human review → ledger outcome.
          Full chain available in the Audit Trail.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {HITL_EVIDENCE.map(e => (
            <div key={e.decisionId} className="rounded-none border bg-card p-4">
              <div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground mb-1">{e.process}</div>
              <div className="font-semibold text-sm mb-3">{e.agent}</div>
              <Step label="Agent decision" id={e.decisionId} text={e.decision} icon={<FileText className="h-3.5 w-3.5" />} tone="blue" />
              <Arrow />
              <Step label="Human review" id={e.auditId} text={e.review} icon={<ShieldCheck className="h-3.5 w-3.5" />} tone="amber" />
              <Arrow />
              <Step label="Outcome" id="LEDGER" text={e.outcome} icon={<BadgeCheck className="h-3.5 w-3.5" />} tone="green" />
            </div>
          ))}
        </div>
        <Link href="/governance/audit" className="aeos-btn aeos-btn-secondary mt-4">
          Open Audit Trail
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </SectionCard>
    </Layout>
  );
}

function ControlDetail({ control }: { control: Control }) {
  return (
    <div className="space-y-4">
      <div className={`rounded-none border-l-4 px-3 py-2 ${
        control.status === "PASS"
          ? "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
          : control.status === "PARTIAL"
            ? "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]"
            : "border-[hsl(220_14%_88%)] bg-muted/30"
      }`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
              {control.framework} · {control.id}
            </div>
            <div className="text-sm font-semibold mt-0.5">{control.name}</div>
          </div>
          <Pill tone={statusTone(control.status)}>
            <StatusDot tone={statusTone(control.status)} />
            {control.status}
          </Pill>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-1.5">Evidence</div>
        <p className="text-sm text-muted-foreground leading-relaxed">{control.note}</p>
      </div>

      {control.remediation && (
        <div className="rounded-none border border-border/60 bg-muted/30 px-3 py-2.5">
          <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-1">Remediation</div>
          <p className="text-sm leading-relaxed">{control.remediation}</p>
        </div>
      )}

      {control.status !== "PASS" && (
        <div className="text-xs text-muted-foreground pt-2 border-t border-border/60">
          Resolving this control improves audit readiness toward the {pct(CERT_THRESHOLD, 0)} certificate threshold.
        </div>
      )}
    </div>
  );
}

function FrameworkCard({ name, desc, passing, total }: { name: string; desc: string; passing: number; total: number }) {
  const ratio = total > 0 ? passing / total : 0;
  const tone = ratio >= 0.9 ? "green" : ratio >= 0.6 ? "amber" : "red";
  const fill =
    tone === "green" ? "hsl(142 70% 42%)"
      : tone === "amber" ? "hsl(38 96% 50%)"
        : "hsl(0 72% 50%)";

  return (
    <div className="rounded-none border p-4">
      <div className="text-xs font-semibold mb-0.5">{name}</div>
      <div className="text-[10px] text-muted-foreground mb-3">{desc}</div>
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-2xl font-bold tabular-nums">{passing}</div>
        <div className="text-xs text-muted-foreground">/ {total} controls</div>
      </div>
      <div className="aeos-cognition-contribution-track h-2">
        <div className="aeos-cognition-contribution-fill" style={{ width: `${ratio * 100}%`, background: fill }} />
      </div>
      <div className={`text-[10px] mt-2 font-semibold ${tone === "green" ? "text-[hsl(142_70%_30%)]" : tone === "amber" ? "text-[hsl(28_90%_38%)]" : "text-[hsl(0_72%_44%)]"}`}>
        {pct(ratio, 0)} compliant
      </div>
    </div>
  );
}

function Donut({ value }: { value: number }) {
  const r = 56;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 140 140" width="120" height="120" className="shrink-0">
      <circle cx="70" cy="70" r={r} fill="none" stroke="hsl(220 14% 92%)" strokeWidth="12" />
      <circle
        cx="70" cy="70" r={r} fill="none"
        stroke="hsl(var(--primary))" strokeWidth="12"
        strokeDasharray={`${c * value} ${c}`} strokeLinecap="butt"
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="68" textAnchor="middle" fontSize="22" fontWeight="700" fill="hsl(220 15% 18%)" className="tabular-nums">
        {Math.round(value * 100)}%
      </text>
      <text x="70" y="86" textAnchor="middle" fontSize="9" fill="hsl(220 10% 50%)" letterSpacing="2">
        AUDIT READY
      </text>
    </svg>
  );
}

function Step({ label, id, text, icon, tone }: {
  label: string; id: string; text: string; icon: React.ReactNode; tone: "blue" | "amber" | "green";
}) {
  const bg =
    tone === "blue" ? "border-[hsl(213_94%_82%)] bg-[hsl(213_100%_97%)]"
      : tone === "amber" ? "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]"
        : "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]";
  const fg =
    tone === "blue" ? "text-[hsl(213_84%_38%)]"
      : tone === "amber" ? "text-[hsl(28_90%_38%)]"
        : "text-[hsl(142_70%_28%)]";

  return (
    <div className={`rounded-none border-l-4 px-2.5 py-2 ${bg}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className={`flex items-center gap-1.5 text-[10px] font-bold tracking-[.14em] ${fg}`}>
          {icon}{label}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">{id}</div>
      </div>
      <div className="text-[11px] leading-snug">{text}</div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="grid place-items-center my-1">
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground rotate-90" />
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-4 py-2.5 font-semibold">{children}</th>;
}

function Td({ children, mono, muted }: { children: React.ReactNode; mono?: boolean; muted?: boolean }) {
  return (
    <td className={`px-4 py-2.5 align-top ${mono ? "font-mono text-[11px]" : ""} ${muted ? "text-muted-foreground text-xs" : ""}`}>
      {children}
    </td>
  );
}
