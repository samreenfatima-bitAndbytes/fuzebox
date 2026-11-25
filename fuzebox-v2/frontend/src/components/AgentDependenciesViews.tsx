"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FilterChipGroup } from "@/components/ui/FilterChipGroup";
import { KpiCard, KpiGrid } from "@/components/ui/KpiCard";
import { PageTabPanel, PageTabs } from "@/components/ui/PageTabs";
import {
  countMultiStepChains,
  filterDependencyRisks,
  filterProcessChains,
  filterSharedResources,
  type DependencyRiskFilter,
} from "@/lib/agent-dependencies";
import { formatAvgSigma, formatSigma } from "@/lib/format";
import { useShellScrollChain } from "@/lib/scroll-chain";
import type {
  AgentDependenciesSummary,
  DependencyFlowNode,
  DependencyProcessChain,
  DependencyRisk,
  DependencySharedResource,
} from "@/lib/types";

const DEPS_TABS = [
  { id: "overview-flow" as const, label: "Overview & data flow" },
  { id: "resources-risks" as const, label: "Resources & risks" },
];

const RISK_FILTERS: { id: DependencyRiskFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" },
];

function IconProcessChains() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 6h8M7 8l5 8M17 8l-5 8" />
    </svg>
  );
}

function IconAgentsWired() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconSharedResources() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}

function IconRisks() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

function IconDatabase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <ellipse cx="12" cy="5" rx="7" ry="2.5" />
      <path d="M5 5v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5" />
      <path d="M5 9v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V9" />
      <path d="M5 13v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
    </svg>
  );
}

export function AgentDependenciesKpis({
  kpis,
  multiStepChains,
  days,
}: {
  kpis: AgentDependenciesSummary["kpis"];
  multiStepChains: number;
  days: number;
}) {
  return (
    <KpiGrid className="sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Process chains"
        value={String(kpis.process_chains)}
        sub={`${multiStepChains} multi-agent · last ${days}d`}
        icon={<IconProcessChains />}
        iconTone="blue"
      />
      <KpiCard
        label="Agents wired"
        value={String(kpis.agents_wired)}
        sub="Registry + scenario pipelines"
        icon={<IconAgentsWired />}
        iconTone="teal"
      />
      <KpiCard
        label="Shared resources"
        value={String(kpis.shared_resources)}
        sub="Catalog matched to agents"
        icon={<IconSharedResources />}
        iconTone="orange"
      />
      <KpiCard
        label="High-impact risks"
        value={String(kpis.high_impact_risks)}
        sub="Cascade-prone failure points"
        icon={<IconRisks />}
        iconTone="red"
      />
    </KpiGrid>
  );
}

function sigmaDotClass(tone: string): string {
  if (tone === "healthy") return "fb-deps-sigma-dot--healthy";
  if (tone === "watch") return "fb-deps-sigma-dot--watch";
  return "fb-deps-sigma-dot--risk";
}

function FlowNode({ node }: { node: DependencyFlowNode }) {
  return (
    <div className="fb-deps-node">
      <p className="fb-deps-node-sigma">
        <span
          className={["fb-deps-sigma-dot", sigmaDotClass(node.sigma_tone)].join(" ")}
          aria-hidden
        />
        {formatSigma(node.sigma)}
      </p>
      <Link
        href={`/agents/${encodeURIComponent(node.agent_id)}/edit`}
        className="fb-deps-node-name hover:text-brand-primary"
      >
        {node.name}
      </Link>
      <p className="fb-deps-node-meta">
        {node.model} · {node.closed_runs} closed runs
      </p>
    </div>
  );
}

function chainSourceLabel(source: string | undefined): string {
  if (source === "events") return "Live event sequence";
  if (source === "scenario") return "Scenario pipeline";
  return "Agent activity";
}

function ProcessChainRow({ chain }: { chain: DependencyProcessChain }) {
  const multi = chain.nodes.length >= 2;
  const source = chain.chain_source ?? "tasks";
  return (
    <article className="fb-deps-process-row">
      <header className="fb-deps-process-row-head">
        <div className="min-w-0">
          <span className="fb-deps-process-id">{chain.process_id}</span>
          <p className="mt-0.5 truncate text-sm font-medium text-brand-ink">
            {chain.title}
          </p>
          <p className="text-xs text-brand-muted">
            {chainSourceLabel(source)}
            {multi ? ` · ${chain.nodes.length} steps` : " · single agent"}
          </p>
        </div>
        <span className="fb-deps-process-avg shrink-0">
          {formatAvgSigma(chain.avg_sigma)}
        </span>
      </header>
      <div className="fb-deps-process-row-body">
        {chain.nodes.map((node, i) => (
          <div
            key={`${chain.process_id}-${node.agent_id}`}
            className="fb-deps-flow-step"
          >
            {i > 0 && <span className="fb-deps-flow-arrow" aria-hidden />}
            <FlowNode node={node} />
          </div>
        ))}
      </div>
    </article>
  );
}

