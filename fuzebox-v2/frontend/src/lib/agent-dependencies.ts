import type {
  AgentDependenciesSummary,
  DependencyProcessChain,
  DependencyRisk,
  DependencySharedResource,
} from "@/lib/types";

export type DependencyRiskFilter = "all" | "high" | "medium" | "low";

function agentNames(agents: { name: string; agent_id: string }[]): string {
  return agents.map((a) => `${a.name} ${a.agent_id}`).join(" ");
}

export function filterProcessChains(
  chains: DependencyProcessChain[],
  query: string,
): DependencyProcessChain[] {
  const q = query.trim().toLowerCase();
  if (!q) return chains;
  return chains.filter((c) => {
    const hay = [
      c.title,
      c.process_label,
      c.process_id,
      ...c.nodes.map((n) => `${n.name} ${n.agent_id} ${n.model}`),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function filterSharedResources(
  resources: DependencySharedResource[],
  query: string,
): DependencySharedResource[] {
  const q = query.trim().toLowerCase();
  if (!q) return resources;
  return resources.filter((r) => {
    const hay = [r.name, r.detail, r.resource_id, agentNames(r.agents)]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function filterDependencyRisks(
  risks: DependencyRisk[],
  query: string,
  severity: DependencyRiskFilter,
): DependencyRisk[] {
  let rows = risks;
  if (severity !== "all") {
    rows = rows.filter((r) => r.severity.toLowerCase() === severity);
  }
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => {
    const hay = [r.risk_id, r.title, r.blast_radius, agentNames(r.agents)]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function countMultiStepChains(chains: DependencyProcessChain[]): number {
  return chains.filter((c) => c.nodes.length >= 2).length;
}

export function countChainsBySource(
  chains: DependencyProcessChain[],
  source: string,
): number {
  return chains.filter((c) => (c.chain_source ?? "tasks") === source).length;
}

/** Merge task/scenario chains with audit-hash observation chains; observation first. */
export function mergeDependencySummaries(
  base: AgentDependenciesSummary,
  eventChains: DependencyProcessChain[],
): AgentDependenciesSummary {
  const existingIds = new Set(base.process_chains.map((c) => c.process_id));
  const mergedEvents = eventChains.filter((c) => !existingIds.has(c.process_id));
  const process_chains = [...mergedEvents, ...base.process_chains];
  return {
    ...base,
    kpis: {
      ...base.kpis,
      process_chains: process_chains.length,
    },
    process_chains,
  };
}

export type FilteredDependencies = {
  process_chains: DependencyProcessChain[];
  shared_resources: DependencySharedResource[];
  risks: DependencyRisk[];
};

export function filterAgentDependencies(
  data: AgentDependenciesSummary,
  query: string,
  riskFilter: DependencyRiskFilter,
): FilteredDependencies {
  return {
    process_chains: filterProcessChains(data.process_chains, query),
    shared_resources: filterSharedResources(data.shared_resources, query),
    risks: filterDependencyRisks(data.risks, query, riskFilter),
  };
}
