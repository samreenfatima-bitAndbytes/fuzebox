"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AgentRosterDashboard } from "@/components/AgentRosterViews";
import { Alert } from "@/components/ui/Alert";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageChip } from "@/components/ui/PageChip";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError, fetchEnrichedAgents } from "@/lib/api";
import { buildAgentRosterDataFromEnriched } from "@/lib/agent-roster";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { daysToTimeRangeLabel } from "@/lib/format";

/** Flip to true when the roster time-range control should be visible again. */
const SHOW_TIME_RANGE_FILTER = false;

export default function AgentRosterPage() {
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<
    ReturnType<typeof buildAgentRosterDataFromEnriched> | null
  >(null);
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const enriched = await fetchEnrichedAgents(days);
      if (seq !== loadSeq.current) return;
      const built = buildAgentRosterDataFromEnriched(enriched);
      setRoster(built);
      hasDataRef.current = built.summary.registered > 0;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load agent roster",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days]);

  useAppRefresh(load);

  return (
    <AppShell
      title="Agent Roster"
      subtitle="Trust tiers, run quality, and fleet health — T0 through T4."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/agents" className="hover:text-brand-primary">
          My AI Agents
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Roster</span>
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
          {roster ? (
            <PageChip variant="muted">
              {daysToTimeRangeLabel(days)}
              {loading && hasDataRef.current ? " · refreshing…" : ""}
            </PageChip>
          ) : null}
        </PageToolbar>
      ) : null}

      {loading && !hasDataRef.current ? (
        <PageLoading message="Loading agent roster…" />
      ) : null}

      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}

      {roster && roster.summary.registered === 0 && !loading ? (
        <PageEmpty
          title="No agents registered"
          message="Create agents in the registry to see trust tiers and run health here."
          hint={{ label: "Open agent registry", href: "/agents" }}
        />
      ) : null}

      {roster && roster.summary.registered > 0 ? (
        <AgentRosterDashboard roster={roster} />
      ) : null}
    </AppShell>
  );
}
