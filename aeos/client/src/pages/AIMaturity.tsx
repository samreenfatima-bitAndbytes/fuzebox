import { useMemo, useState } from "react";
import { useListSelection } from "@/hooks/use-list-selection";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { Sparkles, Target, ShieldCheck, DollarSign, Users, TrendingUp, ArrowRight } from "lucide-react";
import { num, pct } from "@/lib/format";

const LEVELS = [
  { id: 1, name: "Exploring",  desc: "Discovery & POCs" },
  { id: 2, name: "Piloting",   desc: "Single-process pilots" },
  { id: 3, name: "Scaling",    desc: "Multiple agents in production, measuring ROI" },
  { id: 4, name: "Optimized",  desc: "Continuous improvement, high automation coverage" },
  { id: 5, name: "Autonomous", desc: "Self-improving fleet, governance fully automated" },
] as const;

const CURRENT_LEVEL = 3;

type Dimension = {
  key: string;
  label: string;
  score: number;
  icon: typeof Target;
  next: string;
  action: string;
};

const DIMENSIONS: Dimension[] = [
  { key: "coverage",   label: "Coverage",            score: 3, icon: Target,       next: "Achieve >50% task coverage across all processes",            action: "Expand agent coverage to Resort Operations and Loyalty escalation tasks." },
  { key: "quality",    label: "Quality",             score: 3, icon: Sparkles,     next: "Reach average 4.0σ across all agents",                       action: "Improve Recommendation Writer Agent from 2.9σ to 3.5σ with prompt refinement." },
  { key: "roi",        label: "ROI",                 score: 4, icon: DollarSign,   next: "Achieve >$3,000/wk net ROI across all processes",            action: "Expand AML/KYC and Claims coverage to lift gross savings." },
  { key: "governance", label: "Governance",          score: 4, icon: ShieldCheck,  next: "Achieve 100% compliance with all active rules",              action: "Resolve override rate cap violation and complete overdue FMEA reviews." },
  { key: "workforce",  label: "Workforce Readiness", score: 2, icon: Users,        next: "Complete training programs for 80%+ of affected staff",       action: "Launch AI collaboration training and formalize new role definitions." },
];

function scoreTone(score: number): "green" | "amber" | "red" {
  if (score >= 4) return "green";
  if (score >= 3) return "amber";
  return "red";
}

function progressFillColor(score: number): string {
  if (score >= 4) return "hsl(142 70% 42%)";
  if (score >= 3) return "hsl(38 96% 50%)";
  return "hsl(0 72% 50%)";
}

