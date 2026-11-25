import {
  DEFAULT_COST_IN,
  DEFAULT_COST_OUT,
  DEFAULT_HUMAN_BASELINE_MINS,
  DEFAULT_MANUAL_HOURLY_USD,
} from "./constants";
import type {
  AgentDetail,
  ScenarioCost,
  ScenarioDetail,
  ScenarioPipelineStep,
  ScenarioWriteBody,
} from "./types";

export type PipelineStepDraft = ScenarioPipelineStep & { uid: string };

export type ScenarioDraft = {
  editingId: string | null;
  name: string;
  description: string;
  status: string;
  teamAgentIds: string[];
  extraPermissions: string[];
  pipeline: PipelineStepDraft[];
  cost: ScenarioCost;
};

export function newStep(n: number): PipelineStepDraft {
  return {
    uid: Math.random().toString(36).slice(2, 10),
    step_number: n,
    name: `Step ${n}`,
    agent_id: null,
    task_type: "general_inquiry",
    expected_latency_ms: 5000,
    expected_quality: 0.85,
    input_tokens: 1000,
    output_tokens: 500,
  };
}

export function emptyDraft(): ScenarioDraft {
  return {
    editingId: null,
    name: "",
    description: "",
    status: "draft",
    teamAgentIds: [],
    extraPermissions: [],
    pipeline: [newStep(1)],
    cost: {
      price_per_1k_input: DEFAULT_COST_IN,
      price_per_1k_output: DEFAULT_COST_OUT,
      human_baseline_minutes: DEFAULT_HUMAN_BASELINE_MINS,
      manual_hourly_cost_usd: DEFAULT_MANUAL_HOURLY_USD,
      cost_center: "",
      ledger_account: "",
    },
  };
}

export function detailToDraft(d: ScenarioDetail): ScenarioDraft {
  return {
    editingId: d.scenario_id,
    name: d.name,
    description: d.description,
    status: d.status,
    teamAgentIds: d.team.agent_ids,
    extraPermissions: d.team.extra_permissions,
    pipeline: d.pipeline.map((s) => ({
      ...s,
      uid: Math.random().toString(36).slice(2, 10),
    })),
    cost: { ...d.cost },
  };
}

export function draftToWriteBody(draft: ScenarioDraft): ScenarioWriteBody {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    status: draft.status,
    team: {
      agent_ids: draft.teamAgentIds,
      extra_permissions: draft.extraPermissions,
    },
    pipeline: draft.pipeline.map((s, i) => ({
      step_number: i + 1,
      name: s.name,
      agent_id: s.agent_id,
      task_type: s.task_type,
      expected_latency_ms: s.expected_latency_ms,
      expected_quality: s.expected_quality,
      input_tokens: s.input_tokens,
      output_tokens: s.output_tokens,
    })),
    cost: draft.cost,
  };
}

/** Matches backend ScenarioConfig.roi_multiplier (manual × steps / LLM est). */
export function computeCostPreview(
  pipeline: PipelineStepDraft[],
  cost: ScenarioCost,
) {
  const est = pipeline.reduce(
    (sum, s) =>
      sum +
      (s.input_tokens / 1000) * cost.price_per_1k_input +
      (s.output_tokens / 1000) * cost.price_per_1k_output,
    0,
  );
  const manualPerTask =
    (cost.human_baseline_minutes / 60) * cost.manual_hourly_cost_usd;
  const manualTotal = manualPerTask * Math.max(pipeline.length, 1);
  const roi =
    est > 0 ? Math.round((manualTotal / est) * 100) / 100 : 0;
  return { est, manualPerTask, manualTotal, roi };
}

export function inheritedPermissions(
  agentIds: string[],
  agents: AgentDetail[],
): string[] {
  const byId = new Map(agents.map((a) => [a.agent_id, a]));
  const perms = new Set<string>();
  for (const id of agentIds) {
    for (const p of byId.get(id)?.permissions ?? []) {
      perms.add(p);
    }
  }
  return [...perms].sort();
}
