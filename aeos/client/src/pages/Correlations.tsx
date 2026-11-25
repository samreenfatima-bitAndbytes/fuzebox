import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  GitCompare, TrendingDown, TrendingUp, Sparkles, Lightbulb, Brain,
  Clock, DollarSign, ListChecks, ArrowRight, Flame,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useMemo, useState } from "react";

type Strength = "Strong" | "Moderate" | "Weak";
type Category = "Quality" | "Temporal" | "Model comparison" | "Task analysis";

type Correlation = {
  id: string;
  title: string;
  strength: Strength;
  r: number;
  category: Category;
  insight: string;
  metric: string;
  workflow?: string;
};

const CAT_LABEL: Record<Category, string> = {
  Quality: "Output quality",
  Temporal: "Time of day",
  "Model comparison": "AI model choice",
  "Task analysis": "Task complexity",
};

const CAT_ICON: Record<Category, JSX.Element> = {
  Quality: <Brain className="h-4 w-4" />,
  Temporal: <Clock className="h-4 w-4" />,
  "Model comparison": <DollarSign className="h-4 w-4" />,
  "Task analysis": <ListChecks className="h-4 w-4" />,
};

const CAT_ACCENT: Record<Category, { fg: string; bg: string }> = {
  Quality:            { fg: "hsl(213 84% 42%)", bg: "hsl(213 100% 95%)" },
  Temporal:           { fg: "hsl(28 90% 38%)",  bg: "hsl(38 96% 94%)" },
  "Model comparison": { fg: "hsl(142 70% 30%)", bg: "hsl(142 72% 94%)" },
  "Task analysis":    { fg: "hsl(220 15% 28%)", bg: "hsl(220 14% 95%)" },
};

const STRENGTH_LABEL: Record<Strength, string> = {
  Strong: "Strong pattern",
  Moderate: "Likely pattern",
  Weak: "Early signal",
};

function strengthTone(s: Strength): "green" | "amber" | "neutral" {
  return s === "Strong" ? "green" : s === "Moderate" ? "amber" : "neutral";
}

type CorrelationsResponse = {
  source: "telemetry";
  eventCount: number;
  updatedAt: string;
  correlations: Correlation[];
};

function DirectionTag({ r }: { r: number }) {
  const positive = r >= 0;
  return (
    <Pill tone={positive ? "blue" : "amber"} className="gap-1.5 max-w-full">
      {positive ? <TrendingUp className="h-3 w-3 shrink-0" /> : <TrendingDown className="h-3 w-3 shrink-0" />}
      <span className="truncate">{positive ? "Rise and fall together" : "One rises as the other falls"}</span>
    </Pill>
  );
}

