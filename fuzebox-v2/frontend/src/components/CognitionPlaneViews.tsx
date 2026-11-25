"use client";

import Link from "next/link";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import type { CognitionCorrelation, CognitionPlaneSummary } from "@/lib/types";

function formatUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function IconKpiTotal() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 6h8M7 8l5 8M17 8l-5 8" />
    </svg>
  );
}

function IconKpiStrong() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M22 12h-4l-3 9-4-18-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconKpiInsights() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 3l1.2 3.6L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3zM5 14l.8 2.4L8 17l-2.2.7L5 20l-.8-2.3L2 17l2.2-.6L5 14zM19 14l.8 2.4L22 17l-2.2.7L19 20l-.8-2.3L16 17l2.2-.6L19 14z" />
    </svg>
  );
}

function categorySlug(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("temporal")) return "temporal";
  if (c.includes("quality")) return "quality";
  return "task";
}

function CategoryIcon({ category }: { category: string }) {
  const slug = categorySlug(category);
  if (slug === "temporal") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" />
      </svg>
    );
  }
  if (slug === "quality") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path d="M12 3l1.5 4.5H18l-3.5 2.5 1.5 4.5L12 12l-4 4.5 1.5-4.5L6 7.5h4.5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function EffectTrendIcon({ direction }: { direction: string }) {
  const cls =
    direction === "negative"
      ? "fb-corr-effect-trend fb-corr-effect-trend--neg"
      : direction === "positive"
        ? "fb-corr-effect-trend fb-corr-effect-trend--pos"
        : "fb-corr-effect-trend";
  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M4 14l4-4 4 3 8-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CorrelationScale({ r }: { r: number }) {
  const pct = ((r + 1) / 2) * 100;
  const markerClass =
    r < -0.05
      ? "fb-corr-scale-marker fb-corr-scale-marker--neg"
      : r > 0.05
        ? "fb-corr-scale-marker fb-corr-scale-marker--pos"
        : "fb-corr-scale-marker";

  return (
    <div className="fb-corr-scale" aria-hidden>
      <div className="fb-corr-scale-labels">
        <span>−1.0</span>
        <span>0</span>
        <span>+1.0</span>
      </div>
      <div className="fb-corr-scale-track">
        <span className="fb-corr-scale-zero" />
        <span
          className={markerClass}
          style={{ left: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

function CorrelationCard({ row }: { row: CognitionCorrelation }) {
  const catSlug = categorySlug(row.category);
  const rLabel = `r = ${row.r.toFixed(2)}`;

  return (
    <article className="fb-corr-card">
      <div className="fb-corr-card-top">
        <div className="fb-corr-card-badges">
          <span
            className={[
              "fb-corr-badge",
              row.strength === "strong" ? "fb-corr-badge--strong" : "fb-corr-badge--weak",
            ].join(" ")}
          >
            {row.strength === "strong" ? "Strong" : "Weak"}
          </span>
          <span className="fb-corr-badge fb-corr-badge--r">{rLabel}</span>
          <span className={`fb-corr-badge fb-corr-badge--cat fb-corr-badge--cat-${catSlug}`}>
            <span className="fb-corr-badge-icon" aria-hidden>
              <CategoryIcon category={row.category} />
            </span>
            {row.category}
          </span>
        </div>
        <div className="fb-corr-card-effect-block">
          <span className="fb-corr-effect-label">Effect</span>
          <span className="fb-corr-effect-value">
            {row.effect_summary}
            <EffectTrendIcon direction={row.direction} />
          </span>
        </div>
      </div>

      <h3 className="fb-corr-card-title">{row.title}</h3>

      <div className="fb-corr-card-scale-row">
        <CorrelationScale r={row.r} />
        <p className="fb-corr-card-insight">
          <span className="fb-corr-insight-label">Insight</span>
          {row.insight}
        </p>
      </div>

      <footer className="fb-corr-card-foot">
        <span className="fb-corr-card-id">{row.correlation_id}</span>
        <Link
          href="/quality"
          className="fb-corr-rec-link"
          title="Recommendations library — open Quality hub for now"
        >
          Open in Recommendations →
        </Link>
      </footer>
    </article>
  );
}

export function CognitionPlaneKpis({ kpis }: { kpis: CognitionPlaneSummary["kpis"] }) {
  return (
    <KpiGrid className="sm:grid-cols-2 xl:grid-cols-3">
      <KpiCard
        label="Total correlations"
        value={String(kpis.total_correlations)}
        sub="rolling 7-day window"
        icon={<IconKpiTotal />}
        iconTone="blue"
      />
      <KpiCard
        label="Strong correlations"
        value={String(kpis.strong_correlations)}
        sub="|r| ≥ 0.80 · ready for action"
        icon={<IconKpiStrong />}
        iconTone="teal"
      />
      <KpiCard
        label="Actionable insights"
        value={String(kpis.actionable_insights)}
        sub="each tied to a recommendation template"
        icon={<IconKpiInsights />}
        iconTone="orange"
      />
    </KpiGrid>
  );
}

export function CognitionPlaneIntro({
  eventCount,
  updatedAt,
  timeRangeLabel,
}: {
  eventCount: number;
  updatedAt: string;
  timeRangeLabel: string;
}) {
  return (
    <div className="fb-corr-intro">
      <p className="fb-corr-meta">
        {eventCount} events · Updated {formatUpdated(updatedAt)} · {timeRangeLabel}
      </p>
      <p className="fb-corr-blurb">
        The correlation engine mines relationships between cost, quality, latency, and
        policy outcomes — surfaced as actionable causal signals to engineering and finance.
        Each pattern links to the underlying workflow and the recommendation template that
        would act on it.
      </p>
    </div>
  );
}

export function CognitionCorrelationList({
  correlations,
}: {
  correlations: CognitionCorrelation[];
}) {
  if (correlations.length === 0) {
    return (
      <div className="fb-corr-panel fb-card-accent-top p-4 sm:p-6">
        <p className="text-sm text-brand-muted">
          Not enough task events in range to discover correlations. Run the pipeline or load
          demo data, then refresh.
        </p>
      </div>
    );
  }

  return (
    <section className="fb-corr-panel fb-card-accent-top">
      <header className="fb-corr-panel-head">
        <div>
          <p className="fb-corr-panel-eyebrow">Correlations</p>
          <h2 className="fb-corr-panel-title">Auto-discovered Patterns</h2>
        </div>
        <div className="fb-corr-panel-legend">
          <span className="fb-corr-legend-item">
            <span className="fb-corr-legend-dot fb-corr-legend-dot--pos" />
            positive r
          </span>
          <span className="fb-corr-legend-item">
            <span className="fb-corr-legend-dot fb-corr-legend-dot--neg" />
            negative r
          </span>
        </div>
      </header>
      <div className="fb-corr-panel-body">
        {correlations.map((row) => (
          <CorrelationCard key={row.correlation_id} row={row} />
        ))}
      </div>
    </section>
  );
}
