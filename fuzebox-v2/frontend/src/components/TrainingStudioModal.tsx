"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  STUDIO_TIP_BASELINE,
  STUDIO_TIP_CONFIDENCE_THRESHOLD,
  STUDIO_TIP_DATA_PREFETCH,
  STUDIO_TIP_DELTA_COST,
  STUDIO_TIP_DELTA_LATENCY,
  STUDIO_TIP_FALLBACK_DEPTH,
  STUDIO_TIP_ORIGINAL_REQUEST,
  STUDIO_TIP_PROMPT_PRECISION,
  STUDIO_TIP_ROP,
  STUDIO_TIP_SENTIMENT_WEIGHT,
  STUDIO_TIP_STEPS_OVERVIEW,
  STUDIO_TIP_TONE_VARIANT,
  STUDIO_TIP_TUOP,
  StudioFieldLabel,
} from "@/components/RunReviewChrome";
import { useShell } from "@/components/ShellProvider";
import { formatStudioStartedAt } from "@/lib/format";
import { WORKFLOW_EMPTY_INPUT_REASON } from "@/lib/constants";
import {
  HandlerBar,
  StepExpander,
} from "@/components/studio/shared";
import {
  StudioBaselineKpis,
  StudioRequestPanel,
  StudioStepsOverviewTable,
  StudioTabBar,
  StudioTabPanel,
  StudioWorkflowMeta,
} from "@/components/studio/StudioLayout";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { Alert } from "@/components/ui/Alert";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { Modal } from "@/components/ui/Modal";
import { PageLoading } from "@/components/ui/PageLoading";
import { SelectField } from "@/components/ui/Select";
import {
  ApiError,
  fetchPipelineStatus,
  fetchWorkflowStudio,
  runV2Rerun,
  saveV2Tune,
} from "@/lib/api";
import type {
  AgentTelemetryRow,
  ComparePayload,
  PipelineStatus,
  TuneDefaults,
  TuneRequest,
  WorkflowStudio,
} from "@/lib/types";

function AgentTelemetryCaption({
  tel,
  variant,
}: {
  tel: AgentTelemetryRow;
  variant: "step1" | "step2" | "step3";
}) {
  if (variant === "step1") {
    return (
      <p className="text-xs text-brand-muted">
        All runs — completion: {(tel.completion_rate * 100).toFixed(0)}% | esc
        rate: {(tel.escalation_rate * 100).toFixed(0)}%
      </p>
    );
  }
  if (variant === "step2") {
    return (
      <p className="text-xs text-brand-muted">
        All runs — completion: {(tel.completion_rate * 100).toFixed(0)}% | avg
        time: {(tel.avg_latency_ms / 1000).toFixed(1)}s
      </p>
    );
  }
  return (
    <p className="text-xs text-brand-muted">
      All runs — accuracy: {(tel.accuracy * 100).toFixed(0)}% | avg time:{" "}
      {(tel.avg_latency_ms / 1000).toFixed(1)}s
    </p>
  );
}

type Tab = "summary" | "steps" | "train" | "compare";

const STUDIO_TABS = [
  { id: "summary" as const, label: "Summary" },
  { id: "steps" as const, label: "Steps" },
  { id: "train" as const, label: "Tune & Train" },
  { id: "compare" as const, label: "Compare" },
];

const TONE_OPTIONS = ["formal", "empathetic", "direct", "concise"];
const PRECISION_OPTIONS = ["standard", "strict", "relaxed"];

