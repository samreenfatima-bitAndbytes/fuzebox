export type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_at: string;
  username: string;
  role: string;
};

export type MeResponse = {
  username: string;
  role: string;
};

export type AgentRegistryItem = {
  agent_id: string;
  name: string;
  description: string;
  group: string;
  status: string;
  model_name: string;
  vendor: string;
  skills_count: number;
  permissions_count: number;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  trust_level: number;
  registered_at: string;
};

/** AEOS enriched GET /api/agents?enriched=1 */
export type AgentEnrichedRow = {
  agentId: string;
  name: string;
  model: string;
  hyperscaler: string;
  trustTier: string;
  status: string;
  vendor: string;
  createdAt: string;
  runs: number;
  avgWallMs: number;
  sigma: number;
  cuow: number | null;
  mer: number | null;
  abt: number | null;
  ctr: number | null;
  tv: number | null;
  costPerRun: number;
  success: number;
  p95Latency: number;
  trust_level?: number;
};

export type ObservationEventRow = {
  eventId: string;
  capturedAt: string;
  agentId: string;
  hyperscaler: string;
  model: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens: number;
  wallMs: number;
  passedThresholds: boolean;
  vendorCostUsd: number;
};

export type AgentDetail = AgentRegistryItem & {
  skills: string[];
  permissions: string[];
};

export type QualityKpis = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  completed_pct: number;
  failed_pct: number;
  time_saved_hours: number;
  avg_gsti: number;
};

export type QualityTaskRow = {
  agent: string;
  task: string;
  status: string;
  duration: string;
  time_saved_m: number;
  timestamp: string;
  quality_score: number;
  task_type: string;
  source_event_type: string;
  task_id?: string;
  can_run?: boolean;
};

export type QualitySummary = {
  days: number;
  kpis: QualityKpis;
  tasks: QualityTaskRow[];
};

export type CreateQualityTaskRequest = {
  agent_name: string;
  capability: string;
  message?: string;
  channel?: string;
  user_id?: string;
  team_id?: string;
  platform?: string;
};

export type CreateQualityTaskResponse = {
  task_id: string;
  status: string;
  message: string;
};

export type RunQualityTaskResponse = {
  task_id: string;
  request_id: string;
  status: string;
  message: string;
};

export type ScreeningHistogramBin = {
  bin: string;
  count: number;
};

export type ScreeningSkillRow = {
  skill: string;
  count: number;
};

export type ScreeningSummary = {
  histogram: ScreeningHistogramBin[];
  totalCandidates: number;
  hitlAwaiting: number;
  reviewerAlignment: number;
  skills: ScreeningSkillRow[];
};

export type GovernanceReview = {
  eventId: string;
  agentId: string;
  skill: string;
  confidence: number;
  humanReview: string;
  policyOutcome: string;
  trustTier: string;
  capturedAt: string;
  humanUserId: string;
  reviewerName: string;
};

export type GovernanceDecideDecision = "Advance" | "Reject" | "Hold";

export type GovernanceDecideResult = {
  review: GovernanceReview;
  decisionId: string;
  workflowId?: string | null;
  shouldResume: boolean;
};

export type GovernancePerformance = {
  name: string;
  reviewed: number;
  advanceRate: number;
  calibration: string;
};

export type GovernanceGapRow = {
  agentId: string;
  agentName: string;
  skill: string;
  trustTier: string;
  totalDecisions: number;
  autoRate: number;
  avgConfidence: number;
  riskLevel: string;
  hasRule: boolean;
};

export type GovernanceCoverageRow = {
  process: string;
  gates: number;
  decisionsPerWeek: number;
  gapCount: number;
};

