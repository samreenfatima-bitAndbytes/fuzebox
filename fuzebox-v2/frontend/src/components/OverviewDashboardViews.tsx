"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CostTrendChart,
  OverviewKpiGrid,
  OverviewThroughputChart,
  LeaderboardHowToRead,
  TopAgentsChart,
} from "@/components/OverviewCharts";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { DownloadCsvButton } from "@/components/ui/DownloadCsvButton";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import { downloadCsv } from "@/lib/csv";
import { filterLeaderboard } from "@/lib/overview-dashboard";
import type { OverviewSummary } from "@/lib/types";

const TABS = [
  { id: "trends" as const, label: "Trends" },
  { id: "leaderboard" as const, label: "Leaderboard" },
];

type OverviewDashboardProps = {
  data: OverviewSummary;
};

function OverviewKpiStrip({ kpis }: { kpis: OverviewSummary["kpis"] }) {
  return (
    <div className="fb-card-accent-top px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
      <OverviewKpiGrid kpis={kpis} />
    </div>
  );
}

export function OverviewDashboard({ data }: OverviewDashboardProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("trends");
  const [leaderboardSearch, setLeaderboardSearch] = useState("");
  const kpis = data.kpis;

  const filteredLeaderboard = useMemo(
    () => filterLeaderboard(data.leaderboard, leaderboardSearch),
    [data.leaderboard, leaderboardSearch],
  );

  return (
    <div className="space-y-6">
      <OverviewKpiStrip kpis={kpis} />

      <PageTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "trends" && (
        <PageTabPanel id="panel-ov-trends" labelledBy="tab-trends">
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
            <ChartPanel
              title="Cost trend"
              subtitle="Daily spend and cumulative total."
            >
              <CostTrendChart points={data.cost_time_series} />
            </ChartPanel>
            <ChartPanel
              title="Throughput & success"
              subtitle="Volume and success rate over time."
            >
              <OverviewThroughputChart points={data.throughput} />
            </ChartPanel>
          </div>
        </PageTabPanel>
      )}

      {tab === "leaderboard" && (
        <PageTabPanel id="panel-ov-leaderboard" labelledBy="tab-leaderboard">
          <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-brand-ink">Top agents</h3>
              <p className="mt-1 text-sm text-brand-muted">
                Composite score blends success, quality, latency, and cost.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <label className="sr-only" htmlFor="ov-leaderboard-search">
                Search leaderboard
              </label>
              <input
                id="ov-leaderboard-search"
                type="search"
                value={leaderboardSearch}
                onChange={(e) => setLeaderboardSearch(e.target.value)}
                placeholder="Search agents…"
                className="fb-input w-full text-sm sm:w-56"
              />
              {filteredLeaderboard.length > 0 ? (
                <DownloadCsvButton
                  onClick={() =>
                    downloadCsv("agent_leaderboard.csv", filteredLeaderboard)
                  }
                />
              ) : null}
            </div>
          </header>

          <div className="grid min-w-0 gap-6 xl:grid-cols-[2.65fr_1fr]">
            <ChartPanel
              title="Leaderboard"
              subtitle="Top 10 by overall score."
              action={
                <Link href="/performance?tab=leaderboard" className="fb-btn text-xs">
                  Full leaderboard →
                </Link>
              }
            >
              <TopAgentsChart rows={filteredLeaderboard.slice(0, 10)} />
            </ChartPanel>
            <LeaderboardHowToRead />
          </div>
        </PageTabPanel>
      )}
    </div>
  );
}
