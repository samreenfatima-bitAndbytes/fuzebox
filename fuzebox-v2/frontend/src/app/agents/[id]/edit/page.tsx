"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AgentForm } from "@/components/AgentForm";
import { AppShell } from "@/components/AppShell";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageChip } from "@/components/ui/PageChip";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { useShell } from "@/components/ShellProvider";
import { ApiError, deleteAgent, fetchAgent, updateAgent } from "@/lib/api";
import { getSession } from "@/lib/auth";
import type { AgentDetail } from "@/lib/types";

export default function EditAgentPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Edit agent" subtitle="Loading…">
          <PageLoading message="Loading agent…" />
        </AppShell>
      }
    >
      <EditAgentPageInner />
    </Suspense>
  );
}

function EditAgentPageInner() {
  const params = useParams();
  const router = useRouter();
  const agentId = decodeURIComponent(String(params.id ?? ""));
  const session = getSession();
  const canWrite = session?.role !== "readonly";
  const { refreshTick, showToast } = useShell();

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAgent(agentId);
        if (!cancelled) setAgent(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Failed to load agent",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (agentId) load();
    return () => {
      cancelled = true;
    };
  }, [agentId, refreshTick]);

  return (
    <AppShell title="Edit agent" subtitle="Update registry fields for this agent.">
      <PageToolbar>
        <Link href="/agents" className="fb-btn">
          ← Back to registry
        </Link>
        {agent && (
          <PageChip variant="muted" className="ml-auto hidden font-mono sm:inline-flex">
            {agent.agent_id}
          </PageChip>
        )}
      </PageToolbar>

      {loading && <PageLoading message="Loading agent…" />}

      {error && (
        <Alert variant="error" className="mb-6" role="alert">
          {error}
          <div className="mt-2">
            <Link href="/agents" className="font-medium text-brand-primary hover:underline">
              Back to registry
            </Link>
          </div>
        </Alert>
      )}

      {!loading && !error && agent && (
        <AgentForm
          mode="edit"
          initial={agent}
          canWrite={canWrite}
          onSubmit={async (values) => {
            const updated = await updateAgent(agentId, values);
            showToast(`Agent “${updated.name}” updated.`);
            router.push("/agents");
          }}
          onDelete={async () => {
            const name = agent.name;
            await deleteAgent(agentId);
            showToast(`Agent “${name}” deleted.`);
            router.push("/agents");
          }}
          onCancel={() => router.push("/agents")}
        />
      )}
    </AppShell>
  );
}
