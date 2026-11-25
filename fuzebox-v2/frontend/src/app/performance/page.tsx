"use client";

import Link from "next/link";
import { Suspense, useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import {
  PerformanceDashboard,
  type PerformanceTab,
} from "@/components/PerformanceDashboardViews";
import { Alert } from "@/components/ui/Alert";
import { PageChip } from "@/components/ui/PageChip";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError } from "@/lib/api";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { daysToTimeRangeLabel } from "@/lib/format";
import { loadPerformanceData } from "@/lib/performance-dashboard";
import type { PerformanceSummary } from "@/lib/types";

const PERFORMANCE_TABS: PerformanceTab[] = [
  "reliability",
  "latency",
  "throughput",
  "leaderboard",
];

function parsePerformanceTab(value: string | null): PerformanceTab {
  if (value && PERFORMANCE_TABS.includes(value as PerformanceTab)) {
    return value as PerformanceTab;
  }
  return "reliability";
}

function PerformancePageContent() {
  const searchParams = useSearchParams();
  const initialTab = parsePerformanceTab(searchParams.get("tab"));
  const [days, setDays] = useState(7);
  const [granularity, setGranularity] = useState("day");
  const [data, setData] = useState<PerformanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const summary = await loadPerformanceData(days, granularity);
      if (seq !== loadSeq.current) return;
      setData(summary);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load performance data",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days, granularity]);

  useAppRefresh(load);

  const hasMetrics =
    data != null &&
    (data.completion_rates.length > 0 || data.leaderboard.length > 0);

  return (
    <>
      <PageToolbar>
        <Select
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={TIME_RANGE_OPTIONS.filter((o) =>
            ["7", "14", "30"].includes(o.value),
          )}
          aria-label="Time range"
        />
        {data ? (
          <PageChip variant="muted">
            {daysToTimeRangeLabel(data.days)}
            {loading ? " · refreshing…" : ""}
          </PageChip>
        ) : null}
      </PageToolbar>

      {loading && !data ? <PageLoading message="Loading performance data…" /> : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {data && !hasMetrics && !loading ? (
        <PageEmpty
          title="No performance data yet"
          message="Run the pipeline or load demo data so agents complete tasks in the selected window."
          hint={{ label: "Open overview", href: "/overview" }}
        />
      ) : null}

      {data && hasMetrics ? (
        <PerformanceDashboard
          data={data}
          granularity={granularity}
          onGranularityChange={setGranularity}
          loadingThroughput={loading}
          initialTab={initialTab}
        />
      ) : null}
    </>
  );
}

export default function PerformancePage() {
  return (
    <AppShell
      title="Performance"
      subtitle="Reliability, latency, throughput, and agent rankings."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/overview" className="hover:text-brand-primary">
          Overview
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Performance</span>
      </nav>

      <Suspense fallback={<PageLoading message="Loading performance data…" />}>
        <PerformancePageContent />
      </Suspense>
    </AppShell>
  );
}
