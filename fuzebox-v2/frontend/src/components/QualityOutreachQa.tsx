"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { ApiError, fetchOutreachSummary } from "@/lib/api";
import type { OutreachDraft, OutreachSummary } from "@/lib/types";

function formatDraftDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
}

function personalizationLabel(score: number): string {
  const n = score <= 1 ? score * 100 : score;
  return `${Math.round(n)}% personalized`;
}

function pctDisplay(rate: number): string {
  const n = rate <= 1 ? rate * 100 : rate;
  return `${n.toFixed(1)}%`;
}

function statusClass(status: string): string {
  return status.toLowerCase() === "sent"
    ? "fb-qo-draft-status--sent"
    : "fb-qo-draft-status--default";
}

export function QualityOutreachQa({ days }: { days: number }) {
  const [data, setData] = useState<OutreachSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchOutreachSummary(days));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load outreach QA",
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <PageLoading message="Loading outreach QA…" />;
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

  const { kpis, drafts } = data;
  const avgPct = pctDisplay(kpis.avgPersonalization);
  const replyPct = pctDisplay(kpis.replyRate);
  const sentWithoutPct =
    kpis.sentWithoutEdit <= 1
      ? pctDisplay(kpis.sentWithoutEdit)
      : `${kpis.sentWithoutEdit.toFixed(0)}%`;

  const summaryRows = [
    {
      label: "Drafts this week",
      sub: "last 7 days",
      value: String(kpis.draftsThisWeek),
    },
    {
      label: "Avg personalization",
      sub: "threshold: 75%",
      value: avgPct,
    },
    {
      label: "Reply rate",
      sub: "industry: 8–12%",
      value: replyPct,
    },
    {
      label: "Flagged for review",
      sub: "low personalization",
      value: String(kpis.flaggedForReview),
    },
    {
      label: "Sent without edit",
      sub: "human-approved drafts",
      value: sentWithoutPct,
    },
  ];

  return (
    <div className="fb-qo-layout">
      <section className="fb-qo-drafts">
        <header className="fb-qo-section-head">
          <span className="fb-qo-eyebrow">Drafts</span>
          <h3 className="fb-qo-title">AI-drafted outreach pending or sent</h3>
        </header>

        {drafts.length === 0 ? (
          <p className="fb-qo-empty text-sm text-brand-muted">
            No outreach drafts in this window. Set{" "}
            <code className="text-xs">ECL_API_URL</code> or run{" "}
            <code className="text-xs">response_draft</code> tasks to populate.
          </p>
        ) : (
          <ul className="fb-qo-draft-list">
            {drafts.map((draft: OutreachDraft) => (
              <li key={draft.id} className="fb-qo-draft-card">
                <div className="fb-qo-draft-top">
                  <div>
                    <p className="fb-qo-draft-name">{draft.candidateName}</p>
                    <p className="fb-qo-draft-channel">{draft.channel}</p>
                  </div>
                  <span className="fb-qo-draft-score">
                    {personalizationLabel(draft.personalizationScore)}
                  </span>
                </div>
                <p className="fb-qo-draft-message">
                  &ldquo;{draft.messageText}&rdquo;
                </p>
                <div className="fb-qo-draft-footer">
                  <span className="fb-qo-draft-date">
                    {formatDraftDate(draft.capturedAt)}
                  </span>
                  <span
                    className={`fb-qo-draft-status ${statusClass(draft.status)}`}
                  >
                    {draft.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="fb-qo-summary fb-surface-panel">
        <header className="fb-qo-section-head">
          <span className="fb-qo-eyebrow">Outreach summary</span>
          <h3 className="fb-qo-title">Quality at a glance</h3>
        </header>

        <ul className="fb-qo-summary-metrics">
          {summaryRows.map((row) => (
            <li key={row.label} className="fb-qo-summary-row">
              <div>
                <span className="fb-qo-summary-label">{row.label}</span>
                <span className="fb-qo-summary-sub">{row.sub}</span>
              </div>
              <strong className="fb-qo-summary-value">{row.value}</strong>
            </li>
          ))}
        </ul>

        <div className="fb-qo-channel-section">
          <span className="fb-qo-channel-heading">Channel mix</span>
          <div className="fb-qo-channel-stack">
            <div
              className="fb-qo-channel-stack-fill"
              style={{ width: `${Math.min(100, kpis.channelMix.LinkedIn)}%` }}
            />
          </div>
          <div className="fb-qo-channel-labels">
            <span>LinkedIn {kpis.channelMix.LinkedIn}%</span>
            <span>Email {kpis.channelMix.Email}%</span>
            <span>Slack {kpis.channelMix.Slack}%</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
