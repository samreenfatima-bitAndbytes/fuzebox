"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { CoverageManifestDashboard } from "@/components/CoverageManifestViews";
import { Alert } from "@/components/ui/Alert";
import { PageChip } from "@/components/ui/PageChip";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError } from "@/lib/api";
import {
  loadCoverageManifestData,
  type CoverageManifestData,
} from "@/lib/coverage-manifest";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { daysToTimeRangeLabel } from "@/lib/format";

/** Flip to true when the coverage manifest toolbar should be visible again. */
const SHOW_PAGE_TOOLBAR = false;

export default function CoverageManifestPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<CoverageManifestData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const manifest = await loadCoverageManifestData(days);
      if (seq !== loadSeq.current) return;
      setData(manifest);
      hasDataRef.current = true;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load coverage manifest",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days]);

  useAppRefresh(load);

  const hasRows = (data?.rows.length ?? 0) > 0;

  return (
    <AppShell
      title="Coverage Manifest"
      subtitle="Signed capture surfaces per hyperscaler — telemetry health and gap detection."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/observation-plane" className="hover:text-brand-primary">
          Observation
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Coverage Manifest</span>
      </nav>

      {SHOW_PAGE_TOOLBAR ? (
        <PageToolbar>
          <Select
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={TIME_RANGE_OPTIONS.filter((o) =>
              ["7", "14", "30"].includes(o.value),
            )}
            aria-label="Telemetry window"
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
        <PageLoading message="Loading coverage manifest…" />
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {data && !hasRows && !loading ? (
        <PageEmpty
          title="No coverage surfaces yet"
          message="Surfaces appear when canonical events are captured from agent tasks or observation ingest."
          hint={{ label: "Open Observation Plane", href: "/observation-plane" }}
        />
      ) : null}

      {data && hasRows ? (
        <>
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-brand-muted">
            The coverage manifest is the contract layer between FuzeBox AEOS and every
            hyperscaler surface. Each row is signed at activation; missing signatures or
            stale telemetry generate coverage gap alerts.
          </p>
          <CoverageManifestDashboard data={data} />
        </>
      ) : null}
    </AppShell>
  );
}
