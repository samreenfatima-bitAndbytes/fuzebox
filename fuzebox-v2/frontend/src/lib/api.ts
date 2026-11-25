import { clearSession, getApiUrl, getSession } from "./auth";
import type {
  AgentDependenciesSummary,
  DependencyProcessChain,
  CognitionPlaneSummary,
  UopLibrarySummary,
  AgentDetail,
  AgentEnrichedRow,
  AgentMatrix,
  AgentRegistryItem,
  ObservationEventRow,
  AgentViolationsResponse,
  AgentWriteBody,
  MeResponse,
  ObservationCoverageRow,
  ObservationSummary,
  EconomicsSummary,
  OverviewSummary,
  PerformanceSummary,
  QualitySummary,
  CreateQualityTaskRequest,
  CreateQualityTaskResponse,
  RunQualityTaskResponse,
  ScreeningSummary,
  GovernanceReview,
  GovernancePerformance,
  ObservationRegistryRow,
  OutreachSummary,
  TaskScorecardsSummary,
  TokenResponse,
  WebhookSubmitResponse,
  TraceDetail,
  TraceListResponse,
  RunReviewSummary,
  WorkflowStudio,
  TuneRequest,
  PipelineStatus,
  ScenarioCostPatch,
  ScenarioDetail,
  ScenarioSummary,
  ScenarioWriteBody,
  DeploymentRow,
  DeploymentValidateResult,
  DeploymentCreateBody,
  UopLibraryAliasEntry,
  GovernanceDecideDecision,
  GovernanceDecideResult,
  GovernanceGapRow,
  GovernanceCoverageRow,
  GovernanceRuleRow,
  GovernanceViolationRow,
  ApiKeyRow,
  ApiKeyCreateResponse,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public reason?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function formatApiErrorDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((entry) => {
        if (entry && typeof entry === "object" && "msg" in entry) {
          let msg = String((entry as { msg: string }).msg);
          if (msg.startsWith("Value error, ")) {
            msg = msg.slice("Value error, ".length);
          }
          return msg;
        }
        return String(entry);
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }
  return String(detail ?? "Request failed");
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  if (init?.auth !== false) {
    const session = getSession();
    if (!session) throw new ApiError("Not authenticated", 401);
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const res = await fetch(`${getApiUrl()}${path}`, { ...init, headers });

  if (res.status === 401) {
    clearSession();
    throw new ApiError("Session expired", 401);
  }

  if (!res.ok) {
    let detail = res.statusText;
    let reason: string | undefined;
    try {
      const body = await res.json();
      detail = formatApiErrorDetail(body.detail ?? detail);
      if (typeof body.reason === "string") {
        reason = body.reason;
      }
    } catch {
      /* ignore */
    }
    if (
      res.status === 404 &&
      (detail === "Not Found" || detail === "Not found")
    ) {
      detail =
        "API route not found — restart the webhook service (docker restart fuzebox-webhook-v2) so it loads the latest routes.";
    }
    throw new ApiError(String(detail), res.status, reason);
  }

  return res.json() as Promise<T>;
}

export async function login(
  username: string,
  password: string,
): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/token", {
    method: "POST",
    auth: false,
    body: JSON.stringify({ username, password }),
  });
}

export async function registerAccount(
  orgName: string,
  username: string,
  password: string,
): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/register", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      org_name: orgName.trim(),
      username: username.trim(),
      password,
    }),
  });
}

export async function fetchMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/auth/me");
}

export type TenantConfig = {
  deploymentHealthUrl: string | null;
};

export async function fetchTenantConfig(): Promise<TenantConfig> {
  return apiFetch<TenantConfig>("/api/tenant");
}

export async function patchDeploymentHealthUrl(
  deploymentHealthUrl: string | null,
): Promise<TenantConfig> {
  return apiFetch<TenantConfig>("/api/tenant/deployment-health-url", {
    method: "PATCH",
    body: JSON.stringify({ deploymentHealthUrl }),
  });
}

export async function seedDemoData(): Promise<{
  message: string;
  agents: number;
  tasks: number;
  spans: number;
  workflows: number;
}> {
  return apiFetch("/api/admin/seed-demo", { method: "POST" });
}

export async function submitWebhookRequest(
  text: string,
  source = "dashboard",
  metadata?: Record<string, unknown>,
  customerId?: string,
): Promise<WebhookSubmitResponse> {
  return apiFetch<WebhookSubmitResponse>("/webhook", {
    method: "POST",
    body: JSON.stringify({
      text,
      source,
      metadata: metadata ?? {},
      customer_id: customerId ?? undefined,
    }),
  });
}

