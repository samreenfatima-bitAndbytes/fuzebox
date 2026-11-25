"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppShell } from "@/components/AppShell";
import { AgentCompareDashboard } from "@/components/AgentCompareViews";
import { Alert } from "@/components/ui/Alert";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageChip } from "@/components/ui/PageChip";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError, fetchEnrichedAgents } from "@/lib/api";
import {
  buildAllCompareMetricsFromEnriched,
  compareAgents,
  enrichedToRegistryItem,
  pickComparePair,
} from "@/lib/agent-compare";
import type { AgentCompareMetrics } from "@/lib/agent-compare";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { daysToTimeRangeLabel } from "@/lib/format";
import type { AgentRegistryItem } from "@/lib/types";

const DAY_OPTIONS = [7, 14, 30] as const;

/** Flip to true when the compare time-range control should be visible again. */
const SHOW_TIME_RANGE_FILTER = false;

function parseDays(raw: string | null): number {
  const n = Number(raw);
  return (DAY_OPTIONS as readonly number[]).includes(n) ? n : 7;
}

function buildCompareUrl(a: string, b: string, days: number): string {
  const params = new URLSearchParams();
  if (a) params.set("a", a);
  if (b) params.set("b", b);
  if (days !== 7) params.set("days", String(days));
  const q = params.toString();
  return q ? `/agent-compare?${q}` : "/agent-compare";
}

export default function AgentComparePage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Agent A/B Comparison" subtitle="Loading…">
          <PageLoading message="Loading comparison data…" />
        </AppShell>
      }
    >
      <AgentComparePageInner />
    </Suspense>
  );
}

function AgentComparePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [days, setDays] = useState(() => parseDays(searchParams.get("days")));
  const [agents, setAgents] = useState<AgentRegistryItem[]>([]);
  const [agentIdA, setAgentIdA] = useState("");
  const [agentIdB, setAgentIdB] = useState("");
  const [metricsList, setMetricsList] = useState<AgentCompareMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);
  const pairInit = useRef(false);

  const syncUrl = useCallback(
    (a: string, b: string, d: number) => {
      router.replace(buildCompareUrl(a, b, d), { scroll: false });
    },
    [router],
  );

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const enriched = await fetchEnrichedAgents(days);
      if (seq !== loadSeq.current) return;

      const agentList = enriched.map(enrichedToRegistryItem);
      setAgents(agentList);
      setMetricsList(buildAllCompareMetricsFromEnriched(enriched));
      hasDataRef.current = agentList.length >= 2;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load comparison data",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days]);

  useAppRefresh(load);

  const agentIdsKey = useMemo(
    () => agents.map((a) => a.agent_id).sort().join(","),
    [agents],
  );

  useEffect(() => {
    if (agents.length < 2) return;

    const paramA = searchParams.get("a");
    const paramB = searchParams.get("b");
    const urlDriven = Boolean(paramA || paramB);

    if (urlDriven || !pairInit.current) {
      const [a, b] = pickComparePair(agents, paramA, paramB);
      setAgentIdA(a);
      setAgentIdB(b);
      pairInit.current = true;
    }
  }, [agentIdsKey, agents, searchParams]);

  useEffect(() => {
    const urlDays = parseDays(searchParams.get("days"));
    if (urlDays !== days) setDays(urlDays);
  }, [searchParams, days]);

  const metricsMap = useMemo(
    () => new Map(metricsList.map((m) => [m.agentId, m])),
    [metricsList],
  );

  const result = useMemo(() => {
    const a = metricsMap.get(agentIdA);
    const b = metricsMap.get(agentIdB);
    if (!a || !b || agentIdA === agentIdB) return null;
    return compareAgents(a, b);
  }, [metricsMap, agentIdA, agentIdB]);

  const onChangeA = useCallback(
    (id: string) => {
      setAgentIdA(id);
      syncUrl(id, agentIdB, days);
    },
    [agentIdB, days, syncUrl],
  );

  const onChangeB = useCallback(
    (id: string) => {
      setAgentIdB(id);
      syncUrl(agentIdA, id, days);
    },
    [agentIdA, days, syncUrl],
  );

  const onDaysChange = useCallback(
    (value: string) => {
      const next = Number(value);
      setDays(next);
      syncUrl(agentIdA, agentIdB, next);
    },
    [agentIdA, agentIdB, syncUrl],
  );

  const showDashboard = agents.length >= 2 && agentIdA && agentIdB;

  return (
    <AppShell
      title="Agent A/B Comparison"
      subtitle="Side-by-side performance across six dimensions — ownership, retirement, and improvement budget."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/agents" className="hover:text-brand-primary">
          My AI Agents
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <Link href="/agent-roster" className="hover:text-brand-primary">
          Roster
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Compare</span>
      </nav>

      {SHOW_TIME_RANGE_FILTER ? (
        <PageToolbar>
          <Select
            value={String(days)}
            onChange={onDaysChange}
            options={TIME_RANGE_OPTIONS.filter((o) =>
              ["7", "14", "30"].includes(o.value),
            )}
            aria-label="Activity window"
          />
          {agents.length >= 2 ? (
            <PageChip variant="muted">
              {daysToTimeRangeLabel(days)}
              {loading && hasDataRef.current ? " · refreshing…" : ""}
            </PageChip>
          ) : null}
        </PageToolbar>
      ) : null}

      {loading && !hasDataRef.current ? (
        <PageLoading message="Loading comparison data…" />
      ) : null}

      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}

      {!loading && agents.length < 2 && !error ? (
        <PageEmpty
          title="Need two agents"
          message="Register at least two agents to run an A/B comparison."
          hint={{ label: "Open agent registry", href: "/agents" }}
        />
      ) : null}

      {showDashboard ? (
        <AgentCompareDashboard
          agents={agents}
          agentIdA={agentIdA}
          agentIdB={agentIdB}
          onChangeA={onChangeA}
          onChangeB={onChangeB}
          metricsById={metricsMap}
          result={result}
        />
      ) : null}
    </AppShell>
  );
}
