"use client";

import { useEffect, useMemo, useState } from "react";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import {
  AuditChainProof,
  LiveEventStreamTable,
  ObservationCoverageTable,
  VendorBreakdownTable,
} from "@/components/ObservationTables";
import { agentFilterDisplayName } from "@/lib/agent-labels";
import {
  filterEventsByAgent,
  filterObservationPlane,
  type ObservationPlaneFiltered,
  type ObservationPlaneSnapshot,
  type ObservationPlaneTab,
} from "@/lib/observation-plane";
import { useShellScrollChain } from "@/lib/scroll-chain";
import type { ObservationKpis } from "@/lib/types";
import type { ObservationPlaneMeta } from "@/lib/observation-plane";

const OP_TABS = [
  { id: "overview" as const, label: "Overview" },
  { id: "events" as const, label: "Events" },
  { id: "coverage-audit" as const, label: "Coverage & audit" },
];

const EVENTS_PAGE_SIZE = 15;

function ObservationPlaneKpis({
  kpis,
  meta,
}: {
  kpis: ObservationKpis;
  meta: ObservationPlaneMeta;
}) {
  const gapLabel =
    meta.captureGaps === 0
      ? "0 gaps"
      : `${meta.captureGaps} gap${meta.captureGaps === 1 ? "" : "s"}`;

  const queuedPct =
    kpis.total_events > 0
      ? Math.round((kpis.human_review_queued / kpis.total_events) * 1000) / 10
      : 0;

  const row1 = [
    {
      label: "Observed events",
      value: meta.eventCount.toLocaleString(),
      sub:
        meta.throughputPerHour > 0
          ? `${meta.throughputPerHour.toLocaleString()} events / hour throughput`
          : "0.0 events / hour throughput",
    },
    {
      label: "Active surfaces",
      value: String(kpis.active_surfaces),
      sub: `${meta.captureRatePct}% capture rate · ${gapLabel}`,
    },
    {
      label: "Threshold pass rate",
      value: `${kpis.pass_rate_pct}%`,
      sub: `${kpis.passed_count.toLocaleString()} / ${kpis.total_events.toLocaleString()} passed · ${kpis.human_review_queued} queued for review`,
    },
    {
      label: "Amortized spend",
      value: `$${kpis.total_spend.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      sub: `${kpis.total_tokens.toLocaleString()} tokens · $${kpis.total_saved.toLocaleString(undefined, { minimumFractionDigits: 2 })} value saved`,
    },
  ];

  const row2 = [
    {
      label: "Avg latency",
      value: `${Math.round(kpis.p50_latency_ms ?? kpis.avg_latency_ms)} ms`,
      sub: "p50 wall-clock per canonical event",
    },
    {
      label: "Avg tokens / event",
      value: kpis.avg_tokens > 0 ? kpis.avg_tokens.toLocaleString() : "0",
      sub: "input + output tokens metered",
    },
    {
      label: "Avg cost / event",
      value: `$${kpis.avg_cost.toFixed(4)}`,
      sub: "amortized vendor + 15% governance",
    },
    {
      label: "Human review queued",
      value: String(kpis.human_review_queued),
      sub: `${queuedPct}% of stream · drives CTR`,
    },
  ];

  return (
    <div className="space-y-3">
      <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
        {row1.map((item) => (
          <KpiCard key={item.label} {...item} size="lg" />
        ))}
      </KpiGrid>
      <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
        {row2.map((item) => (
          <KpiCard key={item.label} {...item} size="lg" />
        ))}
      </KpiGrid>
    </div>
  );
}

function TabSearchInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={id}>
        {placeholder}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="fb-input mb-3 w-full max-w-sm text-sm"
      />
    </>
  );
}

function EventsTabPanel({
  events,
  highlightEventId = "",
  filterKey = "",
  emptySubtitle = "No events match your search in this window.",
}: {
  events: ObservationPlaneFiltered["events"];
  highlightEventId?: string;
  /** Resets pagination when search or agent filter changes. */
  filterKey?: string;
  emptySubtitle?: string;
}) {
  const scrollRef = useShellScrollChain();
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [filterKey]);

  useEffect(() => {
    if (!highlightEventId || events.length === 0) return;
    const idx = events.findIndex((e) => e.eventId === highlightEventId);
    if (idx >= 0) {
      setPage(Math.floor(idx / EVENTS_PAGE_SIZE));
    }
  }, [highlightEventId, events]);

  const totalPages = Math.max(1, Math.ceil(events.length / EVENTS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = events.slice(
    safePage * EVENTS_PAGE_SIZE,
    (safePage + 1) * EVENTS_PAGE_SIZE,
  );

  if (events.length === 0) {
    return (
      <LiveEventStreamTable
        rows={[]}
        subtitle={emptySubtitle}
      />
    );
  }

  return (
    <div ref={scrollRef} className="fb-op-events-scroll space-y-3">
      <LiveEventStreamTable
        rows={pageRows}
        highlightEventId={highlightEventId}
        subtitle={`${events.length} canonical event${events.length === 1 ? "" : "s"} in range`}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-brand-muted">
        <span>
          Showing{" "}
          {`${safePage * EVENTS_PAGE_SIZE + 1}–${Math.min((safePage + 1) * EVENTS_PAGE_SIZE, events.length)}`}{" "}
          of {events.length}
        </span>
        {events.length > EVENTS_PAGE_SIZE ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="fb-btn text-xs"
              disabled={safePage === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span className="tabular-nums">
              Page {safePage + 1} of {totalPages}
            </span>
            <button
              type="button"
              className="fb-btn text-xs"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ObservationPlaneDashboard({
  snapshot,
  initialAgentFilter = "",
  initialEventId = "",
  fromViolationReview = false,
}: {
  snapshot: ObservationPlaneSnapshot;
  initialAgentFilter?: string;
  initialEventId?: string;
  fromViolationReview?: boolean;
}) {
  const [tab, setTab] = useState<ObservationPlaneTab>(
    initialAgentFilter || initialEventId ? "events" : "overview",
  );
  const [overviewSearch, setOverviewSearch] = useState("");
  const [eventsSearch, setEventsSearch] = useState(initialAgentFilter);
  const [coverageSearch, setCoverageSearch] = useState("");

  const overviewFiltered = useMemo(
    () => filterObservationPlane(snapshot, overviewSearch),
    [snapshot, overviewSearch],
  );

  const eventsFiltered = useMemo(() => {
    if (
      initialAgentFilter &&
      eventsSearch.trim().toLowerCase() === initialAgentFilter.trim().toLowerCase()
    ) {
      return {
        ...filterObservationPlane(snapshot, ""),
        events: filterEventsByAgent(snapshot.events, initialAgentFilter),
      };
    }
    return filterObservationPlane(snapshot, eventsSearch);
  }, [snapshot, eventsSearch, initialAgentFilter]);

  const coverageFiltered = useMemo(
    () => filterObservationPlane(snapshot, coverageSearch),
    [snapshot, coverageSearch],
  );

  const agentFilterDisplay = useMemo(() => {
    const id = initialAgentFilter.trim();
    if (!id) return null;
    const name = agentFilterDisplayName(id, snapshot.agentNames);
    return { id, name, hasDisplayName: name !== id };
  }, [initialAgentFilter, snapshot.agentNames]);

  return (
    <div className="space-y-4">
      <PageTabs tabs={OP_TABS} active={tab} onChange={setTab} />

      {tab === "overview" && (
        <PageTabPanel id="panel-op-overview" labelledBy="tab-overview">
          <div className="fb-card-accent-top px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4">
            <ObservationPlaneKpis kpis={snapshot.kpis} meta={snapshot.meta} />
          </div>
          <div className="mt-6">
            <TabSearchInput
              id="op-overview-search"
              value={overviewSearch}
              onChange={setOverviewSearch}
              placeholder="Search vendors…"
            />
            {overviewFiltered.byVendor.length > 0 ? (
              <VendorBreakdownTable rows={overviewFiltered.byVendor} />
            ) : (
              <p className="text-sm text-brand-muted">
                No vendor breakdown for the current filter.
              </p>
            )}
          </div>
        </PageTabPanel>
      )}

      {tab === "events" && (
        <PageTabPanel id="panel-op-events" labelledBy="tab-events">
          {agentFilterDisplay ? (
            <p className="mb-2 text-xs text-brand-muted">
              Filtered to agent{" "}
              {agentFilterDisplay.hasDisplayName ? (
                <>
                  <span className="text-brand-ink">{agentFilterDisplay.name}</span>{" "}
                  <span className="font-mono text-brand-ink">
                    ({agentFilterDisplay.id})
                  </span>
                </>
              ) : (
                <span className="font-mono text-brand-ink">{agentFilterDisplay.id}</span>
              )}
              {eventsSearch !== initialAgentFilter ? (
                <button
                  type="button"
                  className="ml-2 text-brand-primary hover:underline"
                  onClick={() => setEventsSearch(initialAgentFilter)}
                >
                  Reset filter
                </button>
              ) : null}
            </p>
          ) : null}
          <TabSearchInput
            id="op-events-search"
            value={eventsSearch}
            onChange={(value) => {
              setEventsSearch(value);
            }}
            placeholder="Search events, agents, vendors…"
          />
          <EventsTabPanel
            events={eventsFiltered.events}
            filterKey={`${eventsSearch}|${initialAgentFilter}`}
            highlightEventId={initialEventId}
            emptySubtitle={
              fromViolationReview && initialAgentFilter
                ? `No canonical events for ${initialAgentFilter} in ${snapshot.windowLabel}. The violation may predate this window — see the summary above.`
                : "No events match your search in this window."
            }
          />
        </PageTabPanel>
      )}

      {tab === "coverage-audit" && (
        <PageTabPanel
          id="panel-op-coverage-audit"
          labelledBy="tab-coverage-audit"
          className="min-w-0"
        >
          <div className="min-w-0 space-y-4">
            <TabSearchInput
              id="op-coverage-search"
              value={coverageSearch}
              onChange={setCoverageSearch}
              placeholder="Search vendor, surface, status…"
            />
            <ObservationCoverageTable rows={coverageFiltered.coverage} />
            <AuditChainProof
              auditHash={snapshot.audit.auditHash}
              prevEventHash={snapshot.audit.prevEventHash}
              latestEventId={snapshot.audit.latestEventId}
            />
          </div>
        </PageTabPanel>
      )}
    </div>
  );
}
