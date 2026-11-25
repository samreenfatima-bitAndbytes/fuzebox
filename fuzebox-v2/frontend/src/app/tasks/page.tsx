"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TaskScorecardsDashboard } from "@/components/TaskScorecardsViews";
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
import { loadTaskScorecardsData } from "@/lib/task-scorecards";
import type { TaskScorecardsSummary } from "@/lib/types";

export default function TasksPage() {
  const [days, setDays] = useState(7);
  const [group, setGroup] = useState("All");
  const [data, setData] = useState<TaskScorecardsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const summary = await loadTaskScorecardsData(days, group);
      if (seq !== loadSeq.current) return;
      setData(summary);
      setGroup(summary.selected_group);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load scorecards",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, [days, group]);

  useAppRefresh(load);

  const hasRows = (data?.rows.length ?? 0) > 0;

  return (
    <AppShell
      title="Tasks"
      subtitle="Completion scorecards and success-rate breakdowns by agent and type."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/overview" className="hover:text-brand-primary">
          Overview
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Tasks</span>
      </nav>

      <PageToolbar>
        <Select
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={TIME_RANGE_OPTIONS.filter((o) =>
            ["7", "14", "30"].includes(o.value),
          )}
          aria-label="Time range"
        />
        <Select
          value={group}
          onChange={setGroup}
          disabled={!data}
          options={(data?.groups ?? ["All"]).map((g) => ({
            value: g,
            label: g === "All" ? "All groups" : g,
          }))}
          aria-label="Agent group"
        />
        {data && (
          <PageChip variant="muted">
            {daysToTimeRangeLabel(data.days)}
            {group !== "All" ? ` · ${group}` : ""}
          </PageChip>
        )}
      </PageToolbar>

      {loading && !data ? <PageLoading message="Loading scorecards…" /> : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {data && !hasRows && !loading ? (
        <PageEmpty
          title="No scorecards yet"
          message="Task scorecards appear when agents complete work in the selected window."
          hint={{ label: "Open overview", href: "/overview" }}
        />
      ) : null}

      {data && hasRows ? <TaskScorecardsDashboard data={data} /> : null}
    </AppShell>
  );
}
