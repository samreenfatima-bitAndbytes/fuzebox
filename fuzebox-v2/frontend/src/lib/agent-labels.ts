/** Display label for skill/permission/task type keys from the registry API. */
export function formatCapabilityLabel(key: string): string {
  const normalized = key.replace(/:/g, " ").replace(/_/g, " ").trim();
  if (!normalized) return key;
  return normalized.replace(/\b\w/g, (c) => c.toUpperCase());
}

const VENDOR_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  azure: "Azure",
  aws: "AWS",
  unknown: "Unknown",
};

/** Hyperscaler / vendor slug from observation and roster APIs. */
export function formatVendorLabel(vendor: string): string {
  const trimmed = vendor.trim();
  if (!trimmed || trimmed === "—") return "—";
  const key = trimmed.toLowerCase();
  return VENDOR_LABELS[key] ?? formatCapabilityLabel(key);
}

const COVERAGE_STATUS_LABELS: Record<string, string> = {
  covered: "Covered",
  degraded: "Degraded",
  gap: "Gap",
};

export function formatCoverageStatus(status: string): string {
  const key = status.trim().toLowerCase();
  return COVERAGE_STATUS_LABELS[key] ?? formatCapabilityLabel(status);
}

const TASK_RESULT_LABELS: Record<string, string> = {
  success: "Success",
  failure: "Failure",
  timeout: "Timeout",
  partial: "Partial",
  escalated: "Escalated",
};

export function formatTaskResultLabel(result: string): string {
  const key = result.trim().toLowerCase();
  return TASK_RESULT_LABELS[key] ?? formatCapabilityLabel(result);
}

const AGENT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  error: "Error",
};

export function formatAgentStatusLabel(status: string): string {
  const key = status.trim().toLowerCase();
  return AGENT_STATUS_LABELS[key] ?? formatCapabilityLabel(status);
}

export function buildAgentNameMap(
  agents: { agent_id: string; name: string }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of agents) {
    m.set(a.agent_id, a.name);
    m.set(a.name, a.name);
  }
  return m;
}

export function resolveAgentLabel(
  agentId: string,
  nameMap: Map<string, string>,
): string {
  return nameMap.get(agentId) ?? agentId;
}

/** Human name when known, else the raw id (for filter banners). */
export function agentFilterDisplayName(
  agentId: string,
  nameMap: Map<string, string>,
): string {
  const id = agentId.trim();
  const name = resolveAgentLabel(id, nameMap);
  return name === id ? id : name;
}
