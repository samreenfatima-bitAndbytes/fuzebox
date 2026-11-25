"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ScenarioBuilderPageHeader } from "@/components/ScenarioBuilderChrome";
import { useShell } from "@/components/ShellProvider";
import { TalkingPoints } from "@/components/TalkingPoints";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import {
  // ScenarioAgentsTab,
  ScenarioCostTab,
  ScenarioLibrary,
  ScenarioPipelineTab,
  ScenarioSavePanel,
  ScenarioTeamTab,
} from "@/components/ScenarioBuilderViews";
import {
  ApiError,
  createScenario,
  fetchAgent,
  fetchAgents,
  fetchScenario,
  fetchScenarios,
  updateScenario,
} from "@/lib/api";
import { getSession } from "@/lib/auth";
import {
  detailToDraft,
  draftToWriteBody,
  emptyDraft,
  type ScenarioDraft,
} from "@/lib/scenario-draft";
import type {
  AgentDetail,
  AgentRegistryItem,
  ScenarioSummary,
} from "@/lib/types";

type Tab = "agents" | "team" | "pipeline" | "cost" | "save";

const TABS: { id: Tab; label: string }[] = [
  // { id: "agents", label: "1) Agents" },
  { id: "team", label: "2) Team" },
  { id: "pipeline", label: "3) Pipeline" },
  { id: "cost", label: "4) Cost Model" },
  { id: "save", label: "5) Save & Library" },
];

export default function ScenarioBuilderPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Scenario builder" subtitle="Loading…">
          <PageLoading message="Loading scenario builder…" />
        </AppShell>
      }
    >
      <ScenarioBuilderPageInner />
    </Suspense>
  );
}

