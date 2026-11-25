"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ObservationPlaneDashboard } from "@/components/ObservationPlaneViews";
import { Alert } from "@/components/ui/Alert";
import { PageChip } from "@/components/ui/PageChip";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError, fetchGovernanceViolations } from "@/lib/api";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { ago, daysToTimeRangeLabel } from "@/lib/format";
import { VIOLATION_REVIEW_OBSERVATION_DAYS } from "@/lib/governance-pages";
import {
  loadObservationPlaneSnapshot,
  type ObservationPlaneSnapshot,
} from "@/lib/observation-plane";
import type { GovernanceViolationRow } from "@/lib/types";

/** Flip to true when the observation plane toolbar should be visible again. */
const SHOW_PAGE_TOOLBAR = false;

const DAY_OPTIONS = [7, 14, 30] as const;

function parseDays(raw: string | null, fromViolation: boolean): number {
  const n = Number(raw);
  if ((DAY_OPTIONS as readonly number[]).includes(n)) return n;
  return fromViolation ? VIOLATION_REVIEW_OBSERVATION_DAYS : 7;
}

export default function ObservationPlanePage() {
  return (
    <Suspense
      fallback={
        <AppShell
          title="Observation Plane"
          subtitle="Canonical capture across vendors — signed events, coverage, and audit chain."
        >
          <PageLoading message="Loading observation data…" />
        </AppShell>
      }
    >
      <ObservationPlanePageInner />
    </Suspense>
  );
}

function ViolationReviewBanner({ violation }: { violation: GovernanceViolationRow }) {
  const detail =
    violation.ruleDescription ??
    (violation.policyOutcome === "violated"
      ? "Policy outcome: violated"
      : "Threshold check failed");
  const outcome =
    violation.policyOutcome ??
    (violation.passedThresholds ? "passed" : "failed");

  return (
    <Alert variant="warn" role="status" className="mb-4">
      <p className="font-semibold text-brand-ink">Violation under review</p>
      <p className="mt-1 text-sm text-brand-muted">
        <span className="font-mono text-brand-ink">{violation.eventId}</span>
        {" · "}
        <span className="font-mono">{violation.agentId}</span>
        {" · "}
        {violation.ruleName ?? violation.skill ?? "Unknown rule"}
        {" · "}
        {detail}
        {" · "}
        first seen {ago(violation.capturedAt)}
        {" · "}
        outcome <span className="font-mono uppercase">{outcome}</span>
      </p>
      <p className="mt-2 text-sm text-brand-muted">
        This event is not in the live stream for the selected window. It still
        appears under Rules &amp; Compliance because the violations feed is not
        day-bounded.
      </p>
      <Link
        href="/rules-compliance"
        className="mt-2 inline-block text-sm text-brand-primary hover:underline"
      >
        Back to Rules &amp; Compliance
      </Link>
    </Alert>
  );
}

function ObservationPlanePageInner() {
  const searchParams = useSearchParams();
  const agentFilter = searchParams.get("agent") ?? "";
  const eventFilter = searchParams.get("event") ?? "";
  const fromViolationReview = searchParams.get("via") === "violation";
  const [days, setDays] = useState(() =>
    parseDays(searchParams.get("days"), fromViolationReview),
  );
  const [snapshot, setSnapshot] = useState<ObservationPlaneSnapshot | null>(null);
  const [violationContext, setViolationContext] =
    useState<GovernanceViolationRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const data = await loadObservationPlaneSnapshot(days);
      if (seq !== loadSeq.current) return;
      setSnapshot(data);
      hasDataRef.current = true;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load observation plane data",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days]);

  useAppRefresh(load);

  useEffect(() => {
    if (!eventFilter || !snapshot) {
      setViolationContext(null);
      return;
    }
    const inStream = snapshot.events.some((e) => e.eventId === eventFilter);
    if (inStream) {
      setViolationContext(null);
      return;
    }
    let cancelled = false;
    void fetchGovernanceViolations(200)
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((r) => r.eventId === eventFilter) ?? null;
        setViolationContext(match);
      })
      .catch(() => {
        if (!cancelled) setViolationContext(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eventFilter, snapshot]);

  const hasEvents = (snapshot?.meta.eventCount ?? 0) > 0;
  const showDashboard =
    snapshot &&
    (hasEvents || fromViolationReview || Boolean(agentFilter) || Boolean(eventFilter));

  return (
    <AppShell
      title="Observation Plane"
      subtitle="Canonical capture across vendors — signed events, coverage, and audit chain."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/live-monitor" className="hover:text-brand-primary">
          Monitor
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Observation Plane</span>
      </nav>

      {SHOW_PAGE_TOOLBAR ? (
        <PageToolbar>
          <Select
            value={String(days)}
            onChange={(v) => setDays(Number(v))}
            options={TIME_RANGE_OPTIONS.filter((o) =>
              ["7", "14", "30"].includes(o.value),
            )}
            aria-label="Capture window"
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
        <PageLoading message="Loading observation data…" />
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {snapshot?.warnings.map((w) => (
        <Alert key={w} variant="warn" role="status" className="mb-4">
          {w}
        </Alert>
      ))}

      {violationContext ? (
        <ViolationReviewBanner violation={violationContext} />
      ) : null}

      {snapshot && !showDashboard && !loading ? (
        <PageEmpty
          title="No events yet"
          message="Canonical events appear when agents complete tasks or observation capture is active."
          hint={{ label: "Open Live Monitor", href: "/live-monitor" }}
        />
      ) : null}

      {showDashboard ? (
        <>
          <p className="mb-3 max-w-3xl text-sm leading-relaxed text-brand-muted">
            Five capture mechanisms — model gateway, hyperscaler proxy, OTel, vendor
            webhook, eBPF — translate every agent decision into the FuzeBox Canonical
            Event v1, signed and chained. This is the boundary observation layer (Patent
            Family 6).
          </p>
          <div className="mb-4 flex flex-wrap gap-2">
            <PageChip>Patent Family 6 · Boundary + Economic Routing</PageChip>
            <PageChip variant="muted">OBS-01..15</PageChip>
            {fromViolationReview ? (
              <PageChip variant="muted">{daysToTimeRangeLabel(days)} window</PageChip>
            ) : null}
          </div>
          <ObservationPlaneDashboard
            snapshot={snapshot}
            initialAgentFilter={agentFilter}
            initialEventId={eventFilter}
            fromViolationReview={fromViolationReview}
          />
        </>
      ) : null}
    </AppShell>
  );
}
