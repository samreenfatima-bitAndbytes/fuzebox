"use client";

import { useState } from "react";
import {
  RUN_REVIEW_OUTCOME_FILTER_TIP,
  RUN_REVIEW_RUNS_INFO,
  RUN_REVIEW_SEARCH_TIP,
  RUN_REVIEW_TELEMETRY_INFO,
  RunReviewInfoTip,
  RunReviewSectionTitle,
  StudioFieldLabel,
} from "@/components/RunReviewChrome";
import {
  RunReviewRunsList,
  RunReviewTelemetryGrid,
} from "@/components/RunReviewViews";
import { PageEmpty } from "@/components/ui/PageEmpty";
import { PageInnerToolbar } from "@/components/ui/PageInnerToolbar";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import { SelectField } from "@/components/ui/Select";
import { OUTCOME_FILTER_OPTIONS } from "@/lib/constants";
import type { RunReviewSummary } from "@/lib/types";

const TABS = [
  { id: "runs" as const, label: "Pipeline runs" },
  { id: "telemetry" as const, label: "Agent live telemetry" },
];

type RunReviewDashboardProps = {
  data: RunReviewSummary;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  selectedId: string | null;
  onSelectRun: (workflowId: string) => void;
};

export function RunReviewDashboard({
  data,
  statusFilter,
  onStatusFilterChange,
  searchQuery,
  onSearchQueryChange,
  selectedId,
  onSelectRun,
}: RunReviewDashboardProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("runs");

  return (
    <div className="space-y-6">
      <PageTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "runs" && (
        <PageTabPanel id="panel-rr-runs" labelledBy="tab-runs">
          {data.runs.length === 0 ? (
            <PageEmpty
              title="No runs yet"
              message="Send a generate request to populate pipeline runs."
            />
          ) : (
            <div className="space-y-4">
              <div className="fb-rr-runs-heading-wrap">
                <RunReviewSectionTitle
                  id="fb-rr-runs-heading"
                  title="Pipeline runs"
                  tip={RUN_REVIEW_RUNS_INFO}
                />
              </div>
              <PageInnerToolbar>
                <div className="min-w-[10rem]">
                  <span className="fb-field-label mb-1.5 flex items-center gap-1 text-xs uppercase tracking-wide text-brand-muted">
                    <StudioFieldLabel
                      label="Outcome"
                      tip={RUN_REVIEW_OUTCOME_FILTER_TIP}
                    />
                  </span>
                  <SelectField
                    value={statusFilter}
                    onChange={onStatusFilterChange}
                    options={[...OUTCOME_FILTER_OPTIONS]}
                    className="w-full"
                    aria-label="Outcome filter"
                  />
                </div>
                <label className="block min-w-[240px] flex-1 text-sm">
                  <span className="fb-field-label flex items-center gap-1 text-xs uppercase tracking-wide text-brand-muted">
                    Search request text
                    <RunReviewInfoTip
                      text={RUN_REVIEW_SEARCH_TIP}
                      label="Search request text"
                    />
                  </span>
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => onSearchQueryChange(e.target.value)}
                    placeholder="Customer request…"
                    className="fb-input mt-1 block w-full"
                  />
                </label>
              </PageInnerToolbar>
              <RunReviewRunsList
                runs={data.runs}
                selectedId={selectedId}
                statusFilter={statusFilter}
                searchQuery={searchQuery}
                onSelect={onSelectRun}
              />
            </div>
          )}
        </PageTabPanel>
      )}

      {tab === "telemetry" && (
        <PageTabPanel id="panel-rr-telemetry" labelledBy="tab-telemetry">
          <section className="fb-rr-tel-section" aria-labelledby="fb-rr-tel-heading">
            <RunReviewSectionTitle
              id="fb-rr-tel-heading"
              title="Agent live telemetry"
              tip={RUN_REVIEW_TELEMETRY_INFO}
            />
            <RunReviewTelemetryGrid rows={data.telemetry} />
          </section>
        </PageTabPanel>
      )}
    </div>
  );
}
