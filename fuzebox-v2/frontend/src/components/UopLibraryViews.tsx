"use client";

import Link from "next/link";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import {
  ago,
  formatCognitionSnapshot,
  shortSignature,
} from "@/lib/format";
import { trustTierDisplay } from "@/lib/trust-tier";
import type { UopLibraryEntry, UopLibrarySummary } from "@/lib/types";

function formatUsd(n: number, digits = 2): string {
  if (n >= 1000) {
    return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  if (n < 0.01 && n > 0) {
    return `$${n.toFixed(4)}`;
  }
  return `$${n.toFixed(digits)}`;
}

function formatRop(n: number): string {
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

function classificationClass(c: string): string {
  if (c === "AI-Primary") return "fb-uop-class--primary";
  if (c === "Hybrid") return "fb-uop-class--hybrid";
  return "fb-uop-class--assisted";
}

function IconPublished() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M9 12l2 2 4-4M7.5 4h9l1 2h3a1 1 0 011 1v13a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1h3l1-2z" />
    </svg>
  );
}

function IconValue() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7H14a3.5 3.5 0 010 7H6" />
    </svg>
  );
}

function IconReuses() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconClassifications() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function UopLibraryIntro() {
  return (
    <p className="fb-uop-intro">
      Catalogue of measured Units of Production. Each entry is signed with the FuzeBox KMS
      root, composes into higher-order workflows, and increments its reuse counter every time
      it&apos;s invoked downstream — feeding back into the master TUoP equation.
    </p>
  );
}

export function UopLibraryKpis({ kpis }: { kpis: UopLibrarySummary["kpis"] }) {
  const classLine = `${kpis.ai_primary_count} · ${kpis.hybrid_count} · ${kpis.ai_assisted_count}`;
  return (
    <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Published UoPs"
        value={String(kpis.published_uops)}
        sub="signed and chained"
        icon={<IconPublished />}
        iconTone="blue"
      />
      <KpiCard
        label="Total value captured"
        value={formatUsd(kpis.total_value_captured_usd, 0)}
        sub={`avg RoP ${formatRop(kpis.avg_rop)} · total spend ${formatUsd(kpis.total_spend_usd, 2)}`}
        icon={<IconValue />}
        iconTone="teal"
      />
      <KpiCard
        label="Lifetime reuses"
        value={String(kpis.lifetime_reuses)}
        sub="across the tenant fleet"
        icon={<IconReuses />}
        iconTone="orange"
      />
      <KpiCard
        label="Classifications"
        value={classLine}
        sub="AI-Primary · Hybrid · AI-Assisted"
        icon={<IconClassifications />}
        iconTone="blue"
      />
    </KpiGrid>
  );
}

function ShareBar({ label, pct }: { label: string; pct: number }) {
  const width = `${Math.min(100, Math.max(4, pct * 100))}%`;
  return (
    <div className="fb-uop-share-item">
      <span className="fb-uop-share-label">
        {label} · {Math.round(pct * 100)}%
      </span>
      <div className="fb-uop-share-track">
        <span className="fb-uop-share-fill" style={{ width }} />
      </div>
    </div>
  );
}

function UopEntryCard({ entry }: { entry: UopLibraryEntry }) {
  return (
    <article className="fb-uop-card">
      <header className="fb-uop-card-head">
        <div className="fb-uop-card-head-left">
          <div className="fb-uop-card-tags">
            <span className={["fb-uop-class", classificationClass(entry.classification)].join(" ")}>
              {entry.classification}
            </span>
            <span className="fb-uop-tier">
              {trustTierDisplay(entry.trust_level)}
            </span>
          </div>
          <p className="fb-uop-card-meta">
            Cognition Snapshot · {formatCognitionSnapshot(entry.published_at)}
          </p>
          <p className="fb-uop-card-id">{entry.uop_id}</p>
        </div>
        <div className="fb-uop-rop-block">
          <span className="fb-uop-rop-value">{formatRop(entry.rop)}</span>
          <span className="fb-uop-rop-label">RoP</span>
        </div>
      </header>

      <div className="fb-uop-metrics">
        <div className="fb-uop-metric">
          <span className="fb-uop-metric-label">Saved</span>
          <span className="fb-uop-metric-value">{formatUsd(entry.saved_usd, 0)}</span>
        </div>
        <div className="fb-uop-metric">
          <span className="fb-uop-metric-label">Spend</span>
          <span className="fb-uop-metric-value">{formatUsd(entry.spend_usd, 2)}</span>
        </div>
        <div className="fb-uop-metric">
          <span className="fb-uop-metric-label">MER</span>
          <span className="fb-uop-metric-value">
            {entry.mer.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="fb-uop-metric">
          <span className="fb-uop-metric-label">CUoW</span>
          <span className="fb-uop-metric-value">{formatUsd(entry.cuow_usd, 4)}</span>
        </div>
        <div className="fb-uop-metric">
          <span className="fb-uop-metric-label">Reuses</span>
          <span className="fb-uop-metric-value">{entry.reuses}</span>
        </div>
        <div className="fb-uop-metric">
          <span className="fb-uop-metric-label">Net</span>
          <span className="fb-uop-metric-value">{formatUsd(entry.net_usd, 0)}</span>
        </div>
      </div>

      <div className="fb-uop-share-section">
        <p className="fb-uop-share-title">
          H / A / S share
          <span className="fb-uop-share-s">S = {entry.s_share.toFixed(3)}</span>
        </p>
        <div className="fb-uop-share-grid">
          <ShareBar label="H" pct={entry.h_share} />
          <ShareBar label="A" pct={entry.a_share} />
          <ShareBar label="S" pct={entry.s_share} />
        </div>
      </div>

      <p className="fb-uop-sig">
        sig{" "}
        <span className="font-mono">{shortSignature(entry.kms_signature)}</span>
      </p>

      <footer className="fb-uop-card-foot">
        <span className="fb-uop-published-meta">
          published {ago(entry.published_at)} · by {entry.published_by}
        </span>
        <Link
          href={`/scenario-builder?scenario=${encodeURIComponent(entry.scenario_id)}`}
          className="fb-uop-reuse-link"
        >
          Reuse
        </Link>
      </footer>
    </article>
  );
}

export function UopLibraryCatalog({ entries }: { entries: UopLibraryEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="fb-uop-panel fb-card-accent-top p-4 sm:p-6">
        <p className="text-sm text-brand-muted">
          No published UoPs yet. Activate a scenario in Scenario Builder or run the pipeline
          to populate the catalogue.
        </p>
        <Link href="/scenario-builder" className="mt-2 inline-block text-sm text-brand-primary hover:underline">
          Open Scenario Builder
        </Link>
      </div>
    );
  }

  return (
    <section className="fb-uop-panel fb-card-accent-top">
      <div className="fb-uop-panel-body">
        {entries.map((entry) => (
          <UopEntryCard key={entry.uop_id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
