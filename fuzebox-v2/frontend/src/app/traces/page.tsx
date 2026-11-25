"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TracesTipCard } from "@/components/TracesChrome";
import { TracesDashboard } from "@/components/TracesDashboardViews";
import { Alert } from "@/components/ui/Alert";
import { PageChip } from "@/components/ui/PageChip";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError, fetchTraceDetail, fetchTraceList } from "@/lib/api";
import type { TraceDetail } from "@/lib/types";

export default function TracesPage() {
  const [traceIds, setTraceIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const loadSeq = useRef(0);
  const detailSeq = useRef(0);
  const hasListRef = useRef(false);
  const detailTraceRef = useRef<string | null>(null);

  const loadList = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasListRef.current;
    if (!isRefresh) setLoadingList(true);
    try {
      const res = await fetchTraceList(50);
      if (seq !== loadSeq.current) return;
      setTraceIds(res.trace_ids);
      hasListRef.current = true;
      setListError(null);
      if (res.trace_ids.length > 0) {
        setSelectedId((prev) =>
          prev && res.trace_ids.includes(prev) ? prev : res.trace_ids[0],
        );
      } else {
        setSelectedId(null);
        setDetail(null);
        detailTraceRef.current = null;
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setListError(
        err instanceof ApiError ? err.message : "Failed to load trace list",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoadingList(false);
    }
  }, []);

  const loadDetail = useCallback(async (traceId: string) => {
    const seq = ++detailSeq.current;
    const isSameTrace = detailTraceRef.current === traceId;
    if (!isSameTrace) {
      setLoadingDetail(true);
      setDetail(null);
      detailTraceRef.current = null;
    }
    try {
      const next = await fetchTraceDetail(traceId);
      if (seq !== detailSeq.current) return;
      setDetail(next);
      detailTraceRef.current = traceId;
      setDetailError(null);
    } catch (err) {
      if (seq !== detailSeq.current) return;
      if (!isSameTrace) setDetail(null);
      setDetailError(
        err instanceof ApiError ? err.message : "Failed to load trace detail",
      );
    } finally {
      if (seq !== detailSeq.current) return;
      setLoadingDetail(false);
    }
  }, []);

  const refreshTraces = useCallback(async () => {
    await loadList();
  }, [loadList]);

  useAppRefresh(refreshTraces);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const selectOptions = useMemo(
    () => traceIds.map((id) => ({ value: id, label: id })),
    [traceIds],
  );

  return (
    <AppShell
      title="Traces"
      subtitle="Timeline and span details for workflow debugging and demos."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/run-review" className="hover:text-brand-primary">
          Run Review
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Traces</span>
      </nav>

      {traceIds.length > 0 ? (
        <PageToolbar>
          <PageChip variant="muted">
            {traceIds.length} trace{traceIds.length === 1 ? "" : "s"}
            {loadingList && hasListRef.current ? " · refreshing…" : ""}
          </PageChip>
        </PageToolbar>
      ) : null}

      {loadingList && !hasListRef.current ? (
        <PageLoading message="Loading traces…" />
      ) : null}

      {listError ? (
        <Alert variant="error" role="alert">
          {listError}
        </Alert>
      ) : null}

      {detailError ? (
        <Alert variant="error" role="alert">
          {detailError}
        </Alert>
      ) : null}

      {hasListRef.current && traceIds.length === 0 && !loadingList ? (
        <PageEmpty
          title="No traces yet"
          message="Run seed_traces.py or execute scenarios to populate trace data."
          hint={{ label: "Scenario builder", href: "/scenario-builder" }}
        />
      ) : null}

      {traceIds.length > 0 ? (
        <div className="mb-6 grid gap-4 xl:grid-cols-[2.2fr_1fr] xl:gap-6">
          <div>
            <label
              htmlFor="trace-select"
              className="mb-1.5 block text-sm font-medium text-brand-ink"
            >
              Select trace
            </label>
            <Select
              id="trace-select"
              value={selectedId ?? traceIds[0]}
              onChange={setSelectedId}
              options={selectOptions}
              aria-label="Select trace"
              className="w-full max-w-xl"
            />
          </div>
          <TracesTipCard />
        </div>
      ) : null}

      {loadingDetail && !detail ? (
        <PageLoading message="Loading trace spans…" />
      ) : null}

      {detail ? (
        <>
          {loadingDetail ? (
            <p className="mb-3 text-xs text-brand-muted">Refreshing trace spans…</p>
          ) : null}
          <TracesDashboard detail={detail} />
        </>
      ) : null}
    </AppShell>
  );
}