function ScenarioBuilderPageInner() {
  const searchParams = useSearchParams();
  const focusAgent = searchParams.get("agent");
  const focusScenario = searchParams.get("scenario");

  const session = getSession();
  const canWrite = session?.role !== "readonly";
  const { showToast } = useShell();

  const [draft, setDraft] = useState<ScenarioDraft>(emptyDraft);
  const [agents, setAgents] = useState<AgentRegistryItem[]>([]);
  const [agentDetails, setAgentDetails] = useState<AgentDetail[]>([]);
  const [library, setLibrary] = useState<ScenarioSummary[]>([]);
  const [tab, setTab] = useState<Tab>("team");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const loadSeq = useRef(0);
  const hasDataRef = useRef(false);

  const loadMeta = useCallback(async () => {
    const seq = ++loadSeq.current;
    const isRefresh = hasDataRef.current;
    if (!isRefresh) setLoading(true);
    try {
      const [agentList, scenarios] = await Promise.all([
        fetchAgents(),
        fetchScenarios(),
      ]);
      if (seq !== loadSeq.current) return;
      setAgents(agentList);
      setLibrary(scenarios);
      const details = await Promise.all(
        agentList.map((a) => fetchAgent(a.agent_id)),
      );
      if (seq !== loadSeq.current) return;
      setAgentDetails(details);
      hasDataRef.current = true;
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError ? err.message : "Failed to load scenario builder",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, []);

  useAppRefresh(loadMeta);

  // useEffect(() => {
  //   if (focusAgent && agents.some((a) => a.agent_id === focusAgent)) {
  //     setTab("agents");
  //   }
  // }, [focusAgent, agents]);

  useEffect(() => {
    if (!focusScenario) return;
    let cancelled = false;
    fetchScenario(focusScenario)
      .then((detail) => {
        if (!cancelled) {
          setDraft(detailToDraft(detail));
          setSaveMsg(null);
          setTab("save");
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load scenario",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [focusScenario]);

  const patchDraft = (patch: Partial<ScenarioDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaveMsg(null);
  };

  const handleSave = async () => {
    if (!canWrite) return;
    if (!draft.name.trim()) {
      setSaveMsg("Please enter a scenario name before saving.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const body = draftToWriteBody(draft);
      const saved = draft.editingId
        ? await updateScenario(draft.editingId, body)
        : await createScenario(body);
      setDraft(detailToDraft(saved));
      showToast(`Scenario “${saved.name}” saved.`);
      await loadMeta();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "Failed to save scenario";
      setSaveMsg(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (scenarioId: string) => {
    setError(null);
    try {
      const detail = await fetchScenario(scenarioId);
      setDraft(detailToDraft(detail));
      setSaveMsg(null);
      setTab("team");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load scenario",
      );
    }
  };

  return (
    <AppShell
      title="Scenario Builder"
      subtitle="Configure agent teams, pipeline steps, cost models, and save scenarios."
    >
      <TalkingPoints
        title="What this demonstrates"
        bullets={[
          "Build real agent workflows — teams, pipelines, and cost models — from the UI.",
          "Scenarios are saved to the database and can be loaded, edited, and executed.",
          "Compare cost vs manual effort before committing to a configuration.",
        ]}
      />

      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/overview" className="hover:text-brand-primary">
          Dashboard
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Scenario Builder</span>
      </nav>

      <ScenarioBuilderPageHeader />

      {loading && !hasDataRef.current ? (
        <PageLoading message="Loading scenario builder…" />
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {hasDataRef.current ? (
        <>
        {!canWrite ? (
          <p className="mb-4 text-sm text-brand-muted">
            Read-only — contact an admin to save scenarios.
          </p>
        ) : null}

        <div className="space-y-6">
          <div className="fb-card-accent-top">
            <div className="border-b border-brand-border px-4 py-3 sm:px-6">
              <PageTabs tabs={TABS} active={tab} onChange={setTab} />
            </div>
            <div className="p-4 sm:p-6">
              {/* {tab === "agents" && (
                <PageTabPanel id="panel-agents" labelledBy="tab-agents">
                  <ScenarioAgentsTab
                    agents={agents}
                    canWrite={canWrite}
                    focusAgentId={focusAgent}
                    onRefresh={loadMeta}
                  />
                </PageTabPanel>
              )} */}
              {tab === "team" && (
                <PageTabPanel id="panel-team" labelledBy="tab-team">
                  <ScenarioTeamTab
                    draft={draft}
                    agents={agents}
                    agentDetails={agentDetails}
                    onChange={patchDraft}
                  />
                </PageTabPanel>
              )}
              {tab === "pipeline" && (
                <PageTabPanel id="panel-pipeline" labelledBy="tab-pipeline">
                  <ScenarioPipelineTab
                    draft={draft}
                    agents={agents}
                    onChange={(pipeline) => patchDraft({ pipeline })}
                  />
                </PageTabPanel>
              )}
              {tab === "cost" && (
                <PageTabPanel id="panel-cost" labelledBy="tab-cost">
                  <ScenarioCostTab
                    draft={draft}
                    onChange={(cost) => patchDraft({ cost })}
                  />
                </PageTabPanel>
              )}
              {tab === "save" && (
                <PageTabPanel id="panel-save" labelledBy="tab-save">
                  <div className="space-y-8">
                    <ScenarioSavePanel
                      draft={draft}
                      canWrite={canWrite}
                      saving={saving}
                      message={saveMsg}
                      onChange={patchDraft}
                      onSave={handleSave}
                      onNew={() => {
                        setDraft(emptyDraft());
                        setSaveMsg(null);
                      }}
                    />
                    <div>
                      <h3 className="fb-section-title text-sm">Scenario library</h3>
                      <p className="mb-4 mt-1 text-xs text-brand-muted">
                        Previously saved workflows. Load one to edit, or change
                        status and pricing from the row actions without reopening
                        every tab.
                      </p>
                      <ScenarioLibrary
                        library={library}
                        canWrite={canWrite}
                        onLoad={handleLoad}
                        onRefresh={loadMeta}
                      />
                    </div>
                  </div>
                </PageTabPanel>
              )}
            </div>
          </div>
        </div>
        </>
      ) : null}
    </AppShell>
  );
}
