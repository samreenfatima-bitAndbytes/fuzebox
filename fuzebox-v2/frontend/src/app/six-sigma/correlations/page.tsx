"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  CognitionCorrelationList,
  CognitionPlaneIntro,
  CognitionPlaneKpis,
} from "@/components/CognitionPlaneViews";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError, fetchCorrelations } from "@/lib/api";
import { daysToTimeRangeLabel } from "@/lib/format";
import type { CognitionPlaneSummary } from "@/lib/types";

const DAYS = 7;

export default function SixSigmaCorrelationsPage() {
  const [data, setData] = useState<CognitionPlaneSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchCorrelations(DAYS));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load correlations",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useAppRefresh(load);

  return (
    <AppShell
      title="Correlation Engine"
      subtitle="Six Sigma — auto-discovered patterns across cost, quality, latency, and policy."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/six-sigma/correlations" className="hover:text-brand-primary">
          Six Sigma
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Correlations</span>
      </nav>

      {loading && <PageLoading message="Mining correlations…" />}

      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          <CognitionPlaneIntro
            eventCount={data.event_count}
            updatedAt={data.updated_at}
            timeRangeLabel={daysToTimeRangeLabel(data.days)}
          />
          <CognitionPlaneKpis kpis={data.kpis} />
          <CognitionCorrelationList correlations={data.correlations} />
        </div>
      )}
    </AppShell>
  );
}
