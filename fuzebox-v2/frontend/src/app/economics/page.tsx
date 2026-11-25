"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  CostByAgentChart,
  CostByTaskTypePie,
  CumulativeCostChart,
  DataTable,
  TokenDistributionPie,
  TokensByOutcomeChart,
} from "@/components/EconomicsCharts";
import { TalkingPoints } from "@/components/TalkingPoints";
import { Alert } from "@/components/ui/Alert";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { DownloadCsvButton } from "@/components/ui/DownloadCsvButton";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import { PageChip } from "@/components/ui/PageChip";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { Select } from "@/components/ui/Select";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError, fetchEconomicsSummary } from "@/lib/api";
import { daysToTimeRangeLabel } from "@/lib/format";
import { TIME_RANGE_OPTIONS } from "@/lib/constants";
import { downloadCsv } from "@/lib/csv";
import type { EconomicsSummary } from "@/lib/types";

const TABS = [
  { id: "roi", label: "ROI" },
  { id: "costs", label: "Costs" },
  { id: "tokens", label: "Tokens" },
  { id: "workflows", label: "Workflows" },
] as const;

export default function EconomicsPage() {
  const [days, setDays] = useState(7);
  const [manualCost, setManualCost] = useState(50);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("roi");
  const [data, setData] = useState<EconomicsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchEconomicsSummary(days, manualCost));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load economics data",
      );
    } finally {
      setLoading(false);
    }
  }, [days, manualCost]);

  useAppRefresh(load);

  const hasTokens = (data?.token_usage.total_tokens ?? 0) > 0;

  return (
    <AppShell
      title="Economics"
      subtitle="Cost, ROI, and token efficiency. Designed for 5-second comprehension."
    >
      <TalkingPoints
        title="How to frame the ROI"
        bullets={[
          "We compare agent run cost against the manual equivalent cost.",
          "Savings is the difference; ROI shows the multiple on spend.",
          "Exports support POV reporting and finance review.",
        ]}
      />

      <PageToolbar>
        <Select
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={[...TIME_RANGE_OPTIONS]}
          aria-label="Time range"
        />
        <button
          type="button"
          onClick={() => {
            setDays(7);
            setManualCost(50);
          }}
          className="fb-btn"
        >
          Reset
        </button>
        {data && (
          <>
            <PageChip variant="muted">
              {daysToTimeRangeLabel(data.days)}
            </PageChip>
            <PageChip>
              ROI {data.roi.roi_pct.toFixed(0)}% · manual ${manualCost.toFixed(0)}
            </PageChip>
          </>
        )}
      </PageToolbar>

      {loading && <PageLoading message="Loading economics…" />}
      {error && (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      )}

      {!loading && !error && data && (
        <div className="fb-card-accent-top">
          <div className="border-b border-brand-border px-4 py-3 sm:px-6">
            <PageTabs tabs={TABS} active={tab} onChange={setTab} />
          </div>
          <div className="p-4 sm:p-6">
          {tab === "roi" && (
            <PageTabPanel id="panel-roi" labelledBy="tab-roi">
            <div className="grid gap-8 xl:grid-cols-[1fr_220px]">
              <div>
                <h2 className="fb-section-title text-base">ROI calculator</h2>
                <p className="mb-4 text-sm text-brand-muted">
                  Compare agent cost vs. manual cost assumptions.
                </p>
                <label className="block text-sm font-medium">
                  Manual cost per task ($)
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={5}
                    value={manualCost}
                    onChange={(e) => setManualCost(Number(e.target.value))}
                    className="mt-2 w-full max-w-md"
                  />
                  <span className="ml-2 text-brand-primary">${manualCost}</span>
                </label>
                {data.roi.total_tasks > 0 ? (
                  <KpiGrid className="mt-6 sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard label="Agent total cost" value={`$${data.roi.agent_total_cost.toFixed(2)}`} />
                    <KpiCard label="Manual equivalent" value={`$${data.roi.manual_equivalent_cost.toFixed(2)}`} />
                    <KpiCard label="Savings" value={`$${data.roi.savings.toFixed(2)}`} />
                    <KpiCard label="ROI" value={`${data.roi.roi_pct.toFixed(0)}%`} />
                  </KpiGrid>
                ) : (
                  <p className="mt-6 text-sm text-brand-muted">
                    No economics data in range. Adjust the time range to include task activity.
                  </p>
                )}
              </div>
              <aside className="fb-exports-rail space-y-2">
                <h3 className="fb-section-title">Exports</h3>
                {data.cost_by_agent.length > 0 && (
                  <DownloadCsvButton
                    label="Cost by agent (CSV)"
                    className="w-full"
                    onClick={() => downloadCsv("cost_by_agent.csv", data.cost_by_agent)}
                  />
                )}
                {data.cost_by_task_type.length > 0 && (
                  <DownloadCsvButton
                    label="Cost by task type (CSV)"
                    className="w-full"
                    onClick={() =>
                      downloadCsv("cost_by_task_type.csv", data.cost_by_task_type)
                    }
                  />
                )}
                {data.workflow_economics.length > 0 && (
                  <DownloadCsvButton
                    label="Workflow economics (CSV)"
                    className="w-full"
                    onClick={() =>
                      downloadCsv("workflow_economics.csv", data.workflow_economics)
                    }
                  />
                )}
              </aside>
            </div>
            </PageTabPanel>
          )}

          {tab === "costs" && (
            <PageTabPanel id="panel-costs" labelledBy="tab-costs">
            <div className="space-y-8">
              <div className="grid gap-8 xl:grid-cols-2">
                <ChartPanel
                  title="Cost by agent"
                  action={
                    data.cost_by_agent.length > 0 ? (
                      <DownloadCsvButton
                        onClick={() =>
                          downloadCsv("cost_by_agent.csv", data.cost_by_agent)
                        }
                      />
                    ) : undefined
                  }
                >
                  <CostByAgentChart rows={data.cost_by_agent} />
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm text-brand-primary">Details (table)</summary>
                    <div className="mt-2">
                      <DataTable
                        columns={[
                          { key: "agent", label: "Agent" },
                          { key: "tasks", label: "Tasks", align: "right" },
                          { key: "total_cost_usd", label: "Total $", align: "right" },
                        ]}
                        rows={data.cost_by_agent.map((r) => ({
                          agent: r.agent,
                          tasks: r.tasks,
                          total_cost_usd: r.total_cost_usd.toFixed(4),
                        }))}
                      />
                    </div>
                  </details>
                </ChartPanel>
                <ChartPanel
                  title="Cost by task type"
                  action={
                    data.cost_by_task_type.length > 0 ? (
                      <DownloadCsvButton
                        onClick={() =>
                          downloadCsv(
                            "cost_by_task_type.csv",
                            data.cost_by_task_type,
                          )
                        }
                      />
                    ) : undefined
                  }
                >
                  <CostByTaskTypePie rows={data.cost_by_task_type} />
                </ChartPanel>
              </div>
              <ChartPanel title="Cumulative cost trend">
                <CumulativeCostChart points={data.cost_time_series} />
              </ChartPanel>
            </div>
            </PageTabPanel>
          )}

          {tab === "tokens" && (
            <PageTabPanel id="panel-tokens" labelledBy="tab-tokens">
            <div>
              {!hasTokens ? (
                <p className="text-sm text-brand-muted">No token data for this time range.</p>
              ) : (
                <>
                  <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
                    <KpiCard label="Total tokens" value={data.token_usage.total_tokens.toLocaleString()} />
                    <KpiCard label="Avg tokens / task" value={data.token_usage.avg_tokens_per_task.toLocaleString()} />
                    <KpiCard label="Input:output ratio" value={String(data.token_usage.input_output_ratio)} />
                    <KpiCard
                      label="Token efficiency"
                      value={`${(data.token_usage.token_efficiency * 100).toFixed(1)}%`}
                    />
                  </KpiGrid>
                  <div className="mt-8 grid gap-8 xl:grid-cols-2">
                    <ChartPanel title="Token distribution">
                      <TokenDistributionPie tokens={data.token_usage} />
                    </ChartPanel>
                    <ChartPanel title="Tokens by outcome">
                      <TokensByOutcomeChart tokens={data.token_usage} />
                    </ChartPanel>
                  </div>
                </>
              )}
            </div>
            </PageTabPanel>
          )}

          {tab === "workflows" && (
            <PageTabPanel id="panel-workflows" labelledBy="tab-workflows">
            <div>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="fb-section-title text-base">Workflow economics</h2>
                  <p className="text-sm text-brand-muted">
                    Per-workflow costs and metadata.
                  </p>
                </div>
                {data.workflow_economics.length > 0 && (
                  <DownloadCsvButton
                    onClick={() =>
                      downloadCsv(
                        "workflow_economics.csv",
                        data.workflow_economics,
                      )
                    }
                  />
                )}
              </div>
              {data.workflow_economics.length === 0 ? (
                <p className="text-sm text-brand-muted">No workflow economics for this range.</p>
              ) : (
                <DataTable
                  columns={[
                    { key: "workflow", label: "Workflow" },
                    { key: "agents", label: "Agents", align: "right" },
                    { key: "tasks", label: "Tasks", align: "right" },
                    { key: "result", label: "Result" },
                    { key: "cost_usd", label: "Cost $", align: "right" },
                    { key: "duration_s", label: "Duration (s)", align: "right" },
                    { key: "date", label: "Date" },
                  ]}
                  rows={data.workflow_economics.map((r) => ({
                    workflow: r.workflow,
                    agents: r.agents,
                    tasks: r.tasks,
                    result: r.result,
                    cost_usd: r.cost_usd.toFixed(4),
                    duration_s: r.duration_s,
                    date: r.date,
                  }))}
                />
              )}
            </div>
            </PageTabPanel>
          )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

