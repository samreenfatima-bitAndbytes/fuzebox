"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  UopLibraryCatalog,
  UopLibraryIntro,
  UopLibraryKpis,
} from "@/components/UopLibraryViews";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError, fetchUopLibrary } from "@/lib/api";
import type { UopLibrarySummary } from "@/lib/types";

const MANUAL_COST = 75;

export default function UopLibraryPage() {
  const [data, setData] = useState<UopLibrarySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchUopLibrary(MANUAL_COST));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load UoP library",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useAppRefresh(load);

  return (
    <AppShell
      title="UoP Library"
      subtitle="Economic Cognition — catalogue of measured Units of Production."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <span className="text-brand-ink">Economic Cognition</span>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">UoP Library</span>
      </nav>

      {loading && <PageLoading message="Loading UoP catalogue…" />}

      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          <UopLibraryIntro />
          <UopLibraryKpis kpis={data.kpis} />
          <UopLibraryCatalog entries={data.entries} />
        </div>
      )}
    </AppShell>
  );
}
