"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useShell } from "@/components/ShellProvider";
import { QualityKpiGrid } from "@/components/QualityKpiGrid";
import { QualityTabs } from "@/components/QualityTabs";
import { Alert } from "@/components/ui/Alert";
import { PageChip } from "@/components/ui/PageChip";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError } from "@/lib/api";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { daysToTimeRangeLabel } from "@/lib/format";
import { getSession } from "@/lib/auth";
import { setPendingWorkflow } from "@/lib/pending-workflow";
import {
  loadTasksReviewsData,
  parseQualityTab,
  type TasksReviewsData,
} from "@/lib/tasks-reviews";

/** Flip to true when the quality page filter toolbar should be visible again. */
const SHOW_PAGE_TOOLBAR = false;

export default function QualityPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Tasks & Reviews" subtitle="Loading…">
          <PageLoading message="Loading tasks and reviews…" />
        </AppShell>
      }
    >
      <QualityPageInner />
    </Suspense>
  );
}

function QualityPageInner() {
  const searchParams = useSearchParams();
  const initialTab = parseQualityTab(searchParams.get("tab"));
  const filterAgentId = searchParams.get("agent") ?? "";
  const highlightEventId = searchParams.get("event") ?? "";

  const [days, setDays] = useState(7);
  const [data, setData] = useState<TasksReviewsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);
  const { triggerRefresh } = useShell();
  const canWrite = getSession()?.role !== "readonly";

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const snapshot = await loadTasksReviewsData(days);
      if (seq !== loadSeq.current) return;
      setData(snapshot);
      hasDataRef.current = true;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load tasks and reviews",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days]);

  useAppRefresh(load);

  const hasTasks = (data?.quality.kpis.total ?? 0) > 0;
  const showTabs = Boolean(data);

  return (
    <AppShell
      title="Tasks & Reviews"
      subtitle="Task outcomes, AI screening, and human-in-the-loop governance reviews."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/live-monitor" className="hover:text-brand-primary">
          Monitor
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Tasks & Reviews</span>
      </nav>

      {SHOW_PAGE_TOOLBAR ? (
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
              {daysToTimeRangeLabel(data.days)}
              {loading && hasDataRef.current ? " · refreshing…" : ""}
              {" · "}
              {data.quality.kpis.total} tasks · {data.reviews.length} reviews
            </PageChip>
          ) : null}
        </PageToolbar>
      ) : null}

      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {loading && !hasDataRef.current ? (
        <PageLoading message="Loading tasks and reviews…" />
      ) : null}

      {showTabs ? (
        <div className="space-y-5">
          {hasTasks ? (
            <QualityKpiGrid kpis={data!.quality.kpis} days={data!.days} />
          ) : null}
          <QualityTabs
            tasks={data!.quality.tasks}
            total={data!.quality.kpis.total}
            days={data!.days}
            initialTab={initialTab}
            highlightEventId={highlightEventId}
            filterAgentId={filterAgentId}
            canWrite={canWrite}
            onPipelineStarted={(requestId) => {
              setPendingWorkflow(requestId);
            }}
            onTaskQueued={triggerRefresh}
          />
        </div>
      ) : null}
    </AppShell>
  );
}
