"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { UnreviewedDecisionsDashboard } from "@/components/GovernanceViews";
import { Alert } from "@/components/ui/Alert";
import { PageChip } from "@/components/ui/PageChip";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError } from "@/lib/api";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { loadUnreviewedDecisionsData } from "@/lib/governance-pages";
import type {
  GovernanceCoverageRow,
  GovernanceGapRow,
} from "@/lib/types";

/** Flip to true when the unreviewed decisions toolbar should be visible again. */
const SHOW_PAGE_TOOLBAR = false;

export default function UnreviewedDecisionsPage() {
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [gaps, setGaps] = useState<GovernanceGapRow[]>([]);
  const [coverage, setCoverage] = useState<GovernanceCoverageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const data = await loadUnreviewedDecisionsData(days);
      if (seq !== loadSeq.current) return;
      setGaps(data.gaps);
      setCoverage(data.coverage);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load unreviewed decisions",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days]);

  const hasData = gaps.length > 0 || coverage.length > 0;

  useAppRefresh(load);

  return (
    <AppShell
      title="Unreviewed Decisions"
      subtitle="Decisions that bypass human review based on the agent's trust tier. EU AI Act Article 14 and ISO/IEC 42001 require demonstrable oversight — every gap below proposes a review gate."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/quality" className="hover:text-brand-primary">
          Governance
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Unreviewed Decisions</span>
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
          <PageChip variant="muted">
            {gaps.length} oversight gaps
            {loading && hasData ? " · refreshing…" : ""}
          </PageChip>
          <label className="sr-only" htmlFor="ud-search">
            Search gaps
          </label>
          <input
            id="ud-search"
            type="search"
            placeholder="Search agent or skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="fb-input ml-auto min-w-[12rem] text-sm"
          />
        </PageToolbar>
      ) : null}

      {loading && gaps.length === 0 ? (
        <PageLoading message="Loading oversight gaps…" />
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {hasData || !loading ? (
        <UnreviewedDecisionsDashboard
          gaps={gaps}
          coverage={coverage}
          search={search}
          riskFilter={riskFilter}
          onRiskFilterChange={setRiskFilter}
          onReload={load}
          loading={loading}
        />
      ) : null}
    </AppShell>
  );
}