function StrengthMeter({ r, strength, delay = 0 }: { r: number; strength: Strength; delay?: number }) {
  const abs = Math.abs(r);
  const positive = r >= 0;
  const color = positive ? "hsl(213 84% 56%)" : "hsl(25 95% 55%)";
  return (
    <div className="space-y-2">
      <div className="h-2.5 aeos-audit-bar bg-muted overflow-hidden">
        <motion.div
          className="h-full aeos-audit-bar"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(abs * 100, 8)}%` }}
          transition={{ duration: 0.7, delay, ease: "easeOut" }}
        />
      </div>
      <div className="text-[11px] text-muted-foreground">
        Pattern clarity · <span className="font-medium text-foreground">{strength.toLowerCase()}</span>
      </div>
    </div>
  );
}

export default function Correlations() {
  const { data, isLoading, isError, error } = useQuery<CorrelationsResponse>({
    queryKey: ["/api/correlations"],
  });
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, nav] = useLocation();
  const correlations = data?.correlations ?? [];
  const [spotlight, ...rest] = correlations;
  const total = correlations.length;
  const strong = correlations.filter(c => c.strength === "Strong").length;
  const moderate = correlations.filter(c => c.strength === "Moderate").length;
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt) : null;
  const updatedText = updatedAt ? updatedAt.toLocaleString() : "—";
  const eventCount = data?.eventCount ?? 0;
  const noEvents = !isLoading && !isError && eventCount === 0;
  const needsMoreData = !isLoading && !isError && eventCount > 0 && eventCount < 3;
  const [genNote, setGenNote] = useState<string | null>(null);

  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<Category, number>> = {};
    for (const c of correlations) counts[c.category] = (counts[c.category] ?? 0) + 1;
    return counts;
  }, [correlations]);

  const gen = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/pel/rollup");
      const res = await apiRequest("POST", "/api/recommendations/generate");
      const json = (await res.json()) as { generated?: number };
      return json.generated ?? 0;
    },
    onSuccess: (generated) => {
      void qc.invalidateQueries({ queryKey: ["/api/recommendations"] });
      void qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      if (generated > 0) {
        const msg = `Found ${generated} new suggestion${generated === 1 ? "" : "s"} based on this pattern.`;
        setGenNote(msg);
        toast({ title: "Suggestions ready", description: msg });
        nav("/ecl/recommendations");
        return;
      }
      const msg = "Nothing new to suggest yet — check back after more activity comes in.";
      setGenNote(msg);
      toast({ title: "Nothing new to suggest", description: msg });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Could not find suggestions right now.";
      setGenNote(null);
      toast({ title: "Could not find suggestions", description: msg, variant: "destructive" });
    },
  });

  return (
    <Layout
      title="Correlations"
      kicker="Insights / Pattern analysis"
      headerRight={
        <Pill tone="blue" className="gap-1.5">
          <Sparkles className="h-3 w-3" />
          {isLoading ? "Loading…" : isError ? "Unavailable" : eventCount > 0 ? `${eventCount.toLocaleString()} activities` : "No activity yet"}
        </Pill>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Telemetry-driven patterns across cost, speed, quality, and acceptance rate — each with
          a plain-language explanation and a path to act via recommendations.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">
            <Sparkles className="h-3 w-3" />
            {eventCount.toLocaleString()} activities analyzed
          </Pill>
          <Pill tone="slate">Updated {updatedText}</Pill>
          <Pill tone="slate">Pattern strength · direction</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load patterns. {(error as Error)?.message ?? "Try signing in again or refresh the page."}
        </div>
      )}

      {!isError && noEvents && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No activity recorded yet. Once agents are running, open{" "}
          <Link href="/ecl/observation" className="text-[hsl(var(--primary))] hover:underline">Observation Plane</Link>
          {" "}to review events — patterns appear here automatically.
        </div>
      )}

      {!isError && needsMoreData && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          Only {eventCount} activit{eventCount === 1 ? "y" : "ies"} so far — at least 3 are needed to spot reliable patterns.
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-none bg-muted animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && !isError && (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="primary"
          icon={<GitCompare className="h-4 w-4" />}
          label="PATTERNS FOUND"
          value={total.toString()}
          sub="Spotted in recent activity"
          footer={
            total > 0 ? (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {Object.entries(categoryCounts).map(([cat, n]) => (
                  <span key={cat}>
                    <span className="font-semibold text-foreground tabular-nums">{n}</span> {CAT_LABEL[cat as Category].toLowerCase()}
                  </span>
                ))}
              </div>
            ) : undefined
          }
        />
        <KpiCard
          tone="green"
          icon={<TrendingUp className="h-4 w-4" />}
          label="CLEAR ENOUGH TO ACT ON"
          value={strong.toString()}
          sub="Strong, well-supported patterns"
          trend={
            total > 0 ? (
              <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                {Math.round((strong / total) * 100)}%
              </span>
            ) : undefined
          }
        />
        <KpiCard
          tone="orange"
          icon={<Lightbulb className="h-4 w-4" />}
          label="SUGGESTED ACTIONS"
          value={total.toString()}
          sub="Every pattern has a next step"
          footer={
            moderate > 0 ? (
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground tabular-nums">{moderate}</span> likely patterns
              </div>
            ) : undefined
          }
        />
      </div>
      )}

      {!isLoading && !isError && correlations.length === 0 ? (
        <SectionCard className="min-w-0" kicker="Patterns" title="What we found">
          <div className="py-10 text-center text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
            {noEvents
              ? "Patterns will appear here once agent activity is flowing."
              : needsMoreData
                ? "A little more activity is needed before we can surface meaningful patterns."
                : "No strong patterns in the latest window — check back as volume grows."}
          </div>
        </SectionCard>
      ) : !isLoading && !isError ? (
        <div className="space-y-4 sm:space-y-5 min-w-0">
          {genNote && (
            <div className="border bg-card px-4 py-3 text-xs text-muted-foreground rounded-none">
              {genNote}
            </div>
          )}

          {spotlight && (
            <SectionCard
              className="aeos-cognition-hero overflow-hidden min-w-0"
              padding={false}
              kicker="Top pattern"
              title={spotlight.title}
              action={
                <Pill tone={strengthTone(spotlight.strength)}>
                  <Flame className="h-3 w-3" />
                  {STRENGTH_LABEL[spotlight.strength]}
                </Pill>
              }
            >
              <div className="p-4 sm:p-5">
                <div className="grid grid-cols-1 xl:grid-cols-[1fr_220px] gap-4 sm:gap-6 items-start min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-start sm:items-center gap-2.5 mb-3 min-w-0">
                      <span
                        className="grid place-items-center h-9 w-9 shrink-0"
                        style={{ background: CAT_ACCENT[spotlight.category].bg, color: CAT_ACCENT[spotlight.category].fg }}
                      >
                        {CAT_ICON[spotlight.category]}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] text-muted-foreground">{CAT_LABEL[spotlight.category]}</div>
                        <div className="text-xs font-mono text-muted-foreground truncate" title={spotlight.metric}>{spotlight.metric}</div>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90 break-words">
                      {spotlight.insight}
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5 mt-4">
                      <DirectionTag r={spotlight.r} />
                      <button
                        type="button"
                        className="aeos-btn aeos-btn-primary w-full sm:w-auto"
                        data-testid={`corr-action-${spotlight.id}`}
                        onClick={() => gen.mutate()}
                        disabled={gen.isPending}
                      >
                        {gen.isPending ? "Finding suggestions…" : "See what to do"}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="xl:pt-1 min-w-0 w-full">
                    <StrengthMeter r={spotlight.r} strength={spotlight.strength} delay={0.25} />
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {rest.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground mb-3">
                More patterns worth knowing about
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 sm:gap-4 items-start min-w-0">
                {rest.map((c, i) => (
                  <article
                    key={c.id}
                    className="border bg-card p-4 ecl-card-shadow rounded-none h-fit min-w-0"
                    data-testid={`corr-${c.id}`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span
                        className="grid place-items-center h-8 w-8 shrink-0"
                        style={{ background: CAT_ACCENT[c.category].bg, color: CAT_ACCENT[c.category].fg }}
                      >
                        {CAT_ICON[c.category]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <Pill tone={strengthTone(c.strength)}>{STRENGTH_LABEL[c.strength]}</Pill>
                          <span className="text-[11px] text-muted-foreground">{CAT_LABEL[c.category]}</span>
                        </div>
                        <h4 className="text-sm font-semibold leading-snug break-words">{c.title}</h4>
                      </div>
                    </div>

                    <p className="text-[13px] leading-relaxed text-foreground/80 border bg-muted/30 px-3 py-2.5 mb-3 rounded-none">
                      {c.insight}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start sm:items-end min-w-0">
                      <StrengthMeter r={c.r} strength={c.strength} delay={0.1 + i * 0.05} />
                      <DirectionTag r={c.r} />
                    </div>

                    <div className="mt-3 pt-3 border-t flex items-center justify-stretch sm:justify-end">
                      <button
                        type="button"
                        className="aeos-btn aeos-btn-primary aeos-btn--sm w-full sm:w-auto"
                        data-testid={`corr-action-${c.id}`}
                        onClick={() => gen.mutate()}
                        disabled={gen.isPending}
                      >
                        {gen.isPending ? "Finding suggestions…" : "See what to do"}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </Layout>
  );
}
