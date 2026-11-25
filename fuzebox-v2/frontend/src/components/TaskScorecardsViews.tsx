"use client";

import { ScorecardTable } from "@/components/ScorecardTable";
import { TaskAccuracyByTypeChart } from "@/components/TaskScorecardsCharts";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { DownloadCsvButton } from "@/components/ui/DownloadCsvButton";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { daysToTimeRangeLabel } from "@/lib/format";
import { scorecardOverviewStats } from "@/lib/task-scorecards";
import { downloadCsv, scorecardRowsToCsv } from "@/lib/csv";
import type { TaskScorecardsSummary } from "@/lib/types";

type TaskScorecardsDashboardProps = {
  data: TaskScorecardsSummary;
};

export function TaskScorecardsDashboard({ data }: TaskScorecardsDashboardProps) {
  const stats = scorecardOverviewStats(data);

  return (
    <div className="space-y-6">
      <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Agents" value={String(stats.totalAgents)} />
        <KpiCard
          label="PASS"
          value={String(stats.pass)}
          sub={`${stats.fail} FAIL`}
          tone="positive"
        />
        <KpiCard
          label="Avg success rate"
          value={`${stats.avgSuccessPct.toFixed(1)}%`}
          sub={daysToTimeRangeLabel(data.days)}
        />
        <KpiCard
          label="Task types"
          value={String(stats.typeCount)}
          sub={data.selected_group !== "All" ? data.selected_group : "all groups"}
          tone="neutral"
        />
      </KpiGrid>

      {data.group_eval ? (
        <ChartPanel
          title={`Group evaluation: ${data.group_eval.group}`}
          subtitle="Fleet pass/fail against group threshold."
        >
          <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Agents" value={String(data.group_eval.agents)} />
            <KpiCard
              label="Group success"
              value={`${(data.group_eval.group_success_rate * 100).toFixed(1)}%`}
            />
            <KpiCard
              label="Passing agents"
              value={String(data.group_eval.agents_passing)}
            />
            <KpiCard
              label="Status"
              value={data.group_eval.passed ? "PASS" : "FAIL"}
              tone={data.group_eval.passed ? "positive" : "caution"}
            />
          </KpiGrid>
        </ChartPanel>
      ) : null}

      <ChartPanel
        title="Agent scorecards"
        subtitle={`PASS/FAIL and rate outliers (${daysToTimeRangeLabel(data.days)}).`}
        action={
          data.rows.length > 0 ? (
            <DownloadCsvButton
              onClick={() =>
                downloadCsv(
                  "task_scorecards.csv",
                  scorecardRowsToCsv(data.rows),
                )
              }
            />
          ) : undefined
        }
      >
        <ScorecardTable rows={data.rows} />
      </ChartPanel>

      <ChartPanel title="Success rate by task type" subtitle="Accuracy breakdown.">
        <div className="min-w-0">
          <TaskAccuracyByTypeChart rows={data.accuracy_by_type} />
        </div>
      </ChartPanel>
    </div>
  );
}
