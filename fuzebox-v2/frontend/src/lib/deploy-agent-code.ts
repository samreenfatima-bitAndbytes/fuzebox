import {
  deployAgent,
  fetchDeployments,
  fetchUopLibraryAlias,
  validateDeployment,
} from "./api";
import type {
  DeploymentCreateBody,
  DeploymentRow,
  DeploymentValidateResult,
  UopLibraryAliasEntry,
} from "./types";

export type CodeLanguage = "json" | "crewai" | "python";

export const SAMPLE_CODE: Record<CodeLanguage, string> = {
  json: JSON.stringify(
    {
      agent_id: "agt_pricing_optimizer",
      name: "Pricing Optimizer",
      hyperscaler: "anthropic",
      model: "claude-sonnet-4-6",
      workflow_id: "wf_pricing_q3",
      skills: ["pull_competitor_pricing", "compute_elasticity", "post_to_pos"],
      triggers: ["cron:0 */6 * * *"],
      guardrails: ["max_change_pct:0.08"],
      rop_target: 4.5,
      recursive_depth: 3,
    },
    null,
    2,
  ),
  crewai: `from crewai import Agent, Task, Crew

researcher = Agent(
  role="Edge Researcher",
  goal="Surface advantageous lines across NFL books",
  backstory="Quant who reads four sportsbooks at once.",
  llm="anthropic/claude-sonnet-4-6",
)

writer = Agent(
  role="Recommendation Writer",
  goal="Compose customer-facing edge note",
  backstory="Senior content producer with compliance training.",
  llm="anthropic/claude-opus-4-6",
)

scan = Task(description="Pull and normalize lines", agent=researcher)
write = Task(description="Write the edge note", agent=writer)
crew = Crew(agents=[researcher, writer], tasks=[scan, write])
`,
  python: `# Customer Response Triage agent
class CustomerResponseTriage:
    model = "gpt-4-mini"
    trust_tier = "T0_unverified"

    def run(self, msg):
        intent = self.classify(msg)
        if intent.confidence < 0.7:
            return self.escalate_to_human(msg, intent)
        return self.route(intent)
`,
};

export const LANG_LABELS: Record<CodeLanguage, string> = {
  json: "JSON manifest",
  crewai: "CrewAI",
  python: "Python",
};

export const CLASSIFICATION_OPTIONS = [
  { value: "AI-Primary", label: "AI-Primary" },
  { value: "Hybrid", label: "Hybrid" },
  { value: "AI-Assisted", label: "AI-Assisted" },
  { value: "Human-Only", label: "Human-Only" },
];

export const TRUST_TIER_OPTIONS = [
  { value: "T0_unverified", label: "T0 · Unverified" },
];

export type DeployAgentCodeData = {
  deployments: DeploymentRow[];
  uopEntries: UopLibraryAliasEntry[];
};

export type DeploymentStats = {
  total: number;
  valid: number;
  warnings: number;
  errors: number;
  inherited: number;
};

export function buildDeploymentStats(deployments: DeploymentRow[]): DeploymentStats {
  return {
    total: deployments.length,
    valid: deployments.filter((d) => d.validationStatus === "valid").length,
    warnings: deployments.filter((d) => d.validationStatus === "warnings").length,
    errors: deployments.filter((d) => d.validationStatus === "errors").length,
    inherited: deployments.filter((d) => d.reuseFromUop).length,
  };
}

export function validationTone(
  status: DeploymentValidateResult["validationStatus"] | undefined,
): "ok" | "warn" | "fail" | "muted" {
  if (!status) return "muted";
  if (status === "valid") return "ok";
  if (status === "warnings") return "warn";
  return "fail";
}

export async function loadDeployAgentCodeData(): Promise<DeployAgentCodeData> {
  const [deployments, uopEntries] = await Promise.all([
    fetchDeployments(),
    fetchUopLibraryAlias().catch(() => [] as UopLibraryAliasEntry[]),
  ]);
  return { deployments, uopEntries };
}

export async function runValidate(
  language: CodeLanguage,
  code: string,
): Promise<DeploymentValidateResult | null> {
  if (!code.trim()) return null;
  return validateDeployment(language, code);
}

export async function runDeploy(
  body: DeploymentCreateBody,
): Promise<DeploymentRow> {
  return deployAgent(body);
}

export function filterDeployments(
  deployments: DeploymentRow[],
  search: string,
): DeploymentRow[] {
  const q = search.trim().toLowerCase();
  if (!q) return deployments;
  return deployments.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.deploymentId.toLowerCase().includes(q) ||
      d.agentKind.toLowerCase().includes(q) ||
      d.codeLanguage.toLowerCase().includes(q) ||
      (d.validationNotes ?? "").toLowerCase().includes(q),
  );
}
