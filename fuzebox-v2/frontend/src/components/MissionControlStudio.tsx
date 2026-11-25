"use client";

import { useCallback, useEffect, useState } from "react";
import { useShell } from "@/components/ShellProvider";
import { formatStudioStartedAt } from "@/lib/format";
import { WORKFLOW_EMPTY_INPUT_REASON } from "@/lib/constants";
import { Alert } from "@/components/ui/Alert";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { PageLoading } from "@/components/ui/PageLoading";
import { SelectField } from "@/components/ui/Select";
import {
  HandlerBar,
  PRECISION_OPTIONS,
  StepExpander,
  TONE_OPTIONS,
} from "@/components/studio/shared";
import {
  StudioBaselineKpis,
  StudioRequestPanel,
  StudioStepsOverviewTable,
  StudioTabBar,
  StudioTabPanel,
  StudioWorkflowMeta,
} from "@/components/studio/StudioLayout";
import {
  ApiError,
  fetchPipelineStatus,
  fetchWorkflowStudio,
  runV2Rerun,
  saveV2Tune,
} from "@/lib/api";
import type {
  ComparePayload,
  PipelineStatus,
  TuneDefaults,
  TuneRequest,
  WorkflowStudio,
} from "@/lib/types";

type Tab = "summary" | "steps" | "tuning" | "compare";

const MC_STUDIO_TABS = [
  { id: "summary" as const, label: "Summary" },
  { id: "steps" as const, label: "Steps" },
  { id: "tuning" as const, label: "Tuning" },
  { id: "compare" as const, label: "Compare" },
];

