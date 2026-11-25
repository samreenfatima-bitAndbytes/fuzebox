"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RunReviewDashboard } from "@/components/RunReviewDashboardViews";
import { TrainingStudioModal } from "@/components/TrainingStudioModal";
import {
  RUN_REVIEW_PAGE_INFO,
  RunReviewInfoTip,
  RunReviewPageHeader,
} from "@/components/RunReviewChrome";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError } from "@/lib/api";
import { loadRunReviewData } from "@/lib/run-review-dashboard";
import type { RunReviewSummary } from "@/lib/types";

export default function RunReviewPage() {
  const [data, setData] = useState<RunReviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [studioOpen, setStudioOpen] = useState(false);
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const summary = await loadRunReviewData();
      if (seq !== loadSeq.current) return;
      setData(summary);
      hasDataRef.current = true;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load run review",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, []);

  useAppRefresh(load);

  const openStudio = (workflowId: string) => {
    setSelectedId(workflowId);
    setStudioOpen(true);
  };

  return (
    <AppShell title="Run Review">
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/scenario-builder" className="hover:text-brand-primary">
          Studio
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="inline-flex items-center gap-1.5 text-brand-ink">
          Run Review
          <RunReviewInfoTip
            text={RUN_REVIEW_PAGE_INFO}
            label="About Run Review"
          />
        </span>
      </nav>

      <RunReviewPageHeader />

      {loading && !hasDataRef.current ? (
        <PageLoading message="Loading run review…" />
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {data ? (
        <RunReviewDashboard
          data={data}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          selectedId={selectedId}
          onSelectRun={openStudio}
        />
      ) : null}

      <TrainingStudioModal
        workflowId={selectedId}
        open={studioOpen}
        onClose={() => {
          setStudioOpen(false);
          setSelectedId(null);
        }}
      />
    </AppShell>
  );
}