export type GovernanceRuleRow = {
  id: string;
  name: string;
  description: string;
  taskType: string;
  enforcementAction: string;
  isActive: boolean;
  referenceCode?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GovernanceViolationRow = {
  eventId: string;
  capturedAt: string;
  agentId: string;
  skill: string;
  policyId?: string | null;
  policyOutcome?: string | null;
  passedThresholds: boolean;
  workflowId?: string | null;
  ruleName?: string | null;
  ruleDescription?: string | null;
  ruleTaskType?: string | null;
  ruleReferenceCode?: string | null;
};

export type ApiKeyRow = {
  id: number;
  label: string;
  keyPrefix: string;
  createdAt: string;
  revokedAt?: string | null;
};

export type ApiKeyCreateResponse = {
  key: string;
  label: string;
  id: number;
  keyPrefix: string;
};

export type ObservationRegistryRow = {
  agentId: string;
  name: string;
  model: string;
  trustTier: string;
  status: string;
  totalRuns: number;
  successRate: number;
  hoursSaved: number;
};

export type OutreachDraft = {
  id: string;
  candidateName: string;
  channel: string;
  messageText: string;
  personalizationScore: number;
  status: string;
  capturedAt: string;
  humanReview: string;
};

export type OutreachChannelMix = {
  LinkedIn: number;
  Email: number;
  Slack: number;
};

export type OutreachKpis = {
  draftsThisWeek: number;
  avgPersonalization: number;
  flaggedForReview: number;
  channelMix: OutreachChannelMix;
  replyRate: number;
  sentWithoutEdit: number;
};

export type OutreachSummary = {
  drafts: OutreachDraft[];
  kpis: OutreachKpis;
};

export type ObservationKpis = {
  total_events: number;
  active_surfaces: number;
  pass_rate_pct: number;
  passed_count: number;
  total_spend: number;
  total_saved: number;
  total_tokens: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  avg_tokens: number;
  avg_cost: number;
  human_review_queued: number;
};

export type VendorBreakdownRow = {
  vendor: string;
  events: number;
  mix_pct: number;
  input_tokens: number;
  output_tokens: number;
  tokens: number;
  avg_ms: number;
  spend: number;
  saved: number;
  mer: number;
  health: string;
};

export type LiveEventRow = {
  time: string;
  captured_at?: string;
  eventId?: string;
  agentId?: string;
  vendor: string;
  agent: string;
  model: string;
  event_id?: string;
  input_tokens?: number;
  output_tokens?: number;
  tokens: number;
  ms: number;
  cost: number;
  saved: number;
  status: string;
};

export type ScorecardRow = {
  agent: string;
  group: string;
  tasks: number;
  success_count: number;
  fail_count: number;
  success_rate: number;
  failure_rate: number;
  avg_quality: number;
  status: string;
  issues: string;
};

export type GroupEval = {
  group: string;
  agents: number;
  group_success_rate: number;
  agents_passing: number;
  passed: boolean;
};

export type AccuracyByTypeRow = {
  task_type: string;
  total: number;
  success: number;
  success_rate: number;
};

export type TaskScorecardsSummary = {
  days: number | null;
  time_range_label: string;
  groups: string[];
  selected_group: string;
  rows: ScorecardRow[];
  group_eval: GroupEval | null;
  accuracy_by_type: AccuracyByTypeRow[];
};

export type CompletionRateRow = {
  agent: string;
  group: string;
  total_tasks: number;
  successful: number;
  completion_rate: number;
};

export type LatencyAgentRow = {
  agent: string;
  mean_ms: number;
  p50_ms: number;
  p90_ms: number;
  p99_ms: number;
  tasks: number;
};

export type LatencyBin = {
  start_ms: number;
  end_ms: number;
  count: number;
};

export type LatencyHistogram = {
  stats: Record<string, number>;
  bins: LatencyBin[];
};

export type ThroughputPoint = {
  date: string;
  task_count: number;
  success_rate: number;
  avg_latency_ms: number;
};

export type LeaderboardRow = {
  rank: number;
  agent: string;
  group: string;
  model: string;
  tasks: number;
  success_rate: number;
  avg_quality: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  score: number;
};

export type RoiSummary = {
  total_tasks: number;
  successful_tasks: number;
  agent_total_cost: number;
  manual_equivalent_cost: number;
  savings: number;
  roi_pct: number;
  cost_per_successful_task: number;
};

export type CostByAgentRow = {
  agent: string;
  tasks: number;
  total_cost_usd: number;
  avg_cost_per_task_usd: number;
  input_tokens: number;
  output_tokens: number;
};

export type CostByTaskTypeRow = {
  task_type: string;
  count: number;
  total_cost_usd: number;
  avg_cost_usd: number;
  avg_tokens: number;
  avg_latency_ms: number;
};

export type CostTimeSeriesPoint = {
  date: string;
  total_cost_usd: number;
  cumulative_cost_usd: number;
  total_tokens: number;
  task_count: number;
};

export type TokenUsage = {
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  avg_tokens_per_task: number;
  avg_tokens_per_success: number;
  avg_tokens_per_failure: number;
  input_output_ratio: number;
  token_efficiency: number;
};

export type WorkflowEconomicsRow = {
  workflow: string;
  agents: number;
  tasks: number;
  result: string;
  cost_usd: number;
  duration_s: number;
  date: string;
};

export type EconomicsSummary = {
  days: number | null;
  time_range_label: string;
  manual_cost_per_task: number;
  roi: RoiSummary;
  cost_by_agent: CostByAgentRow[];
  cost_by_task_type: CostByTaskTypeRow[];
  cost_time_series: CostTimeSeriesPoint[];
  token_usage: TokenUsage;
  workflow_economics: WorkflowEconomicsRow[];
};

export type OverviewKpis = {
  total_tasks: number;
  successful_tasks: number;
  success_rate: number;
  total_cost: number;
  avg_cost_per_task: number;
  avg_latency_ms: number;
  p90_latency_ms: number;
  avg_quality: number;
  total_workflows: number;
  workflow_success_rate: number;
  active_agents: number;
};

export type OverviewSummary = {
  days: number | null;
  time_range_label: string;
  kpis: OverviewKpis;
  cost_time_series: CostTimeSeriesPoint[];
  throughput: ThroughputPoint[];
  leaderboard: LeaderboardRow[];
};

export type PerformanceSummary = {
  days: number | null;
  time_range_label: string;
  granularity: string;
  completion_rates: CompletionRateRow[];
  latency_by_agent: LatencyAgentRow[];
  latency_histogram: LatencyHistogram;
  throughput: ThroughputPoint[];
  leaderboard: LeaderboardRow[];
};

export type ObservationCoverageRow = {
  hyperscaler: string;
  surface: string;
  status: string;
  activatedAt?: string | null;
  lastTelemetryAt?: string | null;
  signedAt?: string | null;
  signature?: string | null;
};

export type ObservationSummary = {
  days: number;
  kpis: ObservationKpis;
  by_vendor: VendorBreakdownRow[];
  live_stream: LiveEventRow[];
  audit_hash: string;
  prev_event_hash?: string;
  latest_event_id?: string;
};

export type AgentMatrixRow = {
  agent: string;
  agent_id: string;
  cells: Record<string, boolean>;
};

export type AgentMatrix = {
  columns: string[];
  rows: AgentMatrixRow[];
};

export type AgentViolation = {
  agent: string;
  agent_id: string;
  task_id: string;
  task_type: string;
  result: string;
  missing_permissions: string[];
  missing_skills: string[];
};

export type AgentViolationsResponse = {
  violations: AgentViolation[];
  count: number;
};

export type AgentWriteBody = {
  name: string;
  description: string;
  group: string;
  model_name: string;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  skills: string[];
  permissions: string[];
  status: string;
};

export type TraceSpanRow = {
  span_id: string;
  parent_span_id: string | null;
  operation: string;
  label: string;
  agent_id: string;
  agent_name: string;
  duration_ms: number;
  start_offset_ms: number;
  status: string;
  depth: number;
  attributes_json: string;
};

export type TraceDetail = {
  trace_id: string;
  span_count: number;
  agent_count: number;
  root_duration_ms: number;
  error_count: number;
  timeline_max_ms: number;
  spans: TraceSpanRow[];
};

export type TraceListResponse = {
  trace_ids: string[];
};

export type AgentTelemetryRow = {
  agent_id: string;
  name: string;
  group: string;
  total: number;
  completion_rate: number;
  escalation_rate: number;
  accuracy: number;
  avg_latency_ms: number;
  avg_auop: number;
};

export type RunReviewRunRow = {
  workflow_id: string;
  started_at: string;
  started_label: string;
  result: string;
  outcome: string;
  escalated: boolean;
  input_text: string;
  preview: string;
  scenario_id: string | null;
  is_v2_tuned: boolean;
  pill_label: string;
};

export type RunReviewSummary = {
  runs: RunReviewRunRow[];
  telemetry: AgentTelemetryRow[];
};

export type TaskStepRow = {
  step_number: number | null;
  step_name: string;
  agent_id: string;
  result: string;
  latency_ms: number;
  total_tokens: number;
  cost_usd: number;
  escalation_flag: boolean;
  confidence_score?: number | null;
  priority?: number | null;
  auop_score?: number | null;
  agent_output?: unknown;
  agent_output_json: string;
};

export type TuneDefaults = {
  confidence_threshold: number;
  prompt_precision: string;
  sentiment_weight: number;
  data_prefetch: boolean;
  tone_variant: string;
  fallback_depth: number;
};

export type CompareStepRow = {
  step: number | null;
  step_name: string | null;
  agent_id: string;
  result: string;
  latency_ms: number | null;
  confidence_score?: number | null;
  escalation_flag: boolean;
};

export type ComparePayload = {
  status: string;
  escalated: boolean;
  escalation_reason?: string | null;
  total_cost_usd: number;
  steps: CompareStepRow[];
  from_db: boolean;
  ran_at?: string | null;
  workflow_id?: string | null;
};

export type RopScore = {
  scenario_id: string;
  rop: number;
  tuop: number;
  total?: number;
};

export type WorkflowStudio = {
  workflow_id: string;
  workflow_id_short: string;
  scenario_id: string | null;
  started_at: string;
  started_label: string;
  input_text: string;
  escalated: boolean;
  result: string;
  total_latency_ms: number;
  total_tokens: number;
  total_cost_usd: number;
  avg_confidence: number | null;
  steps_overview: TaskStepRow[];
  v1_steps: TaskStepRow[];
  v2_steps: TaskStepRow[];
  latest_v2_workflow_id: string | null;
  compare: ComparePayload | null;
  tune_defaults: TuneDefaults;
  tune_signals: {
    step1: {
      confidence: number | null;
      escalated: boolean;
      agent_telemetry: AgentTelemetryRow | null;
    };
    step2: {
      priority: number | null;
      agent_telemetry: AgentTelemetryRow | null;
    };
    step3: {
      agent_id: string | null;
      auop_score: number | null;
      agent_telemetry: AgentTelemetryRow | null;
    };
  };
  rop: { v1: RopScore; v2: RopScore };
};

export type TuneRequest = {
  confidence_threshold: number;
  sentiment_weight: number;
  tone_variant: string;
  prompt_precision: string;
  fallback_depth: number;
  data_prefetch: boolean;
};

export type PipelineStatusStep = {
  step: number | null;
  step_name: string | null;
  agent_id: string;
  result: string;
  latency_ms: number | null;
  confidence_score?: number | null;
  escalation_flag?: boolean;
};

export type PipelineStatus = {
  request_id: string;
  status: string;
  escalated: boolean;
  escalation_reason?: string | null;
  total_cost_usd: number;
  steps: PipelineStatusStep[];
};

export type ScenarioPipelineStep = {
  step_number: number;
  name: string;
  agent_id: string | null;
  task_type: string;
  expected_latency_ms: number;
  expected_quality: number;
  input_tokens: number;
  output_tokens: number;
};

export type ScenarioCost = {
  price_per_1k_input: number;
  price_per_1k_output: number;
  human_baseline_minutes: number;
  manual_hourly_cost_usd: number;
  manual_cost_per_task?: number;
  cost_center: string;
  ledger_account: string;
};

export type ScenarioTeam = {
  agent_ids: string[];
  roles: string[];
  permissions: string[];
  extra_permissions: string[];
};

export type ScenarioSummary = {
  scenario_id: string;
  name: string;
  description: string;
  status: string;
  step_count: number;
  agent_count: number;
  estimated_cost_usd: number;
  roi_multiplier: number;
  updated_at: string;
  updated_label: string;
};

export type ScenarioDetail = ScenarioSummary & {
  team: ScenarioTeam;
  pipeline: ScenarioPipelineStep[];
  cost: ScenarioCost;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ScenarioWriteBody = {
  name: string;
  description: string;
  status: string;
  team: {
    agent_ids: string[];
    extra_permissions: string[];
  };
  pipeline: ScenarioPipelineStep[];
  cost: ScenarioCost;
};

export type ScenarioCostPatch = {
  price_per_1k_input?: number;
  price_per_1k_output?: number;
  human_baseline_minutes?: number;
  manual_hourly_cost_usd?: number;
  cost_center?: string;
  ledger_account?: string;
};

export type WebhookSubmitResponse = {
  request_id: string;
  status: string;
  task_type: string;
  agent_name: string;
  workflow_id: string | null;
  message: string;
};

export type DependencyAgentRef = {
  agent_id: string;
  name: string;
};

export type DependencyFlowNode = {
  agent_id: string;
  name: string;
  model: string;
  sigma: number;
  sigma_label: string;
  sigma_tone: "healthy" | "watch" | "at-risk";
  closed_runs: number;
};

export type DependencyProcessChain = {
  process_id: string;
  process_label: string;
  title: string;
  avg_sigma: number;
  avg_sigma_label: string;
  nodes: DependencyFlowNode[];
  /** tasks | scenario | events */
  chain_source?: string;
};

export type DependencySharedResource = {
  resource_id: string;
  name: string;
  status: "healthy" | "stale" | string;
  detail: string;
  agents: DependencyAgentRef[];
};

export type DependencyRisk = {
  risk_id: string;
  severity: "high" | "medium" | "low" | string;
  title: string;
  blast_radius: string;
  agents: DependencyAgentRef[];
};

export type DependencyKpis = {
  process_chains: number;
  agents_wired: number;
  shared_resources: number;
  high_impact_risks: number;
};

export type AgentDependenciesSummary = {
  days: number;
  kpis: DependencyKpis;
  process_chains: DependencyProcessChain[];
  shared_resources: DependencySharedResource[];
  risks: DependencyRisk[];
};

export type CognitionCorrelation = {
  correlation_id: string;
  title: string;
  category: string;
  pattern_label: string;
  r: number;
  strength: "strong" | "weak" | string;
  direction: "positive" | "negative" | "neutral" | string;
  sample_size: number;
  effect_summary: string;
  insight: string;
  recommendation_template_id: string;
};

export type CognitionKpis = {
  total_correlations: number;
  strong_correlations: number;
  actionable_insights: number;
};

export type CognitionPlaneSummary = {
  days: number;
  time_range_label: string;
  event_count: number;
  updated_at: string;
  kpis: CognitionKpis;
  correlations: CognitionCorrelation[];
};

export type UopLibraryKpis = {
  published_uops: number;
  signed_and_chained: number;
  total_value_captured_usd: number;
  avg_rop: number;
  total_spend_usd: number;
  lifetime_reuses: number;
  ai_primary_count: number;
  hybrid_count: number;
  ai_assisted_count: number;
};

export type UopLibraryEntry = {
  uop_id: string;
  scenario_id: string;
  name: string;
  status: string;
  classification: string;
  trust_tier_label: string;
  trust_level: number;
  cognition_snapshot: string;
  rop: number;
  saved_usd: number;
  spend_usd: number;
  mer: number;
  cuow_usd: number;
  reuses: number;
  net_usd: number;
  h_share: number;
  a_share: number;
  s_share: number;
  kms_signature: string;
  kms_signature_short: string;
  published_at: string;
  published_ago_label: string;
  published_by: string;
  signed: boolean;
};

export type UopLibrarySummary = {
  updated_at: string;
  manual_cost_per_task: number;
  kpis: UopLibraryKpis;
  entries: UopLibraryEntry[];
};

export type DeploymentValidationStatus = "valid" | "warnings" | "errors";

export type DeploymentRow = {
  id: number;
  deploymentId: string;
  name: string;
  codeLanguage: "json" | "crewai" | "python";
  agentKind: string;
  classification: string;
  trustTier: string;
  ropTarget: number;
  recursiveDepth: number;
  reuseFromUop?: string | null;
  rawCode: string;
  manifestJson: string;
  uopInstructions: string;
  validationStatus: DeploymentValidationStatus;
  validationNotes?: string | null;
  status: string;
  signature: string;
  publishedAt: string;
  publishedBy: string;
  webhookUrl?: string | null;
};

export type DeploymentValidateResult = {
  agentKind: string;
  manifest: Record<string, unknown>;
  validationStatus: DeploymentValidationStatus;
  validationNotes: string;
};

export type DeploymentCreateBody = {
  name: string;
  codeLanguage: "json" | "crewai" | "python";
  rawCode: string;
  classification?: string;
  trustTier?: string;
  ropTarget?: number;
  recursiveDepth?: number;
  reuseFromUop?: string | null;
  webhookUrl?: string | null;
};

export type UopLibraryAliasEntry = {
  uopId: string;
  name: string;
  classification: string;
  ropValue: number;
  mer: number;
  trustTier: string;
};

export type Session = {
  token: string;
  username: string;
  role: string;
  expiresAt: string;
};