export function MissionControlStudio({ workflowId }: { workflowId: string }) {
  const { refreshTick, showToast } = useShell();
  const [studio, setStudio] = useState<WorkflowStudio | null>(null);
  const [tab, setTab] = useState<Tab>("summary");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tune, setTune] = useState<TuneDefaults | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [rerunId, setRerunId] = useState<string | null>(null);
  const [pollStatus, setPollStatus] = useState<PipelineStatus | null>(null);
  const [polling, setPolling] = useState(false);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkflowStudio(id);
      setStudio(data);
      setTune(data.tune_defaults);
      setPollStatus(null);
      setRerunId(null);
      setLiveLogs([]);
    } catch (err) {
      setStudio(null);
      setError(
        err instanceof ApiError ? err.message : "Failed to load workflow",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setTab("summary");
    load(workflowId);
  }, [workflowId, load, refreshTick]);

  useEffect(() => {
    if (!rerunId || !polling) return;
    let cancelled = false;
    let attempts = 0;

    const tick = async () => {
      attempts += 1;
      try {
        const data = await fetchPipelineStatus(rerunId);
        if (cancelled) return;
        if (data.status === "pending") {
          if (attempts <= 3 || attempts % 5 === 0) {
            setLiveLogs((prev) => [
              ...prev,
              `⏳ [${attempts}s] Pipeline running…`,
            ]);
          }
          if (attempts >= 60) {
            setPolling(false);
            setLiveLogs((prev) => [
              ...prev,
              "⏱️ Timeout — pipeline may still be running. Refresh to check.",
            ]);
          }
          return;
        }
        setPollStatus(data);
        setPolling(false);
        const lines = [`🚀 Request submitted — ID: ${rerunId}`];
        for (const step of data.steps) {
          const icon = step.result === "success" ? "✅" : "🔴";
          const conf =
            step.confidence_score != null
              ? ` | conf: ${(step.confidence_score * 100).toFixed(0)}%`
              : "";
          lines.push(
            `${icon} Step ${step.step} — ${step.step_name} \`${step.agent_id}\` → ${step.result} (${step.latency_ms ?? 0}ms${conf})`,
          );
        }
        if (data.escalated) {
          lines.push(`🔴 ESCALATED — ${data.escalation_reason ?? ""}`);
        } else {
          lines.push(
            `✅ Pipeline complete — ${data.status.toUpperCase()} | Cost: $${data.total_cost_usd.toFixed(5)}`,
          );
        }
        setLiveLogs(lines);
        load(workflowId);
        setTab("compare");
      } catch {
        /* keep polling */
      }
    };

    const id = window.setInterval(tick, 1000);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [rerunId, polling, workflowId, load]);

  const compareData: ComparePayload | null =
    pollStatus && pollStatus.status !== "pending"
      ? {
          status: pollStatus.status,
          escalated: pollStatus.escalated,
          escalation_reason: pollStatus.escalation_reason,
          total_cost_usd: pollStatus.total_cost_usd,
          steps: pollStatus.steps.map((s) => ({
            step: s.step,
            step_name: s.step_name,
            agent_id: s.agent_id,
            result: s.result,
            latency_ms: s.latency_ms,
            confidence_score: s.confidence_score,
            escalation_flag: s.escalation_flag ?? false,
          })),
          from_db: false,
        }
      : studio?.compare ?? null;

  const handleSave = async () => {
    if (!tune) return;
    setActionMsg(null);
    try {
      await saveV2Tune(tune as TuneRequest);
      showToast("Parameters saved.");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Save failed", "error");
    }
  };

  const handleRun = async () => {
    if (!studio || !tune) return;
    if (!studio.input_text) {
      setActionMsg(WORKFLOW_EMPTY_INPUT_REASON);
      return;
    }
    setActionMsg(null);
    try {
      await saveV2Tune(tune as TuneRequest);
      const res = await runV2Rerun(studio.input_text, studio.workflow_id);
      setRerunId(res.request_id);
      setPolling(true);
      setTab("tuning");
      setLiveLogs([
        `🚀 Request submitted — ID: ${res.request_id}`,
        "⏳ Waiting for pipeline to start…",
      ]);
      setActionMsg(`Re-run started (${res.request_id}).`);
      showToast(`Re-run started (${res.request_id}).`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Run failed", "error");
    }
  };

  if (loading) {
    return <PageLoading message="Loading tuning studio…" />;
  }
  if (error) {
    return (
      <Alert variant="error" role="alert">
        {error}
      </Alert>
    );
  }
  if (!studio || !tune) return null;

  const outcomeLabel = studio.escalated
    ? "ESCALATED"
    : studio.result.toUpperCase();
  const outcomeColor = studio.escalated
    ? "#DC2626"
    : studio.result === "success"
      ? "#2DA44E"
      : "#F59E0B";

  return (
    <div className="fb-card-accent-top p-4 sm:p-6">
      <StudioWorkflowMeta
        workflowIdShort={studio.workflow_id_short}
        scenarioId={studio.scenario_id}
        startedLabel={formatStudioStartedAt(studio.started_at)}
      />
      <h3 className="mt-4 text-lg font-semibold">Tuning Studio</h3>
      <StudioTabBar tabs={MC_STUDIO_TABS} active={tab} onChange={setTab} className="mt-4" />

        {tab === "summary" && (
          <StudioTabPanel id="panel-summary" labelledBy="tab-summary">
          <div className="space-y-6">
            <ChartPanel
              title="Original request"
              subtitle="The exact input that triggered this run."
            >
              <StudioRequestPanel text={studio.input_text} />
            </ChartPanel>
            <ChartPanel
              title="Baseline snapshot"
              subtitle="V1 performance for the selected workflow."
            >
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold"
                style={{ color: outcomeColor, borderColor: outcomeColor }}
              >
                {outcomeLabel}
              </span>
              <StudioBaselineKpis
                totalLatencyMs={studio.total_latency_ms}
                totalTokens={studio.total_tokens}
                totalCostUsd={studio.total_cost_usd}
                avgConfidence={studio.avg_confidence}
              />
            </ChartPanel>
            {studio.steps_overview.length > 0 && (
              <ChartPanel title="Steps overview">
                <StudioStepsOverviewTable rows={studio.steps_overview} />
              </ChartPanel>
            )}
          </div>
          </StudioTabPanel>
        )}

        {tab === "steps" && (
          <StudioTabPanel id="panel-steps" labelledBy="tab-steps">
          <div className="space-y-4">
            <section className="fb-surface-panel p-4">
              <h4 className="fb-section-title">V1 step details</h4>
              <div className="mt-3 space-y-2">
                {studio.v1_steps.map((s, i) => (
                  <StepExpander
                    key={`v1-${i}`}
                    step={s}
                    label={`Step ${s.step_number ?? "?"} — ${s.step_name} · ${s.agent_id}`}
                  />
                ))}
              </div>
            </section>
            {studio.v2_steps.length > 0 ? (
              <section className="fb-surface-panel p-4">
                <h4 className="fb-section-title">V2 step details</h4>
                <div className="mt-3 space-y-2">
                  {studio.v2_steps.map((s, i) => (
                    <StepExpander
                      key={`v2-${i}`}
                      step={s}
                      label={`Step ${s.step_number ?? "?"} — ${s.step_name} · ${s.agent_id}`}
                    />
                  ))}
                </div>
              </section>
            ) : (
              <p className="text-sm text-brand-muted">
                No V2 run found yet for this workflow.
              </p>
            )}
          </div>
          </StudioTabPanel>
        )}

        {tab === "tuning" && (
          <StudioTabPanel id="panel-tuning" labelledBy="tab-tuning">
          <div className="space-y-6">
            <section className="fb-surface-panel p-4">
              <h4 className="fb-section-title">Parameter dials</h4>
              <p className="mt-1 text-xs text-brand-muted">
                Adjust settings, save, then optionally re-run.
              </p>
              <div className="mt-4 grid gap-6 xl:grid-cols-2">
                <div className="space-y-4">
                  <label className="block text-sm">
                    Confidence threshold
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={tune.confidence_threshold}
                      onChange={(e) =>
                        setTune({
                          ...tune,
                          confidence_threshold: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full"
                    />
                    <span className="text-xs tabular-nums">
                      {tune.confidence_threshold.toFixed(2)}
                    </span>
                  </label>
                  <label className="block text-sm">
                    Sentiment weight
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={tune.sentiment_weight}
                      onChange={(e) =>
                        setTune({
                          ...tune,
                          sentiment_weight: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full"
                    />
                    <span className="text-xs tabular-nums">
                      {tune.sentiment_weight.toFixed(2)}
                    </span>
                  </label>
                  <label className="block text-sm">
                    Fallback depth
                    <input
                      type="range"
                      min={1}
                      max={5}
                      step={1}
                      value={tune.fallback_depth}
                      onChange={(e) =>
                        setTune({
                          ...tune,
                          fallback_depth: Number(e.target.value),
                        })
                      }
                      className="mt-1 w-full"
                    />
                    <span className="text-xs tabular-nums">{tune.fallback_depth}</span>
                  </label>
                </div>
                <div className="space-y-4">
                  <SelectField
                    label="Tone variant"
                    value={tune.tone_variant}
                    onChange={(tone_variant) => setTune({ ...tune, tone_variant })}
                    className="w-full"
                    options={TONE_OPTIONS.map((o) => ({ value: o, label: o }))}
                  />
                  <SelectField
                    label="Prompt precision"
                    value={tune.prompt_precision}
                    onChange={(prompt_precision) =>
                      setTune({ ...tune, prompt_precision })
                    }
                    className="w-full"
                    options={PRECISION_OPTIONS.map((o) => ({
                      value: o,
                      label: o,
                    }))}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={tune.data_prefetch}
                      onChange={(e) =>
                        setTune({ ...tune, data_prefetch: e.target.checked })
                      }
                    />
                    Data pre-fetch (Agent 2)
                  </label>
                </div>
              </div>
            </section>

            <section className="fb-surface-panel p-4">
              <h4 className="fb-section-title">Actions</h4>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  className="fb-btn"
                >
                  Save parameters
                </button>
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={polling}
                  className="fb-btn-primary disabled:opacity-50"
                >
                  {polling ? "Running…" : "Re-run with V2 settings"}
                </button>
              </div>
              {actionMsg && (
                <p className="mt-2 text-sm text-brand-muted">{actionMsg}</p>
              )}
            </section>

            {(polling || liveLogs.length > 0) && (
              <section className="fb-panel p-4">
                <h4 className="fb-section-title">Live execution log</h4>
                <ul className="mt-3 space-y-1 text-sm">
                  {liveLogs.map((line, i) => (
                    <li key={i} className="font-mono text-xs">
                      {line}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          </StudioTabPanel>
        )}

        {tab === "compare" && (
          <StudioTabPanel id="panel-compare" labelledBy="tab-compare">
          <div className="space-y-6">
            {!compareData ? (
              <p className="text-sm text-brand-muted">
                No V2 run yet. Save parameters and click “Re-run with V2 settings”
                to generate a comparison.
              </p>
            ) : (
              <>
                {compareData.ran_at && (
                  <p className="text-sm text-brand-muted">
                    Last V2 run: {compareData.ran_at}
                  </p>
                )}
                {(() => {
                  const v1Lat = studio.total_latency_ms;
                  const v2Lat = compareData.steps.reduce(
                    (s, x) => s + (x.latency_ms ?? 0),
                    0,
                  );
                  const v1Cost = studio.total_cost_usd;
                  const v2Cost = compareData.total_cost_usd;
                  const v1Esc = studio.escalated;
                  const v2Esc = compareData.escalated;
                  const costDelta = v2Cost - v1Cost;
                  const latDelta = v2Lat - v1Lat;
                  const v2Status = compareData.status.toUpperCase();

                  const tableRows: [string, string, string, string][] = [
                    [
                      "Status",
                      studio.result.toUpperCase(),
                      v2Status,
                      "",
                    ],
                    [
                      "Total cost",
                      `$${v1Cost.toFixed(5)}`,
                      `$${v2Cost.toFixed(5)}`,
                      `${costDelta >= 0 ? "+" : ""}${costDelta.toFixed(5)}`,
                    ],
                    [
                      "Total latency",
                      `${v1Lat.toFixed(0)}ms`,
                      `${v2Lat.toFixed(0)}ms`,
                      `${latDelta >= 0 ? "+" : ""}${latDelta.toFixed(0)}ms`,
                    ],
                    [
                      "Escalated",
                      v1Esc ? "Yes" : "No",
                      v2Esc ? "Yes" : "No",
                      "",
                    ],
                    [
                      "Agent handle rate",
                      v1Esc ? "0%" : "100%",
                      v2Esc ? "0%" : "100%",
                      "",
                    ],
                  ];

                  return (
                    <>
                      <section className="fb-surface-panel p-4">
                        <h4 className="fb-section-title">At a glance</h4>
                        <KpiGrid className="fb-kpi-grid-dense mt-3 sm:grid-cols-3">
                          <KpiCard
                            compact
                            label="Δ Cost"
                            value={`${costDelta >= 0 ? "+" : ""}${costDelta.toFixed(5)}`}
                          />
                          <KpiCard
                            compact
                            label="Δ Latency"
                            value={`${latDelta >= 0 ? "+" : ""}${latDelta.toFixed(0)} ms`}
                          />
                          <KpiCard
                            compact
                            label="V2 outcome"
                            value={v2Esc ? "ESCALATED" : "AGENT HANDLED"}
                          />
                        </KpiGrid>
                      </section>

                      <section className="fb-surface-panel p-4">
                        <h4 className="fb-section-title">Side-by-side</h4>
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b text-xs uppercase text-brand-muted">
                                <th className="py-2 pr-2">Metric</th>
                                <th className="py-2 pr-2">V1 baseline</th>
                                <th className="py-2 pr-2">V2 tuned</th>
                                <th className="py-2 text-right">Δ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tableRows.map(([metric, v1, v2, delta]) => (
                                <tr
                                  key={metric}
                                  className="border-b border-brand-border/60"
                                >
                                  <td className="py-2 font-medium">{metric}</td>
                                  <td className="py-2">{v1}</td>
                                  <td className="py-2">{v2}</td>
                                  <td className="py-2 text-right tabular-nums">
                                    {delta || "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section className="fb-surface-panel p-4">
                        <h4 className="fb-section-title">
                          Return on Pipeline (RoP)
                        </h4>
                        <div className="mt-3 grid gap-3 sm:grid-cols-4">
                          <div>
                            <div className="text-xs text-brand-muted">V1 TUoP</div>
                            <div className="font-semibold">
                              {(studio.rop.v1.tuop * 100).toFixed(0)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-brand-muted">V2 TUoP</div>
                            <div className="font-semibold">
                              {(studio.rop.v2.tuop * 100).toFixed(0)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-brand-muted">V1 RoP</div>
                            <div className="font-semibold">
                              {studio.rop.v1.rop.toFixed(0)}×
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-brand-muted">V2 RoP</div>
                            <div className="font-semibold">
                              {studio.rop.v2.rop.toFixed(0)}×
                            </div>
                          </div>
                        </div>
                      </section>

                      <section className="fb-surface-panel p-4">
                        <h4 className="fb-section-title">
                          Human ↔ Agent ratio shift
                        </h4>
                        <HandlerBar label="V1 Baseline" escalated={v1Esc} />
                        <HandlerBar label="V2 Tuned" escalated={v2Esc} />
                        {v1Esc && !v2Esc && (
                          <p className="text-sm text-green-700">
                            Improvement — moved from human to agent handling.
                          </p>
                        )}
                        {!v1Esc && v2Esc && (
                          <p className="text-sm text-red-700">
                            Regression — now requires human handling.
                          </p>
                        )}
                        {!v1Esc && !v2Esc && (
                          <p className="text-sm text-blue-700">
                            No ratio change — agent handled in both V1 and V2.
                          </p>
                        )}
                        {v1Esc && v2Esc && (
                          <p className="text-sm text-amber-700">
                            Still escalated in V2. Try lowering the confidence
                            threshold.
                          </p>
                        )}
                      </section>
                    </>
                  );
                })()}
              </>
            )}
          </div>
          </StudioTabPanel>
        )}
    </div>
  );
}
