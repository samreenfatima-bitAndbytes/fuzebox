"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DeployAgentCodeDashboard } from "@/components/DeployAgentCodeViews";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError } from "@/lib/api";
import {
  loadDeployAgentCodeData,
  type DeployAgentCodeData,
} from "@/lib/deploy-agent-code";

export default function DeployAgentCodePage() {
  const [data, setData] = useState<DeployAgentCodeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const snapshot = await loadDeployAgentCodeData();
      if (seq !== loadSeq.current) return;
      setData(snapshot);
      hasDataRef.current = true;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load deployment data",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, []);

  useAppRefresh(load);

  return (
    <AppShell
      title="Deploy Agent Code"
      subtitle="Parse, validate, and register JSON manifests, CrewAI programs, or Python agents."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/coverage-manifest" className="hover:text-brand-primary">
          Coverage
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Deploy Agent Code</span>
      </nav>

      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {loading && !hasDataRef.current ? (
        <PageLoading message="Loading deployments…" />
      ) : null}

      {data ? (
        <DeployAgentCodeDashboard data={data} onDeployed={load} />
      ) : null}
    </AppShell>
  );
}
