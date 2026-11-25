"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CompletionRatesChart,
  ReliabilityHowToUse,
  LatencyByAgentChart,
  LatencyHistogramChart,
  ThroughputChart,
} from "@/components/PerformanceCharts";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { DownloadCsvButton } from "@/components/ui/DownloadCsvButton";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import { Select } from "@/components/ui/Select";
import { THROUGHPUT_GRANULARITY_OPTIONS } from "@/lib/constants";
import { downloadCsv } from "@/lib/csv";
import { filterLeaderboard } from "@/lib/performance-dashboard";
import type { PerformanceSummary } from "@/lib/types";

const TABS = [
  { id: "reliability" as const, label: "Reliability" },
  { id: "latency" as const, label: "Latency" },
  { id: "throughput" as const, label: "Throughput" },
  { id: "leaderboard" as const, label: "Leaderboard" },
] as const;

export type PerformanceTab = (typeof TABS)[number]["id"];

type PerformanceDashboardProps = {
  data: PerformanceSummary;
  granularity: string;
  onGranularityChange: (value: string) => void;
  loadingThroughput?: boolean;
  initialTab?: PerformanceTab;
};

export function PerformanceDashboard({
  data,
  granularity,
  onGranularityChange,
  loadingThroughput = false,
  initialTab = "reliability",
}: PerformanceDashboardProps) {
  const [tab, setTab] = useState<PerformanceTab>(initialTab);
  const [leaderboardSearch, setLeaderboardSearch] = useState("");

  const filteredLeaderboard = useMemo(
    () => filterLeaderboard(data.leaderboard, leaderboardSearch),
    [data.leaderboard, leaderboardSearch],
  );

  return (
    <div className="space-y-6">
      <PageTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "reliability" && (
        <PageTabPanel id="panel-perf-reliability" labelledBy="tab-reliability">
          <div className="grid min-w-0 gap-6 xl:grid-cols-[2.2fr_1fr]">
            <ChartPanel
              title="Completion rates"
              subtitle="Success rate per agent (threshold at 80%)."
            >
              <CompletionRatesChart rows={data.completion_rates} />
            </ChartPanel>
            <ReliabilityHowToUse />
          </div>
        </PageTabPanel>
      )}

      {tab === "latency" && (
        <PageTabPanel id="panel-perf-latency" labelledBy="tab-latency">
          <div className="grid gap-8 xl:grid-cols-2">
            <ChartPanel
              title="Latency by agent"
              subtitle="Median (P50) and tail (P90) latency."
            >
              <LatencyByAgentChart rows={data.latency_by_agent} />
            </ChartPanel>
            <ChartPanel
              title="Latency distribution"
              subtitle="Overall histogram with key percentiles."
            >
              <LatencyHistogramChart histogram={data.latency_histogram} />
            </ChartPanel>
          </div>
        </PageTabPanel>
      )}

      {tab === "throughput" && (
        <PageTabPanel id="panel-perf-throughput" labelledBy="tab-throughput">
          <ChartPanel
            title="Throughput trend"
            subtitle="Volume and success rate over time."
            action={
              <div className="w-full sm:w-40">
                <label className="sr-only" htmlFor="perf-throughput-granularity">
                  Throughput granularity
                </label>
                <Select
                  id="perf-throughput-granularity"
                  value={granularity}
                  onChange={onGranularityChange}
                  options={[...THROUGHPUT_GRANULARITY_OPTIONS]}
                  aria-label="Throughput granularity"
                  disabled={loadingThroughput}
                />
              </div>
            }
          >
            <ThroughputChart points={data.throughput} />
          </ChartPanel>
        </PageTabPanel>
      )}

      {tab === "leaderboard" && (
        <PageTabPanel id="panel-perf-leaderboard" labelledBy="tab-leaderboard">
          <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-brand-ink">
                Agent leaderboard
              </h3>
              <p className="mt-1 text-sm text-brand-muted">
                Full ranked table for the selected window.{" "}
                <Link href="/overview" className="text-brand-primary hover:underline">
                  Overview
                </Link>{" "}
                has the top-10 chart.
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <label className="sr-only" htmlFor="perf-leaderboard-search">
                Search leaderboard
              </label>
              <input
                id="perf-leaderboard-search"
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
          <ChartPanel
            title="Leaderboard table"
            subtitle="Overall score blends success, quality, latency, and cost."
          >
            <LeaderboardTable
              rows={filteredLeaderboard}
              rankLabel="Rank"
              scoreStyle="bands"
              scrollClassName="fb-table-scroll min-w-0 max-w-full"
            />
          </ChartPanel>
        </PageTabPanel>
      )}
    </div>
  );
}
