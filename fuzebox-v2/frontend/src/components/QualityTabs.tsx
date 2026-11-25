"use client";

import { useState } from "react";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import { QualityAgentRegistry } from "./QualityAgentRegistry";
import { QualityAuditHistory } from "./QualityAuditHistory";
import { QualityOutreachQa } from "./QualityOutreachQa";
import { QualityAiScreening } from "./QualityAiScreening";
import { QualityTeamReviews } from "./QualityTeamReviews";
import { QualityTaskLog } from "./QualityTaskLog";
import type { QualityTabId } from "@/lib/tasks-reviews";
import type { QualityTaskRow } from "@/lib/types";

const TABS = [
  { id: "task", label: "Task Log" },
  { id: "ai", label: "AI Screening" },
  { id: "team", label: "Team Reviews" },
  { id: "history", label: "Audit History" },
  { id: "agents", label: "Agent Registry" },
  { id: "outreach", label: "Outreach QA" },
] as const;

export function QualityTabs({
  tasks,
  total,
  days,
  initialTab = "task",
  highlightEventId = "",
  filterAgentId = "",
  canWrite = true,
  onPipelineStarted,
  onTaskQueued,
}: {
  tasks: QualityTaskRow[];
  total: number;
  days: number;
  initialTab?: QualityTabId;
  highlightEventId?: string;
  filterAgentId?: string;
  canWrite?: boolean;
  onPipelineStarted?: (requestId: string) => void;
  onTaskQueued?: () => void;
}) {
  const [active, setActive] = useState<QualityTabId>(initialTab);

  return (
    <div className="fb-card-accent-top min-w-0">
      <div className="border-b border-brand-border px-4 py-3 sm:px-6">
        <PageTabs
          tabs={TABS}
          active={active}
          onChange={setActive}
        />
      </div>
      <div className="p-4 sm:p-6 min-w-0">
        {active === "task" && (
          <PageTabPanel id="panel-task" labelledBy="tab-task">
            <QualityTaskLog
              tasks={tasks}
              total={total}
              canWrite={canWrite}
              onPipelineStarted={onPipelineStarted}
              onTaskQueued={onTaskQueued}
            />
          </PageTabPanel>
        )}
        {active === "ai" && (
          <PageTabPanel id="panel-ai" labelledBy="tab-ai">
            <QualityAiScreening
              days={days}
              tasks={tasks}
              onOpenReviewQueue={() => setActive("team")}
            />
          </PageTabPanel>
        )}
        {active === "team" && (
          <PageTabPanel id="panel-team" labelledBy="tab-team">
            <QualityTeamReviews
              days={days}
              highlightEventId={highlightEventId}
              filterAgentId={filterAgentId}
            />
          </PageTabPanel>
        )}
        {active === "history" && (
          <PageTabPanel id="panel-history" labelledBy="tab-history">
            <QualityAuditHistory days={days} />
          </PageTabPanel>
        )}
        {active === "agents" && (
          <PageTabPanel id="panel-agents" labelledBy="tab-agents">
            <QualityAgentRegistry days={days} />
          </PageTabPanel>
        )}
        {active === "outreach" && (
          <PageTabPanel id="panel-outreach" labelledBy="tab-outreach">
            <QualityOutreachQa days={days} />
          </PageTabPanel>
        )}
      </div>
    </div>
  );
}