export async function fetchAgents(): Promise<AgentRegistryItem[]> {
  return apiFetch<AgentRegistryItem[]>("/api/agents");
}

export async function fetchEnrichedAgents(
  days = 7,
): Promise<AgentEnrichedRow[]> {
  return apiFetch<AgentEnrichedRow[]>(`/api/agents?enriched=1&days=${days}`);
}

export async function fetchObservationEvents(
  days = 7,
  limit = 200,
): Promise<ObservationEventRow[]> {
  return apiFetch<ObservationEventRow[]>(
    `/api/observation/events?days=${days}&limit=${limit}`,
  );
}

export async function fetchAgentDependencies(
  days = 30,
): Promise<AgentDependenciesSummary> {
  return apiFetch<AgentDependenciesSummary>(
    `/api/agents/dependencies?days=${days}`,
  );
}

export async function fetchObservationDependencies(
  days = 30,
): Promise<DependencyProcessChain[]> {
  return apiFetch<DependencyProcessChain[]>(
    `/api/observation/dependencies?days=${days}`,
  );
}

export async function fetchCorrelations(
  days = 7,
): Promise<CognitionPlaneSummary> {
  return apiFetch<CognitionPlaneSummary>(
    `/api/six-sigma/correlations?days=${days}`,
  );
}

/** @deprecated Use fetchCorrelations — legacy Cognition Plane path */
export async function fetchCognitionPlane(
  days = 7,
): Promise<CognitionPlaneSummary> {
  return fetchCorrelations(days);
}

export async function fetchUopLibrary(
  manualCost = 75,
): Promise<UopLibrarySummary> {
  return apiFetch<UopLibrarySummary>(
    `/api/economic-cognition/uop-library?manual_cost=${manualCost}`,
  );
}

function agentIdsQuery(agentIds: string[]): string {
  if (agentIds.length === 0) return "";
  return `?agent_ids=${agentIds.map(encodeURIComponent).join(",")}`;
}

export async function fetchSkillsMatrix(
  agentIds: string[] = [],
): Promise<AgentMatrix> {
  return apiFetch<AgentMatrix>(
    `/api/agents/matrices/skills${agentIdsQuery(agentIds)}`,
  );
}

export async function fetchPermissionsMatrix(
  agentIds: string[] = [],
): Promise<AgentMatrix> {
  return apiFetch<AgentMatrix>(
    `/api/agents/matrices/permissions${agentIdsQuery(agentIds)}`,
  );
}

export async function fetchAgentViolations(): Promise<AgentViolationsResponse> {
  return apiFetch<AgentViolationsResponse>("/api/agents/violations");
}

export async function fetchAgent(agentId: string): Promise<AgentDetail> {
  return apiFetch<AgentDetail>(`/api/agents/${encodeURIComponent(agentId)}`);
}