export default function AIMaturity() {
  const { selected: active, select: selectDimension } = useListSelection(
    DIMENSIONS,
    (d) => d.key,
  );
  const targetLevel = CURRENT_LEVEL + 1;
  const target = LEVELS[targetLevel - 1];
  const current = LEVELS[CURRENT_LEVEL - 1];

  const avgScore = DIMENSIONS.reduce((s, d) => s + d.score, 0) / DIMENSIONS.length;
  const weakest = useMemo(
    () => [...DIMENSIONS].sort((a, b) => a.score - b.score)[0],
    [],
  );
  const strongest = useMemo(
    () => [...DIMENSIONS].sort((a, b) => b.score - a.score)[0],
    [],
  );
  const readyForNext = DIMENSIONS.filter(d => d.score >= 3).length;

  return (
    <Layout title="AI Maturity Assessment" kicker="Insights / AI Maturity">
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Evaluate AI readiness across five dimensions — coverage, quality, ROI, governance, and
          workforce. Identify gaps and plan the path to the next maturity level.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">5-level maturity model</Pill>
          <Pill tone="slate">Self-assessed · Platform-derived</Pill>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          tone="primary"
          icon={<TrendingUp className="h-4 w-4" />}
          label="CURRENT LEVEL"
          value={`L${CURRENT_LEVEL}`}
          sub={current.name}
          footer={
            <div className="text-xs text-muted-foreground">{current.desc}</div>
          }
        />
        <KpiCard
          tone="orange"
          icon={<Sparkles className="h-4 w-4" />}
          label="AVG SCORE"
          value={num(avgScore, 1)}
          sub="Across five dimensions (0–5)"
          trend={
            <span className="text-[11px] font-semibold text-muted-foreground tabular-nums">/ 5</span>
          }
        />
        <KpiCard
          tone="amber"
          icon={<Users className="h-4 w-4" />}
          label="WEAKEST"
          value={`${weakest.score}/5`}
          sub={weakest.label}
          footer={
            <div className="text-xs text-muted-foreground truncate">{weakest.next}</div>
          }
        />
        <KpiCard
          tone="green"
          icon={<Target className="h-4 w-4" />}
          label="L4 READINESS"
          value={`${readyForNext}/5`}
          sub="Dimensions at ≥3"
          footer={
            <div className="text-xs text-muted-foreground">
              Strongest · <span className="font-semibold text-foreground">{strongest.label}</span> ({strongest.score}/5)
            </div>
          }
        />
      </div>

      <div className="aeos-cognition-hero aeos-cognition-total mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
              Maturity assessment
            </div>
            <div className="text-lg font-semibold text-foreground mt-1">
              Level {CURRENT_LEVEL} · {current.name}
              <Pill tone="blue" className="ml-2 align-middle">Current</Pill>
            </div>
            <div className="text-sm text-muted-foreground mt-1">{current.desc}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">Next target</div>
            <div className="text-sm font-semibold text-foreground mt-1">
              Level {targetLevel} · {target.name}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">{target.desc}</div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          {LEVELS.map(l => {
            const passed = l.id <= CURRENT_LEVEL;
            const isCurrent = l.id === CURRENT_LEVEL;
            return (
              <div key={l.id}>
                <div className="aeos-cognition-contribution-track h-2 mb-2">
                  <div
                    className="aeos-cognition-contribution-fill"
                    style={{
                      width: passed ? "100%" : "0%",
                      background: isCurrent
                        ? "hsl(var(--primary))"
                        : passed
                          ? "hsl(var(--primary) / 0.45)"
                          : "transparent",
                    }}
                  />
                </div>
                <div className={`text-[10px] font-bold uppercase tracking-wide ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                  L{l.id} {l.name}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {isCurrent ? "Current" : passed ? "Achieved" : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-5 items-start mb-6">
        <SectionCard kicker="Dimensions" title="Five-axis scores" padding={false}>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th>Dimension</Th>
                <Th>Score</Th>
                <Th>Status</Th>
                <Th>Progress</Th>
              </tr>
            </thead>
            <tbody>
              {DIMENSIONS.map(d => {
                const tone = scoreTone(d.score);
                return (
                  <tr
                    key={d.key}
                    className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                      active?.key === d.key ? "bg-primary/5" : ""
                    }`}
                    onClick={() => selectDimension(d)}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <d.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium">{d.label}</span>
                      </div>
                    </Td>
                    <Td className="font-semibold tabular-nums">{d.score}<span className="text-muted-foreground font-normal">/5</span></Td>
                    <Td>
                      <Pill tone={tone}>
                        <StatusDot tone={tone} />
                        {tone === "green" ? "Strong" : tone === "amber" ? "On track" : "Gap"}
                      </Pill>
                    </Td>
                    <Td className="min-w-[120px]">
                      <div className="aeos-cognition-contribution-track h-2">
                        <div
                          className="aeos-cognition-contribution-fill"
                          style={{ width: pct(d.score / 5, 0), background: progressFillColor(d.score) }}
                        />
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard className="h-fit" kicker="Dimension detail" title={active?.label ?? "Select a dimension"}>
          {!active ? (
            <p className="text-sm text-muted-foreground">Click any row to see next-level targets and recommended actions.</p>
          ) : (
            <div className="space-y-4">
              <Block title="Score" tone={scoreTone(active.score) === "green" ? "green" : scoreTone(active.score) === "amber" ? "amber" : "red"}>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums">{active.score}</span>
                  <span className="text-sm text-muted-foreground">/ 5</span>
                </div>
                <div className="aeos-cognition-contribution-track h-2 mt-2">
                  <div
                    className="aeos-cognition-contribution-fill"
                    style={{ width: pct(active.score / 5, 0), background: progressFillColor(active.score) }}
                  />
                </div>
              </Block>

              <Block title="Next-level target" tone="blue">
                <p className="text-xs text-muted-foreground leading-relaxed">{active.next}</p>
              </Block>

              <Block title="Recommended action" tone="orange">
                <p className="text-xs text-foreground/90 leading-relaxed">{active.action}</p>
              </Block>

              <div className="rounded-none border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
                To reach <strong className="text-foreground">Level {targetLevel} ({target.name})</strong>, prioritize{" "}
                <strong className="text-foreground">{weakest.label}</strong> — the lowest-scoring dimension today.
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <SectionCard className="lg:col-span-2" kicker="Radar" title="Five-axis assessment (0–5)">
          <div className="flex items-center justify-center py-4" style={{ minHeight: 360 }}>
            <Radar dims={DIMENSIONS.map(d => ({ label: d.label, score: d.score, key: d.key }))} activeKey={active?.key} />
          </div>
        </SectionCard>

        <SectionCard kicker="Path forward" title={`Target · Level ${targetLevel}`}>
          <div className="rounded-none border-l-4 border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)] px-3 py-3 mb-4">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[hsl(142_70%_30%)] mb-1">Target</div>
            <div className="font-semibold text-sm">Level {targetLevel} · {target.name}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{target.desc}</div>
          </div>

          <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-2">
            Executive summary
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            To reach Level {targetLevel} ({target.name}), focus on{" "}
            <strong>{weakest.label}</strong>: {weakest.action}
          </p>

          <button
            type="button"
            className="aeos-btn aeos-btn-primary w-full mt-4"
            onClick={() => selectDimension(weakest)}
          >
            Review weakest dimension
            <ArrowRight className="h-3.5 w-3.5" />
          </button>

          <div className="mt-4 pt-4 border-t text-[11px] text-muted-foreground leading-relaxed">
            Maturity scores are self-assessed from current platform data. Independent audit recommended for formal certification.
          </div>
        </SectionCard>
      </div>
    </Layout>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-5 py-2.5 font-semibold">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-2.5 ${className ?? ""}`}>{children}</td>;
}

function Block({ title, tone, children }: { title: string; tone: "blue" | "green" | "orange" | "amber" | "red"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    blue: "border-[hsl(213_94%_82%)] bg-[hsl(213_100%_97%)]",
    green: "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]",
    orange: "border-[hsl(25_95%_80%)] bg-[hsl(25_100%_97%)]",
    amber: "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]",
    red: "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]",
  };
  return (
    <div className={`rounded-none border-l-4 px-3 py-2 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-foreground/70 mb-1">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Radar({ dims, activeKey }: { dims: { label: string; score: number; key: string }[]; activeKey?: string }) {
  const N = dims.length;
  const cx = 200;
  const cy = 200;
  const R = 140;
  const angle = (i: number) => (i / N) * 2 * Math.PI - Math.PI / 2;
  const point = (i: number, val: number) => {
    const r = (val / 5) * R;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  };
  const polygon = dims.map((d, i) => point(i, d.score).join(",")).join(" ");

  return (
    <svg viewBox="0 0 400 400" width="100%" style={{ maxWidth: 480 }}>
      {[1, 2, 3, 4, 5].map(ring => (
        <polygon
          key={ring}
          points={dims.map((_, i) => point(i, ring).join(",")).join(" ")}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth="1"
        />
      ))}
      {dims.map((_, i) => {
        const [x, y] = point(i, 5);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="hsl(var(--border))" strokeWidth="1" />;
      })}
      <polygon
        points={polygon}
        fill="hsl(var(--primary) / 0.12)"
        stroke="hsl(var(--primary))"
        strokeWidth="2"
      />
      {dims.map((d, i) => {
        const [x, y] = point(i, d.score);
        const isActive = d.key === activeKey;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={isActive ? 7 : 5}
            fill={isActive ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.55)"}
            stroke={isActive ? "hsl(var(--primary))" : "none"}
            strokeWidth={2}
          />
        );
      })}
      {dims.map((d, i) => {
        const [x, y] = point(i, 5.6);
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="11"
            fontWeight="600"
            fill="hsl(var(--foreground))"
          >
            {d.label}
          </text>
        );
      })}
    </svg>
  );
}
