"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AgentsMatricesTab,
  AgentsRegistryTab,
  AgentsViolationsTab,
} from "@/components/AgentViews";
import { AppShell } from "@/components/AppShell";
import { DeployAgentCodeDashboard } from "@/components/DeployAgentCodeViews";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import {
  ApiError,
  fetchAgents,
  fetchAgentViolations,
  fetchPermissionsMatrix,
  fetchSkillsMatrix,
} from "@/lib/api";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { getSession } from "@/lib/auth";
import {
  loadDeployAgentCodeData,
  type DeployAgentCodeData,
} from "@/lib/deploy-agent-code";
import type { AgentMatrix, AgentRegistryItem, AgentViolation } from "@/lib/types";

type Tab = "registry" | "matrices" | "violations" | "deploy";

const AGENT_TABS = [
  { id: "registry" as const, label: "Registry" },
  { id: "matrices" as const, label: "Matrices" },
  { id: "violations" as const, label: "Violations" },
  { id: "deploy" as const, label: "Deploy Agent" },
];

function parseAgentTab(value: string | null): Tab {
  if (value && AGENT_TABS.some((t) => t.id === value)) {
    return value as Tab;
  }
  return "registry";
}

export default function AgentsPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Agents" subtitle="Loading…">
          <PageLoading message="Loading agents…" />
        </AppShell>
      }
    >
      <AgentsPageInner />
    </Suspense>
  );
}

function AgentsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = parseAgentTab(searchParams.get("tab"));
  const session = getSession();
  const canWrite = session?.role !== "readonly";

  const [agents, setAgents] = useState<AgentRegistryItem[]>([]);
  const [matrixFilterIds, setMatrixFilterIds] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [skills, setSkills] = useState<AgentMatrix | null>(null);
  const [permissions, setPermissions] = useState<AgentMatrix | null>(null);
  const [violations, setViolations] = useState<AgentViolation[]>([]);
  const [deployData, setDeployData] = useState<DeployAgentCodeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tabError, setTabError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMatrices, setLoadingMatrices] = useState(false);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [loadingDeploy, setLoadingDeploy] = useState(false);

  const loadSeq = useRef(0);
  const matrixSeq = useRef(0);
  const violationSeq = useRef(0);
  const deploySeq = useRef(0);
  const hasAgentsRef = useRef(false);
  const hasDeployDataRef = useRef(false);

  const loadAgents = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasAgentsRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const list = await fetchAgents();
      if (seq !== loadSeq.current) return;
      setAgents(list);
      hasAgentsRef.current = list.length > 0;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load agents",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, []);

  const loadMatrices = useCallback(async (ids: string[]) => {
    const seq = ++matrixSeq.current;
    setLoadingMatrices(true);
    setTabError(null);
    try {
      const [s, p] = await Promise.all([
        fetchSkillsMatrix(ids),
        fetchPermissionsMatrix(ids),
      ]);
      if (seq !== matrixSeq.current) return;
      setSkills(s);
      setPermissions(p);
    } catch (err) {
      if (seq !== matrixSeq.current) return;
      setTabError(
        err instanceof ApiError ? err.message : "Failed to load matrices",
      );
    } finally {
      if (seq !== matrixSeq.current) return;
      setLoadingMatrices(false);
    }
  }, []);

  const loadViolations = useCallback(async () => {
    const seq = ++violationSeq.current;
    setLoadingViolations(true);
    setTabError(null);
    try {
      const res = await fetchAgentViolations();
      if (seq !== violationSeq.current) return;
      setViolations(res.violations);
    } catch (err) {
      if (seq !== violationSeq.current) return;
      setTabError(
        err instanceof ApiError ? err.message : "Failed to load violations",
      );
    } finally {
      if (seq !== violationSeq.current) return;
      setLoadingViolations(false);
    }
  }, []);

  const loadDeploy = useCallback(async () => {
    const seq = ++deploySeq.current;
    const isRefresh = hasDeployDataRef.current;
    if (!isRefresh) setLoadingDeploy(true);
    setTabError(null);
    try {
      const snapshot = await loadDeployAgentCodeData();
      if (seq !== deploySeq.current) return;
      setDeployData(snapshot);
      hasDeployDataRef.current = true;
    } catch (err) {
      if (seq !== deploySeq.current) return;
      setTabError(
        err instanceof ApiError
          ? err.message
          : "Failed to load deployment data",
      );
    } finally {
      if (seq !== deploySeq.current) return;
      setLoadingDeploy(false);
    }
  }, []);

  const handleDeployed = useCallback(async () => {
    await Promise.all([loadDeploy(), loadAgents()]);
  }, [loadDeploy, loadAgents]);

  useAppRefresh(loadAgents);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (tab === "matrices" && agents.length > 0) {
      loadMatrices(matrixFilterIds);
    }
  }, [tab, matrixFilterIds, agents.length, loadMatrices]);

  useEffect(() => {
    if (tab === "violations") {
      loadViolations();
    }
  }, [tab, loadViolations]);

  useEffect(() => {
    if (tab === "deploy") {
      loadDeploy();
    }
  }, [tab, loadDeploy]);

  const hasAgents = agents.length > 0;
  const showInitialLoading = loading && !hasAgentsRef.current && tab !== "deploy";

  return (
    <AppShell
      title="Agents"
      subtitle="Registry, skills, permissions, policy violations, and code deployment."
    >
      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        {hasAgents ? (
          <span className="text-sm tabular-nums text-brand-muted">
            {agents.length} agents in registry
            {loading ? " · refreshing…" : ""}
          </span>
        ) : null}
        {canWrite ? (
          <Link href="/agents/new" className="fb-btn-primary">
            Create agent
          </Link>
        ) : null}
      </div>

      {showInitialLoading ? (
        <PageLoading message="Loading agents…" />
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      <div className="fb-card-accent-top">
        <div className="border-b border-brand-border px-4 py-3 sm:px-6">
          <PageTabs tabs={AGENT_TABS} active={tab} onChange={setTab} />
        </div>
        <div className="p-4 sm:p-6">
          {tabError ? (
            <Alert variant="error" role="alert" className="mb-4">
              {tabError}
            </Alert>
          ) : null}
          {tab === "registry" && (
            <PageTabPanel id="panel-registry" labelledBy="tab-registry">
              {!showInitialLoading && !error ? (
                <AgentsRegistryTab
                  agents={agents}
                  canWrite={canWrite}
                  onRefresh={loadAgents}
                />
              ) : null}
            </PageTabPanel>
          )}
          {tab === "matrices" && (
            <PageTabPanel id="panel-matrices" labelledBy="tab-matrices">
              <AgentsMatricesTab
                agents={agents}
                matrixFilterIds={matrixFilterIds}
                onMatrixFilterChange={setMatrixFilterIds}
                skills={skills}
                permissions={permissions}
                loading={loadingMatrices}
              />
            </PageTabPanel>
          )}
          {tab === "violations" && (
            <PageTabPanel id="panel-violations" labelledBy="tab-violations">
              <AgentsViolationsTab
                violations={violations}
                loading={loadingViolations}
              />
            </PageTabPanel>
          )}
          {tab === "deploy" && (
            <PageTabPanel id="panel-deploy" labelledBy="tab-deploy">
              {loadingDeploy && !hasDeployDataRef.current ? (
                <PageLoading message="Loading deployments…" />
              ) : null}
              {deployData ? (
                <DeployAgentCodeDashboard
                  data={deployData}
                  onDeployed={() => void handleDeployed()}
                />
              ) : null}
            </PageTabPanel>
          )}
        </div>
      </div>
    </AppShell>
  );
}