export function AgentDependenciesDataFlow({
  chains,
  totalCount,
}: {
  chains: DependencyProcessChain[];
  totalCount: number;
}) {
  const scrollRef = useShellScrollChain();

  if (totalCount === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No process chains yet.{" "}
        <Link href="/agents/new" className="text-brand-primary hover:underline">
          Register agents
        </Link>{" "}
        and run scenarios to populate data flow.
      </p>
    );
  }

  if (chains.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No chains match the current filters ({totalCount} total).
      </p>
    );
  }

  return (
    <section className="fb-kpi-chrome fb-deps-dataflow-panel p-4 sm:p-6">
      <header className="fb-deps-section-head">
        <h2 className="fb-deps-section-title">Data flow</h2>
        <p className="fb-deps-section-sub">
          Per-process pipelines (color = sigma from task success in window)
        </p>
        {chains.length < totalCount ? (
          <p className="mt-1 text-xs text-brand-muted">
            Showing {chains.length} of {totalCount} chains
          </p>
        ) : null}
      </header>
      <div ref={scrollRef} className="fb-deps-flow-scroll">
        <div className="fb-deps-process-list">
          {chains.map((chain) => (
            <ProcessChainRow key={chain.process_id} chain={chain} />
          ))}
        </div>
      </div>
      <ul className="fb-deps-legend" aria-label="Sigma health legend">
        <li>
          <span className="fb-deps-legend-swatch fb-deps-sigma-dot--healthy" />
          ≥ 4σ healthy
        </li>
        <li>
          <span className="fb-deps-legend-swatch fb-deps-sigma-dot--watch" />
          3–4σ watch
        </li>
        <li>
          <span className="fb-deps-legend-swatch fb-deps-sigma-dot--risk" />
          &lt; 3σ at-risk
        </li>
      </ul>
    </section>
  );
}

function ResourceStatus({ status }: { status: string }) {
  const stale = status.toLowerCase() === "stale";
  return (
    <span
      className={[
        "fb-deps-status",
        stale ? "fb-deps-status--stale" : "fb-deps-status--healthy",
      ].join(" ")}
    >
      {stale ? "Stale" : "Healthy"}
    </span>
  );
}

