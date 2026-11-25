"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { PageLoading } from "@/components/ui/PageLoading";
import { ApiError, fetchObservationRegistry } from "@/lib/api";
import type { ObservationRegistryRow } from "@/lib/types";

function formatSuccessRate(rate: number): string {
  const pct = rate <= 1 ? rate * 100 : rate;
  return `${pct.toFixed(1)}%`;
}

function trustTierLabel(tier: string): string {
  if (tier.includes("T4") || tier.toLowerCase().includes("autonomous")) {
    return "Autonomous";
  }
  if (tier.includes("T3") || tier.toLowerCase().includes("trusted")) {
    return "Trusted";
  }
  if (tier.includes("T2") || tier.toLowerCase().includes("supervised")) {
    return "Supervised";
  }
  if (tier.includes("T1") || tier.toLowerCase().includes("observed")) {
    return "Observed";
  }
  return "Unverified";
}

function trustTierClass(tier: string): string {
  if (tier.includes("T4") || tier.includes("T3")) return "fb-qar-pill--trust-high";
  if (tier.includes("T2") || tier.includes("T1")) return "fb-qar-pill--trust-mid";
  return "fb-qar-pill--trust-low";
}

function modelPillClass(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("claude") || m.includes("anthropic")) return "fb-qar-pill--model-claude";
  if (m.includes("gpt") || m.includes("openai")) return "fb-qar-pill--model-openai";
  if (m.includes("gemini")) return "fb-qar-pill--model-gemini";
  return "fb-qar-pill--model-neutral";
}

function isActiveStatus(status: string): boolean {
  const s = status.toLowerCase();
  return s === "active" || s === "green";
}

function AgentRegistryCard({ row }: { row: ObservationRegistryRow }) {
  const active = isActiveStatus(row.status);
  const model = row.model?.trim() || "Unknown";

  return (
    <article
      className="fb-qar-agent-card"
      data-testid={`agent-${row.agentId}`}
    >
      <div className="fb-qar-agent-card-head">
        <div className="min-w-0">
          <p className="fb-qar-agent-card-eyebrow">Fuzebox agent</p>
          <Link
            href={`/agents/${encodeURIComponent(row.agentId)}/edit`}
            className="fb-qar-agent-card-name"
          >
            {row.name}
          </Link>
          <p className="fb-qar-agent-id mt-1">{row.agentId}</p>
        </div>
        <div
          className={[
            "fb-qar-agent-card-icon",
            active ? "fb-qar-agent-card-icon--active" : "",
          ].join(" ")}
          aria-hidden
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 8V4H8" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="4" y="8" width="16" height="12" rx="2" />
            <path d="M9 13v2M15 13v2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <div className="fb-qar-agent-card-pills">
        <span className={`fb-qar-pill ${modelPillClass(model)}`}>{model}</span>
        <span className={`fb-qar-pill ${trustTierClass(row.trustTier)}`}>
          {trustTierLabel(row.trustTier)}
        </span>
        {!active ? (
          <span className="fb-qar-pill fb-qar-pill--status-inactive">{row.status}</span>
        ) : null}
      </div>

      <dl className="fb-qar-agent-card-stats">
        <div>
          <dt>Success</dt>
          <dd>{formatSuccessRate(row.successRate)}</dd>
        </div>
        <div>
          <dt>Runs</dt>
          <dd>{row.totalRuns.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Saved</dt>
          <dd>
            {row.hoursSaved.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 1,
            })}
            h
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function QualityAgentRegistry({ days }: { days: number }) {
  const [rows, setRows] = useState<ObservationRegistryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchObservationRegistry(days));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Failed to load agent registry",
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        runs: acc.runs + r.totalRuns,
        hours: acc.hours + r.hoursSaved,
      }),
      { runs: 0, hours: 0 },
    );
  }, [rows]);

  if (loading) {
    return <PageLoading message="Loading agent registry…" />;
  }

  if (error) {
    return (
      <Alert variant="error" role="alert">
        {error}
      </Alert>
    );
  }

  return (
    <section className="fb-qar-card fb-surface-panel">
      <header className="fb-qar-head">
        <div>
          <span className="fb-qar-eyebrow">Fleet · {rows.length} agents</span>
          <h3 className="fb-qar-title">Agent registry</h3>
          <p className="fb-qar-sub">
            Trust tier, success rate, and hours saved per agent (last {days} days)
          </p>
        </div>
        {rows.length > 0 && (
          <div className="fb-qar-summary-chips">
            <span className="fb-qar-chip">{rows.length} agents</span>
            <span className="fb-qar-chip">{totals.runs} runs</span>
            <span className="fb-qar-chip">{totals.hours.toFixed(1)}h saved</span>
          </div>
        )}
      </header>

      {rows.length === 0 ? (
        <p className="fb-qar-empty text-sm text-brand-muted">
          No agents in registry. Set <code className="text-xs">ECL_API_URL</code>{" "}
          to sync from observation or register agents under Configure → Agents.
        </p>
      ) : (
        <div className="fb-qar-agent-grid">
          {rows.map((row) => (
            <AgentRegistryCard key={row.agentId} row={row} />
          ))}
        </div>
      )}
    </section>
  );
}
