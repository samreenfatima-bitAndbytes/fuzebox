import type { AgentRegistryItem } from "@/lib/types";

export type AgentRegistrySort = "name-asc" | "name-desc";

export const AGENT_REGISTRY_SORT_OPTIONS: {
  value: AgentRegistrySort;
  label: string;
}[] = [
  { value: "name-asc", label: "A → Z" },
  { value: "name-desc", label: "Z → A" },
];

export function sortAgentRegistry(
  agents: AgentRegistryItem[],
  sort: AgentRegistrySort,
): AgentRegistryItem[] {
  const copy = [...agents];
  if (sort === "name-desc") {
    copy.sort((a, b) => b.name.localeCompare(a.name));
  } else {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  }
  return copy;
}
