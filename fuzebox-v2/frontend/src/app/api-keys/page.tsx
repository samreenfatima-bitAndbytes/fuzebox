"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ApiKeysDashboard } from "@/components/GovernanceViews";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError } from "@/lib/api";
import { loadApiKeysData } from "@/lib/governance-pages";
import type { ApiKeyRow } from "@/lib/types";

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const rows = await loadApiKeysData();
      if (seq !== loadSeq.current) return;
      setKeys(rows);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      const message =
        err instanceof ApiError
          ? err.message
          : "Failed to load API keys";
      setError(
        err instanceof ApiError && err.status === 403
          ? "Admin role required to manage API keys."
          : message,
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, []);

  useAppRefresh(load);

  return (
    <AppShell
      title="API Keys"
      subtitle="Manage Workforce integration keys for your tenant"
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/rules-compliance" className="hover:text-brand-primary">
          Governance
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">API Keys</span>
      </nav>

      {loading && keys.length === 0 ? (
        <PageLoading message="Loading API keys…" />
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {keys.length > 0 || !loading ? (
        <ApiKeysDashboard keys={keys} onReload={load} loading={loading} />
      ) : null}
    </AppShell>
  );
}
