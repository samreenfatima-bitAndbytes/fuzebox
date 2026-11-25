import {
  createApiKey,
  createGovernanceRule,
  fetchApiKeys,
  fetchGovernanceCoverage,
  fetchGovernanceGaps,
  fetchGovernanceRules,
  fetchGovernanceViolations,
  patchGovernanceRule,
  revokeApiKey,
} from "./api";
import type {
  ApiKeyRow,
  GovernanceCoverageRow,
  GovernanceGapRow,
  GovernanceRuleRow,
  GovernanceViolationRow,
} from "./types";

export function pct(value: number, digits = 0): string {
  const n = value <= 1 ? value * 100 : value;
  return `${n.toFixed(digits)}%`;
}

export type GapStats = {
  total: number;
  high: number;
  medium: number;
  low: number;
  highAgents: string[];
};

export function buildGapStats(gaps: GovernanceGapRow[]): GapStats {
  const highAgents = gaps
    .filter((g) => g.riskLevel === "HIGH")
    .map((g) => g.agentName);
  return {
    total: gaps.length,
    high: gaps.filter((g) => g.riskLevel === "HIGH").length,
    medium: gaps.filter((g) => g.riskLevel === "MEDIUM").length,
    low: gaps.filter((g) => g.riskLevel === "LOW").length,
    highAgents,
  };
}

export function filterGaps(
  gaps: GovernanceGapRow[],
  search: string,
  riskFilter: string,
): GovernanceGapRow[] {
  const q = search.trim().toLowerCase();
  return gaps.filter((g) => {
    if (riskFilter !== "all" && g.riskLevel !== riskFilter) return false;
    if (!q) return true;
    return (
      g.agentName.toLowerCase().includes(q) ||
      g.agentId.toLowerCase().includes(q) ||
      g.skill.toLowerCase().includes(q) ||
      g.trustTier.toLowerCase().includes(q)
    );
  });
}

export async function loadUnreviewedDecisionsData(days: number): Promise<{
  gaps: GovernanceGapRow[];
  coverage: GovernanceCoverageRow[];
}> {
  const [gaps, coverage] = await Promise.all([
    fetchGovernanceGaps(days),
    fetchGovernanceCoverage(days),
  ]);
  return { gaps, coverage };
}

export function reviewGateIdForSkill(skill: string): string {
  const slug = skill
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 24);
  return `RG-${slug}`;
}

export async function addReviewGate(skill: string): Promise<GovernanceRuleRow> {
  const id = reviewGateIdForSkill(skill);
  return createGovernanceRule({
    id,
    name: `Review gate: ${skill}`,
    task_type: skill,
    enforcement_action: "WARN",
  });
}

export type RuleStatus = "COMPLIANT" | "VIOLATED" | "DISABLED";

export function ruleDisplayStatus(
  rule: GovernanceRuleRow,
  violatedRuleIds: Set<string>,
): RuleStatus {
  if (!rule.isActive) return "DISABLED";
  if (violatedRuleIds.has(rule.id)) return "VIOLATED";
  return "COMPLIANT";
}

export async function loadRulesComplianceData(): Promise<{
  rules: GovernanceRuleRow[];
  violations: GovernanceViolationRow[];
}> {
  const [rules, violations] = await Promise.all([
    fetchGovernanceRules(),
    fetchGovernanceViolations(100),
  ]);
  return { rules, violations };
}

const HITL_POLICY_OUTCOMES = new Set(["human_gate", "blocked"]);

/** Matches AEOS Team Reviews queue filter (policyOutcome human_gate | blocked). */
export function isViolationInHitlQueue(
  violation: GovernanceViolationRow,
): boolean {
  const outcome = (violation.policyOutcome ?? "").toLowerCase();
  return HITL_POLICY_OUTCOMES.has(outcome);
}

/** Wider window than default observation plane — violations API is not day-bounded. */
export const VIOLATION_REVIEW_OBSERVATION_DAYS = 30;

export function violationReviewHref(violation: GovernanceViolationRow): string {
  if (isViolationInHitlQueue(violation)) {
    const params = new URLSearchParams({
      tab: "team",
      agent: violation.agentId,
    });
    if (violation.eventId) params.set("event", violation.eventId);
    return `/quality?${params.toString()}`;
  }
  const params = new URLSearchParams({
    agent: violation.agentId,
    days: String(VIOLATION_REVIEW_OBSERVATION_DAYS),
    via: "violation",
  });
  if (violation.eventId) params.set("event", violation.eventId);
  return `/observation-plane?${params.toString()}`;
}

export function violationReviewLabel(violation: GovernanceViolationRow): string {
  return isViolationInHitlQueue(violation)
    ? "Review in Team Reviews"
    : "View in Observation Plane";
}

export function filterRules(
  rules: GovernanceRuleRow[],
  search: string,
): GovernanceRuleRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return rules;
  return rules.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.taskType.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q),
  );
}

export async function setRuleActive(
  rule: GovernanceRuleRow,
  isActive: boolean,
): Promise<GovernanceRuleRow> {
  return patchGovernanceRule(rule.id, { is_active: isActive });
}

export async function setRuleEnforcement(
  rule: GovernanceRuleRow,
  action: RuleCreateForm["enforcement_action"],
): Promise<GovernanceRuleRow> {
  return patchGovernanceRule(rule.id, { enforcement_action: action });
}

export type RuleCreateForm = {
  id: string;
  name: string;
  description: string;
  task_type: string;
  enforcement_action: "BLOCK" | "WARN" | "LOG";
  reference_code: string;
};

export const EMPTY_RULE_FORM: RuleCreateForm = {
  id: "",
  name: "",
  description: "",
  task_type: "",
  enforcement_action: "WARN",
  reference_code: "",
};

export async function submitNewRule(
  form: RuleCreateForm,
): Promise<GovernanceRuleRow> {
  return createGovernanceRule({
    id: form.id.trim(),
    name: form.name.trim(),
    task_type: form.task_type.trim(),
    enforcement_action: form.enforcement_action,
    description: form.description.trim(),
    reference_code: form.reference_code.trim() || undefined,
  });
}

export async function loadApiKeysData(): Promise<ApiKeyRow[]> {
  const rows = await fetchApiKeys();
  return [...rows].sort((a, b) => {
    const ta = Date.parse(a.createdAt) || 0;
    const tb = Date.parse(b.createdAt) || 0;
    return tb - ta;
  });
}

export { createApiKey, revokeApiKey };
