"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { ApiError, fetchScreeningSummary } from "@/lib/api";
import type { QualityTaskRow, ScreeningSummary } from "@/lib/types";

const ADVANCE_MIN = 70;
const REJECT_MAX = 50;
const HITL_LO = 60;
const HITL_HI = 70;

function slaBreachToday(tasks: QualityTaskRow[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return tasks.filter(
    (t) => t.status === "Failed" && t.timestamp.slice(0, 10) === today,
  ).length;
}

function binStart(bin: string): number {
  const m = /^(\d+)/.exec(bin);
  return m ? parseInt(m[1], 10) : 0;
}

function isHitlBand(bin: string): boolean {
  return binStart(bin) === HITL_LO;
}

function displayBinLabel(bin: string): string {
  return bin.replace(/–/g, "-");
}

export function QualityAiScreening({
  days,
  tasks,
  onOpenReviewQueue,
}: {
  days: number;
  tasks: QualityTaskRow[];
  /** Jump to Team Reviews — HITL advance/reject queue for the 60–70 score band. */
  onOpenReviewQueue?: () => void;
}) {
  const [data, setData] = useState<ScreeningSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchScreeningSummary(days));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load AI screening",
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxBin = useMemo(
    () => Math.max(1, ...(data?.histogram.map((b) => b.count) ?? [1])),
    [data],
  );

  const maxSkill = useMemo(
    () => Math.max(1, ...(data?.skills.map((s) => s.count) ?? [1])),
    [data],
  );

  if (loading) {
    return <PageLoading message="Loading AI screening…" />;
  }

  if (error) {
    return (
      <Alert variant="error" role="alert">
        {error}
      </Alert>
    );
  }

  if (!data) {
    return null;
  }

  const alignmentPct = (data.reviewerAlignment * 100).toFixed(1);
  const slaToday = slaBreachToday(tasks);

  return (
    <div className="fb-qs-layout">
      <div className="fb-qs-top">
        <section className="fb-qs-card fb-surface-panel">
          <header className="fb-qs-card-head">
            <div>
              <span className="fb-qs-eyebrow">Distribution</span>
              <h3 className="fb-qs-title">AI screening score histogram</h3>
            </div>
            <span className="fb-qs-candidate-badge">
              {data.totalCandidates} candidate
              {data.totalCandidates === 1 ? "" : "s"}
            </span>
          </header>

          <div
            className="fb-qs-vchart"
            role="img"
            aria-label="AI screening score histogram"
          >
            <ul className="fb-qs-vchart-cols">
              {data.histogram.map((bin) => {
                const hitl = isHitlBand(bin.bin);
                const heightPct = (bin.count / maxBin) * 100;
                return (
                  <li
                    key={bin.bin}
                    className={`fb-qs-vcol${hitl ? " fb-qs-vcol--hitl" : ""}`}
                  >
                    <span className="fb-qs-vcol-value">{bin.count}</span>
                    <div className="fb-qs-vcol-track">
                      {bin.count > 0 && (
                        <div
                          className={
                            hitl
                              ? "fb-qs-vcol-bar fb-qs-vcol-bar--hitl"
                              : "fb-qs-vcol-bar"
                          }
                          style={{ height: `${heightPct}%` }}
                        />
                      )}
                      {hitl && <span className="fb-qs-vcol-hitl-mark" />}
                    </div>
                    <span className="fb-qs-vcol-label">
                      {displayBinLabel(bin.bin)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <footer className="fb-qs-dist-footer">
            <div className="fb-qs-legend">
              <span className="fb-qs-legend-item">
                <span className="fb-qs-swatch fb-qs-swatch--auto" aria-hidden />
                Auto-classified
              </span>
              <span className="fb-qs-legend-item">
                <span className="fb-qs-swatch fb-qs-swatch--hitl" aria-hidden />
                HITL gate ({HITL_LO}–{HITL_HI})
              </span>
            </div>
            <p className="fb-qs-threshold">
              Threshold: advance ≥ {ADVANCE_MIN} · reject &lt; {REJECT_MAX} ·
              review {REJECT_MAX}–{ADVANCE_MIN - 1}
            </p>
          </footer>
        </section>

        <section className="fb-qs-card fb-surface-panel fb-qs-hitl-card">
          <header className="fb-qs-card-head fb-qs-card-head--stack">
            <span className="fb-qs-eyebrow">HITL gate</span>
            <h3 className="fb-qs-title">Awaiting human review</h3>
          </header>

          <div className="fb-qs-hitl-hero">
            <span className="fb-qs-hitl-value">{data.hitlAwaiting}</span>
            <span className="fb-qs-hitl-sub">
              candidates in {HITL_LO}–{HITL_HI} score band
            </span>
          </div>

          <ul className="fb-qs-hitl-metrics">
            <li>
              <span>Reviewer alignment</span>
              <strong>{alignmentPct}%</strong>
            </li>
            <li>
              <span>SLA breach risk</span>
              <span className="fb-qs-sla-badge">
                {slaToday} today
              </span>
            </li>
            <li>
              <span>Auto-routed channel</span>
              <span className="fb-qs-channel-tag">
                <SlackHashIcon />
                #hitl-recruiting
              </span>
            </li>
          </ul>

          <button
            type="button"
            className="fb-qs-queue-btn"
            onClick={onOpenReviewQueue}
            disabled={!onOpenReviewQueue}
          >
            Open review queue
            <span className="fb-qs-queue-chevron" aria-hidden>
              ›
            </span>
          </button>
        </section>
      </div>

      <section className="fb-qs-card fb-surface-panel">
        <header className="fb-qs-card-head fb-qs-card-head--stack">
          <span className="fb-qs-eyebrow">Skill coverage</span>
          <h3 className="fb-qs-title">
            Top skills detected across qualified pool
          </h3>
        </header>

        {data.skills.length === 0 ? (
          <p className="fb-qs-empty text-sm text-brand-muted">
            No qualified candidates (score ≥ {ADVANCE_MIN}) in this window.
          </p>
        ) : (
          <ul className="fb-qs-hbars">
            {data.skills.map((row) => (
              <li key={row.skill} className="fb-qs-hbar-row">
                <span className="fb-qs-hbar-label">{row.skill}</span>
                <div className="fb-qs-hbar-track">
                  <div
                    className="fb-qs-hbar-fill"
                    style={{ width: `${(row.count / maxSkill) * 100}%` }}
                  />
                </div>
                <span className="fb-qs-hbar-count">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SlackHashIcon() {
  return (
    <svg
      className="fb-qs-channel-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 14a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM10 6a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM10 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8-12a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
        fill="currentColor"
      />
    </svg>
  );
}
