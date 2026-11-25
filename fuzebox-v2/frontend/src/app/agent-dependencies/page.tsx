"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AgentDependenciesDashboard } from "@/components/AgentDependenciesViews";
import { Alert } from "@/components/ui/Alert";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageChip } from "@/components/ui/PageChip";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { mergeDependencySummaries } from "@/lib/agent-dependencies";
import { ApiError, fetchAgentDependencies, fetchObservationDependencies } from "@/lib/api";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { daysToTimeRangeLabel } from "@/lib/format";
import type { AgentDependenciesSummary } from "@/lib/types";

/** Flip to true when the dependencies time-range control should be visible again. */
const SHOW_TIME_RANGE_FILTER = false;

export default function AgentDependenciesPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AgentDependenciesSummary | null>(null);
  const [eventChainWarning, setEventChainWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const [base, eventResult] = await Promise.all([
        fetchAgentDependencies(days),
        fetchObservationDependencies(days).catch((err) => ({
          error: err instanceof ApiError ? err.message : "Event chains unavailable",
        })),
      ]);
      if (seq !== loadSeq.current) return;

      let merged = base;

      if (eventResult && "error" in eventResult) {
        setEventChainWarning(eventResult.error);
      } else {
        setEventChainWarning(null);
        if (Array.isArray(eventResult)) {
          merged = mergeDependencySummaries(base, eventResult);
        }
      }

      setData(merged);
      hasDataRef.current = true;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load agent dependencies",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days]);

  useAppRefresh(load);

  const hasContent =
    data &&
    (data.process_chains.length > 0 ||
      data.shared_resources.length > 0 ||
      data.risks.length > 0);

  return (
    <AppShell
      title="Agent Dependencies & Data Flow"
      subtitle="How agents feed each other and what shared resources they rely on."
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
        <span className="text-brand-ink">Dependencies</span>
      </nav>

      {SHOW_TIME_RANGE_FILTER ? (
        <PageToolbar>
          <Select
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={TIME_RANGE_OPTIONS.filter((o) =>
              ["7", "14", "30"].includes(o.value),
            )}
            aria-label="Activity window"
          />
          {data ? (
            <PageChip variant="muted">
              {daysToTimeRangeLabel(days)}
              {loading && hasDataRef.current ? " · refreshing…" : ""}
            </PageChip>
          ) : null}
        </PageToolbar>
      ) : null}

      {loading && !hasDataRef.current ? (
        <PageLoading message="Loading dependencies…" />
      ) : null}

      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}

      {eventChainWarning && !error && (
        <Alert variant="warn" role="status" className="mb-4">
          Live event chains could not be loaded ({eventChainWarning}). Task and
          scenario pipelines are still shown.
        </Alert>
      )}

      {data && !hasContent && !loading ? (
        <PageEmpty
          title="No dependency data"
          message="Register agents and run tasks or multi-step scenarios to build process chains."
          hint={{ label: "Open agent registry", href: "/agents" }}
        />
      ) : null}

      {data && hasContent ? (
        <AgentDependenciesDashboard data={data} />
      ) : null}
    </AppShell>
  );
}
