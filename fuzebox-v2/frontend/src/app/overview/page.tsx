"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { OverviewDashboard } from "@/components/OverviewDashboardViews";
import { useShell } from "@/components/ShellProvider";
import { Alert } from "@/components/ui/Alert";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { PageChip } from "@/components/ui/PageChip";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError, seedDemoData } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { writeDataMode } from "@/lib/data-mode";
import { daysToTimeRangeLabel } from "@/lib/format";
import { loadOverviewData } from "@/lib/overview-dashboard";
import type { OverviewSummary } from "@/lib/types";

export default function OverviewPage() {
  const session = getSession();
  const canWrite = session?.role !== "readonly";
  const { triggerRefresh, showToast } = useShell();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<OverviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const summary = await loadOverviewData(days);
      if (seq !== loadSeq.current) return;
      setData(summary);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load overview",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days]);

  useAppRefresh(load);

  const runLoadDemo = useCallback(async () => {
    setSeeding(true);
    setError(null);
    try {
      await seedDemoData();
      writeDataMode("demo");
      triggerRefresh();
      showToast("Demo data loaded.");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load demo data",
      );
      showToast(
        err instanceof ApiError ? err.message : "Failed to load demo data",
        "error",
      );
    } finally {
      setSeeding(false);
    }
  }, [triggerRefresh, showToast]);

  const hasData = (data?.kpis.total_tasks ?? 0) > 0;

  return (
    <AppShell
      title="Overview"
      subtitle="Fleet outcomes, spend, throughput, and agent leaderboard."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/live-monitor" className="hover:text-brand-primary">
          Monitor
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Overview</span>
      </nav>

      <PageToolbar>
        <Select
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[...TIME_RANGE_OPTIONS]}
          aria-label="Time range"
        />
        <button
          type="button"
          className="fb-btn text-xs"
          onClick={() => setDays(7)}
          disabled={days === 7}
        >
          Reset
        </button>
        {data ? (
          <PageChip variant="muted">
            {daysToTimeRangeLabel(data.days)}
            {loading ? " · refreshing…" : ""}
          </PageChip>
        ) : null}
      </PageToolbar>

      {loading && !data ? <PageLoading message="Loading overview…" /> : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {data && !hasData && !loading ? (
        <PageEmpty
          message={
            canWrite
              ? "Load demo data to populate agents, workflows, and tasks for this dashboard."
              : "An operator can load demo data or run a generate request to populate workflows and tasks."
          }
          action={
            canWrite
              ? {
                  label: "Load demo data",
                  onClick: () => setDemoConfirmOpen(true),
                  loading: seeding,
                }
              : undefined
          }
          hint={{ label: "Open agents registry", href: "/agents" }}
        />
      ) : null}

      {data && hasData ? <OverviewDashboard data={data} /> : null}

      <ConfirmModal
        open={demoConfirmOpen}
        onClose={() => {
          if (seeding) return;
          setDemoConfirmOpen(false);
        }}
        onConfirm={() => {
          void (async () => {
            await runLoadDemo();
            setDemoConfirmOpen(false);
          })();
        }}
        title="Load demo data?"
        description="This adds sample agents, tasks, workflows, and traces to your workspace."
        confirmLabel="Load demo data"
        loading={seeding}
        loadingLabel="Loading…"
        titleId="overview-load-demo-confirm-title"
      />
    </AppShell>
  );
}