export async function createAgent(body: AgentWriteBody): Promise<AgentDetail> {
  return apiFetch<AgentDetail>("/api/agents", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateAgent(
  agentId: string,
  body: AgentWriteBody,
): Promise<AgentDetail> {
  return apiFetch<AgentDetail>(`/api/agents/${encodeURIComponent(agentId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteAgent(agentId: string): Promise<void> {
  await apiFetch<{ message: string }>(
    `/api/agents/${encodeURIComponent(agentId)}`,
    { method: "DELETE" },
  );
}

export async function fetchQualitySummary(
  days = 30,
): Promise<QualitySummary> {
  return apiFetch<QualitySummary>(`/api/quality/summary?days=${days}`);
}

export async function createQualityTask(
  body: CreateQualityTaskRequest,
): Promise<CreateQualityTaskResponse> {
  return apiFetch<CreateQualityTaskResponse>("/api/quality/tasks", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function runQualityTask(
  taskId: string,
): Promise<RunQualityTaskResponse> {
  return apiFetch<RunQualityTaskResponse>(
    `/api/quality/tasks/${encodeURIComponent(taskId)}/run`,
    { method: "POST" },
  );
}

export async function fetchScreeningSummary(
  days = 30,
): Promise<ScreeningSummary> {
  return apiFetch<ScreeningSummary>(`/api/observation/screening?days=${days}`);
}

export async function fetchGovernanceReviews(
  days = 30,
): Promise<GovernanceReview[]> {
  return apiFetch<GovernanceReview[]>(`/api/governance/reviews?days=${days}`);
}

export async function fetchGovernanceHistory(
  days = 30,
  limit = 200,
): Promise<GovernanceReview[]> {
  return apiFetch<GovernanceReview[]>(
    `/api/governance/history?days=${days}&limit=${limit}`,
  );
}

export async function fetchGovernancePerformance(
  days = 30,
): Promise<GovernancePerformance[]> {
  return apiFetch<GovernancePerformance[]>(
    `/api/governance/performance?days=${days}`,
  );
}

export async function decideGovernanceReview(
  taskId: string,
  decision: GovernanceDecideDecision,
): Promise<GovernanceDecideResult> {
  return apiFetch<GovernanceDecideResult>(
    `/api/governance/reviews/${encodeURIComponent(taskId)}/decide`,
    { method: "POST", body: JSON.stringify({ decision }) },
  );
}

export async function fetchGovernanceGaps(
  days = 30,
): Promise<GovernanceGapRow[]> {
  return apiFetch<GovernanceGapRow[]>(`/api/governance/gaps?days=${days}`);
}

export async function fetchGovernanceCoverage(
  days = 30,
): Promise<GovernanceCoverageRow[]> {
  return apiFetch<GovernanceCoverageRow[]>(
    `/api/governance/gaps/coverage?days=${days}`,
  );
}

export async function fetchGovernanceRules(): Promise<GovernanceRuleRow[]> {
  return apiFetch<GovernanceRuleRow[]>("/api/governance/rules");
}

export async function createGovernanceRule(body: {
  id: string;
  name: string;
  task_type: string;
  enforcement_action?: string;
  description?: string;
  reference_code?: string;
}): Promise<GovernanceRuleRow> {
  return apiFetch<GovernanceRuleRow>("/api/governance/rules", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function patchGovernanceRule(
  ruleId: string,
  body: {
    is_active?: boolean;
    name?: string;
    description?: string;
    enforcement_action?: string;
  },
): Promise<GovernanceRuleRow> {
  return apiFetch<GovernanceRuleRow>(
    `/api/governance/rules/${encodeURIComponent(ruleId)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export async function fetchGovernanceViolations(
  limit = 100,
): Promise<GovernanceViolationRow[]> {
  return apiFetch<GovernanceViolationRow[]>(
    `/api/governance/violations?limit=${limit}`,
  );
}

export async function fetchApiKeys(): Promise<ApiKeyRow[]> {
  return apiFetch<ApiKeyRow[]>("/api/admin/api-keys");
}

export async function createApiKey(
  label: string,
): Promise<ApiKeyCreateResponse> {
  return apiFetch<ApiKeyCreateResponse>("/api/admin/api-keys", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export async function revokeApiKey(keyId: number): Promise<void> {
  await apiFetch<{ success: boolean }>(
    `/api/admin/api-keys/${keyId}`,
    { method: "DELETE" },
  );
}

export async function fetchObservationRegistry(
  days = 30,
): Promise<ObservationRegistryRow[]> {
  return apiFetch<ObservationRegistryRow[]>(
    `/api/observation/registry?days=${days}`,
  );
}

export async function fetchOutreachSummary(
  days = 30,
): Promise<OutreachSummary> {
  return apiFetch<OutreachSummary>(`/api/observation/outreach?days=${days}`);
}

export async function fetchObservationSummary(
  days = 30,
  feedLimit = 30,
): Promise<ObservationSummary> {
  return apiFetch<ObservationSummary>(
    `/api/observation-plane/summary?days=${days}&feed_limit=${feedLimit}`,
  );
}

export async function fetchObservationCoverage(
  days = 30,
): Promise<ObservationCoverageRow[]> {
  return apiFetch<ObservationCoverageRow[]>(
    `/api/observation/coverage?days=${days}`,
  );
}

export async function fetchTaskScorecards(
  days = 7,
  group = "All",
): Promise<TaskScorecardsSummary> {
  const params = new URLSearchParams({
    days: String(days),
    group,
  });
  return apiFetch<TaskScorecardsSummary>(`/api/tasks/scorecards?${params}`);
}

export async function fetchPerformanceSummary(
  days = 7,
  granularity = "day",
): Promise<PerformanceSummary> {
  const params = new URLSearchParams({
    days: String(days),
    granularity,
  });
  return apiFetch<PerformanceSummary>(`/api/performance/summary?${params}`);
}

export async function fetchOverviewSummary(
  days = 7,
): Promise<OverviewSummary> {
  return apiFetch<OverviewSummary>(`/api/overview/summary?days=${days}`);
}

export async function fetchEconomicsSummary(
  days = 7,
  manualCost = 50,
): Promise<EconomicsSummary> {
  const params = new URLSearchParams({
    days: String(days),
    manual_cost: String(manualCost),
  });
  return apiFetch<EconomicsSummary>(`/api/economics/summary?${params}`);
}

export async function fetchTraceList(limit = 50): Promise<TraceListResponse> {
  return apiFetch<TraceListResponse>(`/api/traces?limit=${limit}`);
}

export async function fetchTraceDetail(traceId: string): Promise<TraceDetail> {
  return apiFetch<TraceDetail>(
    `/api/traces/${encodeURIComponent(traceId)}`,
  );
}

export async function fetchRunReviewSummary(): Promise<RunReviewSummary> {
  return apiFetch<RunReviewSummary>("/api/run-review/summary");
}

export async function fetchWorkflowStudio(
  workflowId: string,
): Promise<WorkflowStudio> {
  return apiFetch<WorkflowStudio>(
    `/api/run-review/workflows/${encodeURIComponent(workflowId)}`,
  );
}

export async function saveV2Tune(body: TuneRequest): Promise<{ message: string }> {
  return apiFetch<{ message: string }>("/v2/tune", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function runV2Rerun(
  inputText: string,
  workflowId: string,
): Promise<{ request_id: string }> {
  return apiFetch<{ request_id: string }>("/v2/rerun", {
    method: "POST",
    body: JSON.stringify({ input_text: inputText, workflow_id: workflowId }),
  });
}

export async function fetchPipelineStatus(
  requestId: string,
): Promise<PipelineStatus> {
  return apiFetch<PipelineStatus>(
    `/status/${encodeURIComponent(requestId)}`,
  );
}

export async function fetchScenarios(): Promise<ScenarioSummary[]> {
  return apiFetch<ScenarioSummary[]>("/api/scenarios");
}

export async function fetchScenario(
  scenarioId: string,
): Promise<ScenarioDetail> {
  return apiFetch<ScenarioDetail>(
    `/api/scenarios/${encodeURIComponent(scenarioId)}`,
  );
}

export async function createScenario(
  body: ScenarioWriteBody,
): Promise<ScenarioDetail> {
  return apiFetch<ScenarioDetail>("/api/scenarios", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateScenario(
  scenarioId: string,
  body: ScenarioWriteBody,
): Promise<ScenarioDetail> {
  return apiFetch<ScenarioDetail>(
    `/api/scenarios/${encodeURIComponent(scenarioId)}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export async function updateScenarioStatus(
  scenarioId: string,
  status: string,
): Promise<ScenarioDetail> {
  return apiFetch<ScenarioDetail>(
    `/api/scenarios/${encodeURIComponent(scenarioId)}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
}

export async function patchScenarioCost(
  scenarioId: string,
  body: ScenarioCostPatch,
): Promise<ScenarioDetail> {
  return apiFetch<ScenarioDetail>(
    `/api/scenarios/${encodeURIComponent(scenarioId)}/cost`,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  await apiFetch<{ message: string }>(
    `/api/scenarios/${encodeURIComponent(scenarioId)}`,
    { method: "DELETE" },
  );
}

export async function fetchDeployments(): Promise<DeploymentRow[]> {
  return apiFetch<DeploymentRow[]>("/api/deployments");
}

export async function fetchDeployment(
  deploymentId: string,
): Promise<DeploymentRow> {
  return apiFetch<DeploymentRow>(
    `/api/deployments/${encodeURIComponent(deploymentId)}`,
  );
}

export async function validateDeployment(
  codeLanguage: string,
  rawCode: string,
): Promise<DeploymentValidateResult> {
  return apiFetch<DeploymentValidateResult>("/api/deployments/validate", {
    method: "POST",
    body: JSON.stringify({ codeLanguage, rawCode }),
  });
}

export async function deployAgent(
  body: DeploymentCreateBody,
): Promise<DeploymentRow> {
  return apiFetch<DeploymentRow>("/api/deployments", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchUopLibraryAlias(): Promise<UopLibraryAliasEntry[]> {
  return apiFetch<UopLibraryAliasEntry[]>("/api/uop/library");
}