export function TrainingStudioModal({
  workflowId,
  open,
  onClose,
}: {
  workflowId: string | null;
  open: boolean;
  onClose: () => void;
}) {
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

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkflowStudio(id);
      setStudio(data);
      setTune(data.tune_defaults);
      setPollStatus(null);
      setRerunId(null);
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
    if (open && workflowId) {
      setTab("summary");
      load(workflowId);
    }
  }, [open, workflowId, load, refreshTick]);

  useEffect(() => {
    if (!rerunId || !polling) return;
    let cancelled = false;
    let attempts = 0;

    const tick = async () => {
      attempts += 1;
      try {
        const data = await fetchPipelineStatus(rerunId);
        if (cancelled) return;
        if (data.status !== "pending") {
          setPollStatus(data);
          setPolling(false);
          if (workflowId) load(workflowId);
          return;
        }
      } catch {
        /* keep polling */
      }
      if (attempts >= 60) setPolling(false);
    };

    const id = window.setInterval(tick, 1000);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [rerunId, polling, workflowId, load]);

  if (!open || !workflowId) return null;

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
      showToast(
        err instanceof ApiError ? err.message : "Save failed",
        "error",
      );
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
      setTab("train");
      setActionMsg(`Training cycle started (${res.request_id}).`);
      showToast(`Training cycle started (${res.request_id}).`);
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Run failed",
        "error",
      );
    }
  };

  const outcomeLabel = studio?.escalated
    ? "ESCALATED"
    : studio?.result.toUpperCase();
  const outcomeColor = studio?.escalated
    ? "#DC2626"
    : studio?.result === "success"
      ? "#2DA44E"
      : "#F59E0B";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      labelledBy="training-studio-title"
    >
      <div className="flex max-h-[90vh] flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border px-6 py-4">
          <h2 id="training-studio-title" className="text-lg font-semibold">
            Training studio
          </h2>
          <div className="flex items-center gap-2">
            {workflowId && (
              <Link
                href={`/v2-mission-control?wf=${encodeURIComponent(workflowId)}`}
                className="fb-btn text-brand-primary"
                onClick={onClose}
              >
                Open in operator view
              </Link>
            )}
            <button type="button" onClick={onClose} className="fb-btn">
              Close
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && <PageLoading message="Loading run detail…" />}
          {error && (
            <Alert variant="error" role="alert">
              {error}
            </Alert>
          )}

          {studio && tune && (
            <>
              <StudioWorkflowMeta
                workflowIdShort={studio.workflow_id_short}
                scenarioId={studio.scenario_id}
                startedLabel={formatStudioStartedAt(studio.started_at)}
              />

              <StudioTabBar tabs={STUDIO_TABS} active={tab} onChange={setTab} />

              {tab === "summary" && (
                <StudioTabPanel id="panel-summary" labelledBy="tab-summary">
                <div className="space-y-6">
                  <ChartPanel
                    title="Original request"
                    subtitle="What came in before the pipeline ran."
                    tip={STUDIO_TIP_ORIGINAL_REQUEST}
                  >
                    <StudioRequestPanel text={studio.input_text} />
                  </ChartPanel>
                  <ChartPanel
                    title="Baseline snapshot"
                    subtitle="How this run scored on the standard (V1) pipeline."
                    tip={STUDIO_TIP_BASELINE}
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
                    <ChartPanel
                      title="Steps overview"
                      subtitle="Quick table of each agent in order."
                      tip={STUDIO_TIP_STEPS_OVERVIEW}
                    >
                      <p className="mb-2 text-xs text-brand-muted">
                        Rows follow run order — step 1 at the top.
                      </p>
                      <StudioStepsOverviewTable rows={studio.steps_overview} />
                    </ChartPanel>
                  )}
                </div>
                </StudioTabPanel>
              )}

              {tab === "steps" && (
                <StudioTabPanel id="panel-steps" labelledBy="tab-steps">
                <div className="space-y-4">
                  <h3 className="fb-section-title">V1 step details</h3>
                  {studio.v1_steps.map((s, i) => (
                    <StepExpander
                      key={`v1-${i}`}
                      step={s}
                      label={`Step ${s.step_number ?? "?"} — ${s.step_name} · ${s.agent_id}`}
                    />
                  ))}
                  {studio.v2_steps.length > 0 ? (
                    <>
                      <h3 className="fb-section-title">V2 step details</h3>
                      {studio.v2_steps.map((s, i) => (
                        <StepExpander
                          key={`v2-${i}`}
                          step={s}
                          label={`Step ${s.step_number ?? "?"} — ${s.step_name} · ${s.agent_id}`}
                        />
                      ))}
                    </>
                  ) : (
                    <p className="text-sm text-brand-muted">
                      No training cycle yet. Use Tune & Train to generate one.
                    </p>
                  )}
                </div>
                </StudioTabPanel>
              )}

              {tab === "train" && (
                <StudioTabPanel id="panel-train" labelledBy="tab-train">
                <div className="space-y-6">
                  <p className="text-sm text-brand-muted">
                    Each section shows telemetry signals for that pipeline step and
                    the dials that control it. Adjust → Run Training Cycle →
                    Compare.
                  </p>

                  <details open className="fb-surface-panel p-4">
                    <summary className="cursor-pointer font-medium">
                      Step 1 — Intake Classifier
                    </summary>
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="text-sm">
                        {studio.tune_signals.step1.confidence != null && (
                          <p>
                            Confidence:{" "}
                            <strong>
                              {(studio.tune_signals.step1.confidence * 100).toFixed(0)}%
                            </strong>
                          </p>
                        )}
                        {studio.tune_signals.step1.escalated ? (
                          <p className="text-red-600">Escalated at this step</p>
                        ) : (
                          <p className="text-green-700">Handled by agent</p>
                        )}
                        {studio.tune_signals.step1.agent_telemetry ? (
                          <AgentTelemetryCaption
                            tel={studio.tune_signals.step1.agent_telemetry}
                            variant="step1"
                          />
                        ) : null}
                      </div>
                      <div className="space-y-3">
                        <label className="block text-sm">
                          <StudioFieldLabel
                            label="Confidence threshold"
                            tip={STUDIO_TIP_CONFIDENCE_THRESHOLD}
                          />
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
                        <div>
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                            <StudioFieldLabel
                              label="Prompt precision"
                              tip={STUDIO_TIP_PROMPT_PRECISION}
                            />
                          </span>
                          <SelectField
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
                        </div>
                      </div>
                    </div>
                  </details>

                  <details open className="fb-surface-panel p-4">
                    <summary className="cursor-pointer font-medium">
                      Step 2 — Triage Scorer
                    </summary>
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="text-sm">
                        {studio.tune_signals.step2.priority != null ? (
                          <p>
                            Priority:{" "}
                            <strong>{studio.tune_signals.step2.priority}/5</strong>
                          </p>
                        ) : (
                          <p className="text-brand-muted">Not reached (escalated at Step 1)</p>
                        )}
                        {studio.tune_signals.step2.agent_telemetry ? (
                          <AgentTelemetryCaption
                            tel={studio.tune_signals.step2.agent_telemetry}
                            variant="step2"
                          />
                        ) : null}
                      </div>
                      <div className="space-y-3">
                        <label className="block text-sm">
                          <StudioFieldLabel
                            label="Sentiment weight"
                            tip={STUDIO_TIP_SENTIMENT_WEIGHT}
                          />
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
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={tune.data_prefetch}
                            onChange={(e) =>
                              setTune({ ...tune, data_prefetch: e.target.checked })
                            }
                          />
                          <StudioFieldLabel
                            label="Data pre-fetch"
                            tip={STUDIO_TIP_DATA_PREFETCH}
                          />
                        </label>
                      </div>
                    </div>
                  </details>

                  <details open className="fb-surface-panel p-4">
                    <summary className="cursor-pointer font-medium">
                      Step 3 — Response Drafter
                    </summary>
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
                      <div className="text-sm">
                        {studio.tune_signals.step3.agent_id ? (
                          <p>Routed to: {studio.tune_signals.step3.agent_id}</p>
                        ) : (
                          <p className="text-brand-muted">
                            Not reached (escalated at an earlier step)
                          </p>
                        )}
                        {studio.tune_signals.step3.auop_score != null ? (
                          <p>
                            AUoP:{" "}
                            <strong>
                              {studio.tune_signals.step3.auop_score.toFixed(3)}
                            </strong>
                          </p>
                        ) : null}
                        {studio.tune_signals.step3.agent_telemetry ? (
                          <AgentTelemetryCaption
                            tel={studio.tune_signals.step3.agent_telemetry}
                            variant="step3"
                          />
                        ) : null}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted">
                            <StudioFieldLabel
                              label="Tone variant"
                              tip={STUDIO_TIP_TONE_VARIANT}
                            />
                          </span>
                          <SelectField
                          value={tune.tone_variant}
                          onChange={(tone_variant) =>
                            setTune({ ...tune, tone_variant })
                          }
                          className="w-full"
                          options={TONE_OPTIONS.map((o) => ({
                            value: o,
                            label: o,
                          }))}
                          />
                        </div>
                        <label className="block text-sm">
                          <StudioFieldLabel
                            label="Fallback depth"
                            tip={STUDIO_TIP_FALLBACK_DEPTH}
                          />
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
                        </label>
                      </div>
                    </div>
                  </details>

                  <p className="text-sm text-brand-muted">
                    The cycle executes all 3 pipeline steps using your updated
                    parameters. Switch to Compare when done.
                  </p>

                  <div className="flex flex-wrap gap-3">
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
                      {polling ? "Running cycle…" : "Run training cycle"}
                    </button>
                  </div>

                  {actionMsg && (
                    <p className="text-sm text-brand-muted">{actionMsg}</p>
                  )}

                  {polling && (
                    <p className="text-sm text-brand-muted animate-pulse">
                      Pipeline running — polling status…
                    </p>
                  )}

                  {pollStatus && pollStatus.status !== "pending" && (
                    <div className="fb-panel p-4 text-sm">
                      <p className="font-medium">Cycle complete</p>
                      <ul className="mt-2 space-y-1">
                        {pollStatus.steps.map((s, i) => (
                          <li key={i}>
                            {s.result === "success" ? "✅" : "🔴"} Step {s.step} —{" "}
                            {s.step_name} → {s.result}
                          </li>
                        ))}
                      </ul>
                      {pollStatus.escalated && (
                        <p className="mt-2 text-red-700">
                          Escalated: {pollStatus.escalation_reason}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                </StudioTabPanel>
              )}

              {tab === "compare" && (
                <StudioTabPanel id="panel-compare" labelledBy="tab-compare">
                <div className="space-y-6">
                  {!compareData ? (
                    <p className="text-sm text-brand-muted">
                      No training cycle yet. Go to Tune & Train and run a cycle.
                    </p>
                  ) : (
                    <>
                      {compareData.ran_at && (
                        <p className="text-sm text-brand-muted">
                          Last cycle: {compareData.ran_at}
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
                        return (
                          <>
                            <ChartPanel
                              title="Delta summary"
                              subtitle="The three signals that matter most."
                            >
                            <KpiGrid className="fb-kpi-grid-dense sm:grid-cols-3">
                              <KpiCard
                                compact
                                label={
                                  <StudioFieldLabel
                                    label="Δ Cost"
                                    tip={STUDIO_TIP_DELTA_COST}
                                  />
                                }
                                value={`${v2Cost - v1Cost >= 0 ? "+" : ""}${(v2Cost - v1Cost).toFixed(5)}`}
                              />
                              <KpiCard
                                compact
                                label={
                                  <StudioFieldLabel
                                    label="Δ Latency"
                                    tip={STUDIO_TIP_DELTA_LATENCY}
                                  />
                                }
                                value={`${v2Lat - v1Lat >= 0 ? "+" : ""}${(v2Lat - v1Lat).toFixed(0)} ms`}
                              />
                              <KpiCard
                                compact
                                label="V2 outcome"
                                value={v2Esc ? "ESCALATED" : "AGENT HANDLED"}
                              />
                            </KpiGrid>
                            </ChartPanel>

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
                              <p className="text-sm text-brand-muted">
                                No ratio change — agent handled in both V1 and V2.
                              </p>
                            )}
                            {v1Esc && v2Esc && (
                              <p className="text-sm text-amber-700">
                                Still escalated in V2. Try lowering the Confidence
                                Threshold.
                              </p>
                            )}

                            <ChartPanel
                              title="AI-ROI (Return on Pipeline)"
                              subtitle="Impact vs $75 manual baseline per task."
                            >
                            <div className="grid gap-3 sm:grid-cols-4">
                              <div>
                                <div className="flex items-center gap-1 text-xs text-brand-muted">
                                  <StudioFieldLabel
                                    label="V1 TUoP"
                                    tip={STUDIO_TIP_TUOP}
                                  />
                                </div>
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
                                <div className="flex items-center gap-1 text-xs text-brand-muted">
                                  <StudioFieldLabel
                                    label="V1 RoP"
                                    tip={STUDIO_TIP_ROP}
                                  />
                                </div>
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
                            </ChartPanel>
                          </>
                        );
                      })()}
                    </>
                  )}
                </div>
                </StudioTabPanel>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