export function AgentDependenciesResources({
  resources,
  totalCount,
}: {
  resources: DependencySharedResource[];
  totalCount: number;
}) {
  if (totalCount === 0) {
    return (
      <p className="text-sm text-brand-muted">No shared resources in catalog.</p>
    );
  }

  if (resources.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No resources match the current filters ({totalCount} total).
      </p>
    );
  }

  return (
    <section className="fb-kpi-chrome p-4 sm:p-6">
      <header className="fb-deps-section-head">
        <h2 className="fb-deps-section-title">Shared resources</h2>
        <p className="fb-deps-section-sub">
          APIs &amp; data feeds reused across agents
        </p>
        {resources.length < totalCount ? (
          <p className="mt-1 text-xs text-brand-muted">
            Showing {resources.length} of {totalCount}
          </p>
        ) : null}
      </header>
      <ul className="fb-deps-resource-list">
        {resources.map((r) => (
          <li key={r.resource_id} className="fb-deps-resource-item">
            <div className="fb-deps-resource-top">
              <div className="fb-deps-resource-title">
                <span className="fb-deps-resource-icon">
                  <IconDatabase />
                </span>
                <span className="fb-deps-resource-name">{r.name}</span>
              </div>
              <ResourceStatus status={r.status} />
            </div>
            <p className="fb-deps-resource-detail">{r.detail}</p>
            {r.agents.length > 0 && (
              <div className="fb-deps-agent-chips">
                {r.agents.map((a) => (
                  <Link
                    key={a.agent_id}
                    href={`/agents/${encodeURIComponent(a.agent_id)}/edit`}
                    className="fb-deps-agent-chip"
                  >
                    {a.name}
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RiskAgentChips({ agents }: { agents: DependencyRisk["agents"] }) {
  if (!agents.length) return null;
  return (
    <div className="fb-deps-agent-chips mt-2">
      {agents.map((a) => (
        <Link
          key={a.agent_id}
          href={`/agents/${encodeURIComponent(a.agent_id)}/edit`}
          className="fb-deps-agent-chip"
        >
          {a.name}
        </Link>
      ))}
    </div>
  );
}

export function AgentDependenciesRisks({
  risks,
  totalCount,
  riskFilter,
  onRiskFilterChange,
}: {
  risks: DependencyRisk[];
  totalCount: number;
  riskFilter: DependencyRiskFilter;
  onRiskFilterChange: (f: DependencyRiskFilter) => void;
}) {
  return (
    <section className="fb-kpi-chrome p-4 sm:p-6">
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="fb-deps-section-head mb-0">
          <h2 className="fb-deps-section-title">Dependency risks</h2>
          <p className="fb-deps-section-sub">Cascade-prone failure points</p>
          {risks.length < totalCount ? (
            <p className="mt-1 text-xs text-brand-muted">
              Showing {risks.length} of {totalCount}
            </p>
          ) : null}
        </div>
        <FilterChipGroup
          options={RISK_FILTERS}
          value={riskFilter}
          onChange={onRiskFilterChange}
          ariaLabel="Filter by severity"
        />
      </header>
      {totalCount === 0 ? (
        <p className="text-sm text-brand-muted">No risks in catalog.</p>
      ) : risks.length === 0 ? (
        <p className="text-sm text-brand-muted">No risks match the current filters.</p>
      ) : (
        <ul className="fb-deps-risk-list">
          {risks.map((r) => {
            const sev = r.severity.toLowerCase();
            return (
              <li
                key={r.risk_id}
                className={["fb-deps-risk-card", `fb-deps-risk-card--${sev}`].join(" ")}
              >
                <div className="fb-deps-risk-top">
                  <span className="fb-deps-risk-id">{r.risk_id}</span>
                  <span className={`fb-deps-risk-sev fb-deps-risk-sev--${sev}`}>
                    {r.severity.toUpperCase()}
                  </span>
                </div>
                <p className="fb-deps-risk-title">{r.title}</p>
                <p className="fb-deps-risk-blast">{r.blast_radius}</p>
                <RiskAgentChips agents={r.agents} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
        className="fb-input mb-4 w-full max-w-sm text-sm"
      />
    </>
  );
}

export function AgentDependenciesDashboard({
  data,
}: {
  data: AgentDependenciesSummary;
}) {
  const [tab, setTab] = useState<(typeof DEPS_TABS)[number]["id"]>("overview-flow");
  const [flowSearch, setFlowSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<DependencyRiskFilter>("all");

  const filteredChains = useMemo(
    () => filterProcessChains(data.process_chains, flowSearch),
    [data.process_chains, flowSearch],
  );
  const filteredResources = useMemo(
    () => filterSharedResources(data.shared_resources, catalogSearch),
    [data.shared_resources, catalogSearch],
  );
  const filteredRisks = useMemo(
    () => filterDependencyRisks(data.risks, catalogSearch, riskFilter),
    [data.risks, catalogSearch, riskFilter],
  );

  const multiStep = countMultiStepChains(data.process_chains);

  return (
    <div className="space-y-4">
      <PageTabs tabs={DEPS_TABS} active={tab} onChange={setTab} />

      {tab === "overview-flow" && (
        <PageTabPanel id="panel-deps-overview-flow" labelledBy="tab-overview-flow">
          <div className="space-y-4">
            <AgentDependenciesKpis
              kpis={data.kpis}
              multiStepChains={multiStep}
              days={data.days}
            />
            <TabSearchInput
              id="deps-flow-search"
              value={flowSearch}
              onChange={setFlowSearch}
              placeholder="Search chains…"
            />
            <AgentDependenciesDataFlow
              chains={filteredChains}
              totalCount={data.process_chains.length}
            />
          </div>
        </PageTabPanel>
      )}

      {tab === "resources-risks" && (
        <PageTabPanel id="panel-deps-resources-risks" labelledBy="tab-resources-risks">
          <div className="space-y-4">
            <TabSearchInput
              id="deps-catalog-search"
              value={catalogSearch}
              onChange={setCatalogSearch}
              placeholder="Search resources, risks…"
            />
            <AgentDependenciesResources
              resources={filteredResources}
              totalCount={data.shared_resources.length}
            />
            <AgentDependenciesRisks
              risks={filteredRisks}
              totalCount={data.risks.length}
              riskFilter={riskFilter}
              onRiskFilterChange={setRiskFilter}
            />
          </div>
        </PageTabPanel>
      )}
    </div>
  );
}
