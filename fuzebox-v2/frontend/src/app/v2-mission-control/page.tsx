"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/ui/Alert";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageChip } from "@/components/ui/PageChip";
import { PageToolbar } from "@/components/ui/PageToolbar";
import {
  MissionControlInbox,
  MissionControlRunsSummary,
} from "@/components/MissionControlViews";
import { MissionControlStudio } from "@/components/MissionControlStudio";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError, fetchRunReviewSummary } from "@/lib/api";
import type { RunReviewSummary } from "@/lib/types";

function V2MissionControlContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<RunReviewSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchRunReviewSummary());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load mission control",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useAppRefresh(load);

  useEffect(() => {
    const wf = searchParams.get("wf");
    if (wf) setSelectedId(wf);
  }, [searchParams]);

  const selectRun = (id: string) => {
    setSelectedId(id);
    router.replace(`/v2-mission-control?wf=${encodeURIComponent(id)}`, {
      scroll: false,
    });
  };

  return (
    <AppShell
      title="V2 Mission Control"
      subtitle="Select a V1 run → adjust tuning parameters → re-run → compare before / after."
    >
      <PageToolbar>
        <PageChip>Operator · split view</PageChip>
        <PageChip variant="muted">Deep link from Run Review</PageChip>
      </PageToolbar>

      {loading && <PageLoading message="Loading runs…" />}

      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}

      {!loading && !error && data && (
        <>
          {data.runs.length === 0 ? (
            <PageEmpty
              title="No runs yet"
              message="No pipeline runs yet. Send requests through the webhook to populate this view."
            />
          ) : (
            <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch">
              <aside className="fb-card-accent-top w-full shrink-0 p-4 xl:w-72 xl:max-h-[calc(100vh-14rem)] xl:overflow-hidden">
                <MissionControlInbox
                  runs={data.runs}
                  selectedId={selectedId}
                  statusFilter={statusFilter}
                  searchQuery={searchQuery}
                  onStatusFilter={setStatusFilter}
                  onSearch={setSearchQuery}
                  onSelect={selectRun}
                  onRefresh={load}
                />
              </aside>

              <main className="min-w-0 flex-1">
                <MissionControlRunsSummary runs={data.runs} />
                {!selectedId ? (
                  <PageEmpty
                    title="Select a run"
                    message="Choose a run from the inbox on the left to open the Tuning Studio."
                  />
                ) : (
                  <MissionControlStudio workflowId={selectedId} />
                )}
              </main>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}

export default function V2MissionControlPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="V2 Mission Control" subtitle="Loading…">
          <PageLoading />
        </AppShell>
      }
    >
      <V2MissionControlContent />
    </Suspense>
  );
}
