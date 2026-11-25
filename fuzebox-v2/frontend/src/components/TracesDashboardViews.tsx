"use client";

import { useState } from "react";
import {
  TraceKpiGrid,
  TraceSpansTable,
  TraceTimeline,
} from "@/components/TraceViews";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import type { TraceDetail } from "@/lib/types";

const TABS = [
  { id: "timeline" as const, label: "Timeline" },
  { id: "spans" as const, label: "Spans" },
];

export function TracesDashboard({ detail }: { detail: TraceDetail }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("timeline");

  return (
    <div className="space-y-6">
      <div className="fb-card-accent-top p-4 sm:p-6">
        <TraceKpiGrid detail={detail} />
      </div>

      <PageTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "timeline" && (
        <PageTabPanel id="panel-tr-timeline" labelledBy="tab-timeline">
          <TraceTimeline detail={detail} />
        </PageTabPanel>
      )}

      {tab === "spans" && (
        <PageTabPanel id="panel-tr-spans" labelledBy="tab-spans">
          <TraceSpansTable detail={detail} />
        </PageTabPanel>
      )}
    </div>
  );
}
