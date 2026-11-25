"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DeploymentHealthSheet } from "@/components/DeploymentHealthSheet";
import { LiveMonitorDashboard } from "@/components/LiveMonitorViews";
import { useDeploymentHealth } from "@/hooks/useDeploymentHealth";
import { Alert } from "@/components/ui/Alert";
import { AlertModal } from "@/components/ui/AlertModal";
import { PageChip } from "@/components/ui/PageChip";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError } from "@/lib/api";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { daysToTimeRangeLabel } from "@/lib/format";
import {
  buildLiveMonitorSnapshot,
  LIVE_MONITOR_REFRESH_SEC,
  loadLiveMonitorSources,
} from "@/lib/live-monitor";

function formatRefreshTime(d: Date): string {
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function relativeRefreshLabel(d: Date | null): string {
  if (!d) return "—";
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  return formatRefreshTime(d);
}

/** Flip to true when the live monitor time-range control should be visible again. */
const SHOW_TIME_RANGE_FILTER = false;

export default function LiveMonitorPage() {
  const [days, setDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [snapshot, setSnapshot] = useState<ReturnType<
    typeof buildLiveMonitorSnapshot
  > | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [configureOpen, setConfigureOpen] = useState(false);
  const [emergencyPauseOpen, setEmergencyPauseOpen] = useState(false);
  const deploymentHealth = useDeploymentHealth();
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const sources = await loadLiveMonitorSources(days);
      if (seq !== loadSeq.current) return;
      setWarnings(sources.warnings);
      setSnapshot(
        buildLiveMonitorSnapshot(
          sources.observation,
          sources.overview,
          sources.quality,
          sources.agents,
          sources.performance,
          sources.days,
          sources.enrichedAgents,
          {
            deploymentPolling: deploymentHealth.polling,
            deploymentActiveAgents:
              deploymentHealth.result?.active_agents ?? null,
            deploymentStatus: deploymentHealth.result?.status ?? null,
            deploymentPollError: deploymentHealth.error,
            deploymentPolledAt: deploymentHealth.lastPolledAt,
          },
        ),
      );
      hasDataRef.current = true;
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load live monitor",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [
    days,
    deploymentHealth.polling,
    deploymentHealth.result?.active_agents,
    deploymentHealth.result?.status,
    deploymentHealth.error,
    deploymentHealth.lastPolledAt,
  ]);

  useAppRefresh(load);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, LIVE_MONITOR_REFRESH_SEC * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  const refreshLabel = relativeRefreshLabel(lastRefresh);

  const hasData = (snapshot?.eventsObserved ?? 0) > 0;

  const handleEmergencyPause = useCallback(() => {
    setEmergencyPauseOpen(true);
  }, []);

  return (
    <AppShell
      title="Live Monitor"
      subtitle="Operational pulse for your agent fleet — events, health, and recent activity."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/overview" className="hover:text-brand-primary">
          Home
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Live Monitor</span>
      </nav>

      {SHOW_TIME_RANGE_FILTER ? (
        <PageToolbar>
          <Select
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={TIME_RANGE_OPTIONS.filter((o) =>
              ["7", "14", "30"].includes(o.value),
            )}
            aria-label="Time range"
          />
          {snapshot ? (
            <PageChip variant="muted">
              {daysToTimeRangeLabel(days)}
              {loading && hasDataRef.current ? " · refreshing…" : ""}
            </PageChip>
          ) : null}
        </PageToolbar>
      ) : null}

      {loading && !hasDataRef.current ? (
        <PageLoading message="Loading live monitor…" />
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {warnings.length > 0 ? (
        <Alert variant="warn" role="status" className="mb-4">
          {warnings.join(" · ")}
        </Alert>
      ) : null}

      {snapshot && !hasData && !loading ? (
        <PageEmpty
          title="No activity yet"
          message="Load demo data or run the pipeline to populate the live monitor."
        />
      ) : null}

      {snapshot && hasData ? (
        <LiveMonitorDashboard
          snapshot={snapshot}
          lastRefreshLabel={refreshLabel}
          refreshSeconds={LIVE_MONITOR_REFRESH_SEC}
          onConfigure={() => setConfigureOpen(true)}
          onEmergencyPause={handleEmergencyPause}
          deploymentPolling={deploymentHealth.polling}
          deploymentActiveAgents={deploymentHealth.result?.active_agents ?? null}
          deploymentStatus={deploymentHealth.result?.status ?? null}
          deploymentPollError={deploymentHealth.error}
          deploymentPolledAt={deploymentHealth.lastPolledAt}
        />
      ) : null}

      <DeploymentHealthSheet
        open={configureOpen}
        onClose={() => setConfigureOpen(false)}
        health={deploymentHealth}
      />

      <AlertModal
        open={emergencyPauseOpen}
        onClose={() => setEmergencyPauseOpen(false)}
        title="Emergency pause not available"
        description="Emergency Pause All Agents is not connected to the orchestrator yet. Use Scenario Builder or agent status to disable agents until this action is implemented."
        variant="warn"
        titleId="emergency-pause-alert-title"
      />
    </AppShell>
  );
}
