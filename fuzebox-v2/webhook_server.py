"""Fuzebox Webhook Server."""

import json
import os
import sys
import time
import uuid
import threading
from datetime import datetime
from typing import Any, Optional
from pathlib import Path
import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator

sys.path.insert(0, str(Path(__file__).parent))

from src.dashboard import db
from src.dashboard.models import AgentStatus
from src.dashboard.tracing import init_tracing
from agents.base_agent import BaseAgent
from agents.triage_agent import TriageAgent
from agents.orchestrator import OrchestratorAgent
from agents.input_validation import (
    require_workflow_input_text,
    WORKFLOW_EMPTY_INPUT_CODE,
    WORKFLOW_EMPTY_INPUT_REASON,
)
from src.auth import (
    AuthContext,
    authenticate_user, create_access_token, require_auth, require_admin,
    require_operator, hash_password, ensure_admin_exists, register_org,
)
from src.dashboard.models import Agent, AgentStatus, ScenarioConfig, ScenarioStatus
from src.dashboard.quality import (
    build_quality_kpis,
    build_quality_task_rows,
    create_operator_task,
    operator_task_webhook_metadata,
    operator_task_webhook_text,
    resolve_agent_id,
)
from src.dashboard.screening import get_screening_summary
from src.dashboard.governance import (
    decide_governance_review,
    get_governance_performance,
    get_governance_reviews,
)
from src.dashboard.governance_plane import (
    build_gaps_coverage,
    build_governance_gaps,
    build_governance_violations,
)
from src.dashboard.observation_registry import get_observation_registry
from src.dashboard.observation_outreach import get_outreach_summary
from src.dashboard.observation_coverage import build_observation_coverage
from src.dashboard.observation_plane import (
    build_live_event_stream,
    build_observation_event_rows,
    build_observation_kpis,
    build_vendor_breakdown,
    latest_audit_chain,
    latest_audit_hash,
)
from src.dashboard.task_scorecards import (
    build_accuracy_by_type,
    build_group_eval,
    build_scorecard_rows,
    days_to_time_range_label,
    list_agent_groups,
)
from src.dashboard.performance_page import (
    build_completion_rates,
    build_latency_by_agent,
    build_latency_histogram,
    build_leaderboard,
    build_throughput,
)
from src.dashboard.economics_page import build_economics_summary
from src.dashboard.overview_page import build_overview_summary
from src.dashboard.traces_page import build_trace_detail, build_trace_id_list
from src.dashboard.run_review_page import (
    build_run_review_summary,
    build_workflow_studio,
)
from src.dashboard.agents_page import (
    build_agent_violations,
    build_permissions_matrix,
    build_skills_matrix,
)
from src.dashboard.agent_dependencies import build_agent_dependencies
from src.dashboard.agent_enrichment import build_enriched_agents
from src.dashboard.observation_dependencies import build_observation_dependency_chains
from src.dashboard.observation_events_list import build_observation_events
from src.dashboard.cognition_plane import build_cognition_plane_summary
from src.dashboard.uop_library import build_uop_library
from src.dashboard.deployments import (
    build_uop_instructions,
    deployment_signature,
    new_deployment_id,
    parse_agent_code,
    resolve_agent_id,
    trust_tier_to_level,
)
from src.dashboard.scenario_builder_page import (
    build_scenario_detail,
    build_scenario_library,
    patch_scenario_cost,
    scenario_detail,
    scenario_from_write_body,
)
import agents.intake_classifier as _intake_mod
import agents.triage_scorer     as _scorer_mod
from agents.workflow_resume import resume_workflow as _resume_workflow

_SPECIALIZED: dict[str, callable] = {
    _intake_mod.AGENT_ID: _intake_mod.create,
    _scorer_mod.AGENT_ID: _scorer_mod.create,
}


# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI(
    title       = "Fuzebox Webhook Server",
    description = "Receives requests from any source and routes them through the agent pipeline.",
    version     = "2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request, exc: RequestValidationError):
    """Return a clear rejection message (and reason code when input text is empty)."""
    messages: list[str] = []
    reason: Optional[str] = None
    for err in exc.errors():
        msg = str(err.get("msg", ""))
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, ") :]
        messages.append(msg)
        if msg == WORKFLOW_EMPTY_INPUT_REASON:
            reason = WORKFLOW_EMPTY_INPUT_CODE

    detail = messages[0] if len(messages) == 1 else "; ".join(messages)
    content: dict[str, str] = {"detail": detail}
    if reason:
        content["reason"] = reason
    return JSONResponse(status_code=422, content=content)

# ── Global agent pool (cross-tenant runtime) ───────────────────────────────────

_agent_pool: dict[str, BaseAgent] = {}
_pool_lock  = threading.Lock()
_triage     = TriageAgent()


# ── Request / response models ──────────────────────────────────────────────────

class TokenRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    expires_at:   str
    username:     str
    role:         str


class RegisterRequest(BaseModel):
    org_name:  str = Field(..., description="Name of the new organisation")
    username:  str = Field(..., description="Admin username for the new org")
    password:  str = Field(..., description="Admin password")


class WebhookRequest(BaseModel):
    text:        str           = Field(...,  description="The request text to process")
    source:      str           = Field("api", description="Origin of the request")
    customer_id: Optional[str] = Field(None, description="Optional customer identifier")
    scenario_id: Optional[str] = Field(None, description="Force a specific scenario")
    metadata:    dict          = Field(default_factory=dict)

    @field_validator("text")
    @classmethod
    def text_must_be_non_empty(cls, v: str) -> str:
        return require_workflow_input_text(v)


class WebhookResponse(BaseModel):
    request_id:  str
    status:      str
    task_type:   str
    agent_name:  str
    workflow_id: Optional[str] = None
    message:     str


class AgentRegistryResponse(BaseModel):
    """Dashboard agent registry row."""

    agent_id:            str
    name:                str
    description:         str
    group:               str
    status:              str
    model_name:          str
    vendor:              str
    skills_count:        int
    permissions_count:   int
    cost_per_1k_input:   float
    cost_per_1k_output:  float
    trust_level:         int
    registered_at:       str


class AgentDetailResponse(AgentRegistryResponse):
    skills:      list[str]
    permissions: list[str]


class AgentMatrixRow(BaseModel):
    agent:    str
    agent_id: str
    cells:    dict[str, bool]


class AgentMatrixResponse(BaseModel):
    columns: list[str]
    rows:    list[AgentMatrixRow]


class AgentViolationRow(BaseModel):
    agent:               str
    agent_id:            str
    task_id:             str
    task_type:           str
    result:              str
    missing_permissions: list[str]
    missing_skills:      list[str]


class AgentViolationsResponse(BaseModel):
    violations: list[AgentViolationRow]
    count:      int


class DependencyAgentRef(BaseModel):
    agent_id: str
    name:     str


class DependencyFlowNode(BaseModel):
    agent_id:    str
    name:        str
    model:       str
    sigma:       float
    sigma_label: str
    sigma_tone:  str
    closed_runs: int


class DependencyProcessChain(BaseModel):
    process_id:       str
    process_label:    str
    title:            str
    avg_sigma:        float
    avg_sigma_label:  str
    nodes:            list[DependencyFlowNode]
    chain_source:     str = "tasks"


class DependencySharedResource(BaseModel):
    resource_id: str
    name:        str
    status:      str
    detail:      str
    agents:      list[DependencyAgentRef]


class DependencyRisk(BaseModel):
    risk_id:       str
    severity:      str
    title:         str
    blast_radius:  str
    agents:        list[DependencyAgentRef]


class DependencyKpis(BaseModel):
    process_chains:      int
    agents_wired:        int
    shared_resources:    int
    high_impact_risks:   int


class AgentDependenciesResponse(BaseModel):
    days:             int
    kpis:             DependencyKpis
    process_chains:   list[DependencyProcessChain]
    shared_resources: list[DependencySharedResource]
    risks:            list[DependencyRisk]


class CognitionCorrelation(BaseModel):
    correlation_id:             str
    title:                      str
    category:                   str
    pattern_label:              str
    r:                          float
    strength:                   str
    direction:                  str
    sample_size:                int
    effect_summary:             str
    insight:                    str
    recommendation_template_id: str


class CognitionKpis(BaseModel):
    total_correlations:   int
    strong_correlations:  int
    actionable_insights:  int


class CognitionPlaneResponse(BaseModel):
    days:              int
    time_range_label:  str
    event_count:       int
    updated_at:        str
    kpis:              CognitionKpis
    correlations:      list[CognitionCorrelation]


class UopLibraryKpis(BaseModel):
    published_uops:           int
    signed_and_chained:       int
    total_value_captured_usd: float
    avg_rop:                  float
    total_spend_usd:          float
    lifetime_reuses:          int
    ai_primary_count:         int
    hybrid_count:             int
    ai_assisted_count:        int


class UopLibraryEntry(BaseModel):
    uop_id:                str
    scenario_id:           str
    name:                  str
    status:                str
    classification:        str
    trust_tier_label:      str
    trust_level:           int
    cognition_snapshot:    str
    rop:                   float
    saved_usd:             float
    spend_usd:             float
    mer:                   float
    cuow_usd:              float
    reuses:                int
    net_usd:               float
    h_share:               float
    a_share:               float
    s_share:               float
    kms_signature:         str
    kms_signature_short:   str
    published_at:          str
    published_ago_label:   str
    published_by:          str
    signed:                bool


class UopLibraryResponse(BaseModel):
    updated_at:             str
    manual_cost_per_task:   float
    kpis:                   UopLibraryKpis
    entries:                list[UopLibraryEntry]


class AgentWriteBody(BaseModel):
    name:               str
    description:        str = ""
    group:              str = "general"
    model_name:         str = "claude-haiku-4-5-20251001"
    cost_per_1k_input:  float = 0.0008
    cost_per_1k_output: float = 0.004
    skills:             list[str] = Field(default_factory=list)
    permissions:        list[str] = Field(default_factory=list)
    status:             str = "active"


def _agent_registry_item(a: Agent) -> AgentRegistryResponse:
    return AgentRegistryResponse(
        agent_id           = a.agent_id,
        name               = a.name,
        description        = a.description,
        group              = a.group,
        status             = a.status.value,
        model_name         = a.model_name,
        vendor             = a.vendor or "anthropic",
        skills_count       = len(a.skills),
        permissions_count  = len(a.permissions),
        cost_per_1k_input  = a.cost_per_1k_input,
        cost_per_1k_output = a.cost_per_1k_output,
        trust_level        = a.trust_level,
        registered_at      = a.registered_at.isoformat(),
    )


def _agent_detail(a: Agent) -> AgentDetailResponse:
    base = _agent_registry_item(a)
    return AgentDetailResponse(
        **base.model_dump(),
        skills      = a.skills,
        permissions = a.permissions,
    )


def _parse_agent_status(value: str) -> AgentStatus:
    try:
        return AgentStatus(value.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {value}")


class MeResponse(BaseModel):
    username: str
    role:     str


class TenantConfigResponse(BaseModel):
    deploymentHealthUrl: Optional[str] = None


class DeploymentHealthUrlRequest(BaseModel):
    deploymentHealthUrl: Optional[str] = None


class QualityKpisResponse(BaseModel):
    total:            int
    completed:        int
    failed:           int
    running:          int
    completed_pct:    float
    failed_pct:       float
    time_saved_hours: float
    avg_gsti:         float


class QualityTaskRow(BaseModel):
    agent:             str
    task:              str
    status:            str
    duration:          str
    time_saved_m:      int
    timestamp:         str
    quality_score:     float
    task_type:         str
    source_event_type: str = ""
    task_id:           str = ""
    can_run:           bool = False


class QualitySummaryResponse(BaseModel):
    days:  int
    kpis:  QualityKpisResponse
    tasks: list[QualityTaskRow]


class CreateQualityTaskRequest(BaseModel):
    agent_name:  str = Field(..., min_length=1)
    capability:  str = Field(..., min_length=1)
    message:     str = ""
    channel:     str = ""
    user_id:     str = ""
    team_id:     str = ""
    platform:    str = ""


class CreateQualityTaskResponse(BaseModel):
    task_id: str
    status:  str
    message: str


class RunQualityTaskResponse(BaseModel):
    task_id:    str
    request_id: str
    status:     str
    message:    str


class ScreeningHistogramBin(BaseModel):
    bin:   str
    count: int


class ScreeningSkillRow(BaseModel):
    skill: str
    count: int


class ScreeningSummaryResponse(BaseModel):
    """Matches ECL GET /api/observation/screening (camelCase)."""
    histogram:           list[ScreeningHistogramBin]
    totalCandidates:     int
    hitlAwaiting:        int
    reviewerAlignment:   float
    skills:              list[ScreeningSkillRow]


class GovernanceReviewResponse(BaseModel):
    """Matches ECL GET /api/governance/reviews."""
    eventId:        str
    agentId:        str
    skill:          str
    confidence:     float
    humanReview:    str
    policyOutcome:  str
    trustTier:      str
    capturedAt:     str
    humanUserId:    str
    reviewerName:   str


class GovernancePerformanceResponse(BaseModel):
    """Matches ECL GET /api/governance/performance."""
    name:          str
    reviewed:      int
    advanceRate:   float
    calibration:   str


class GovernanceDecideBody(BaseModel):
    decision: str


class GovernanceDecideResponse(BaseModel):
    review:       GovernanceReviewResponse
    decisionId:   str
    workflowId:   Optional[str] = None
    shouldResume: bool = False


class GovernanceGapRow(BaseModel):
    agentId:         str
    agentName:       str
    skill:           str
    trustTier:       str
    totalDecisions:  int
    autoRate:        float
    avgConfidence:   float
    riskLevel:       str
    hasRule:         bool


class GovernanceCoverageRow(BaseModel):
    process:            str
    gates:              int
    decisionsPerWeek:   int
    gapCount:           int


class GovernanceRuleRow(BaseModel):
    id:                 str
    name:               str
    description:        str = ""
    taskType:           str
    enforcementAction:  str
    isActive:           bool
    referenceCode:      Optional[str] = None
    createdAt:          str
    updatedAt:          str


class GovernanceRuleCreateBody(BaseModel):
    id:                  str
    name:                str
    description:         str = ""
    task_type:           str
    enforcement_action:  str = "WARN"
    reference_code:      Optional[str] = None


class GovernanceRulePatchBody(BaseModel):
    is_active:          Optional[bool] = None
    name:               Optional[str] = None
    description:        Optional[str] = None
    enforcement_action: Optional[str] = None


class GovernanceViolationRow(BaseModel):
    eventId:             str
    capturedAt:          str
    agentId:             str
    skill:               str
    policyId:            Optional[str] = None
    policyOutcome:       Optional[str] = None
    passedThresholds:    bool
    workflowId:          Optional[str] = None
    ruleName:            Optional[str] = None
    ruleDescription:     Optional[str] = None
    ruleTaskType:        Optional[str] = None
    ruleReferenceCode:   Optional[str] = None


class ApiKeyRow(BaseModel):
    id:         int
    label:      str
    keyPrefix:  str
    createdAt:  str
    revokedAt:  Optional[str] = None


class ApiKeyCreateBody(BaseModel):
    label: str


class ApiKeyCreateResponse(BaseModel):
    key:   str
    label: str
    id:    int
    keyPrefix: str


class ObservationRegistryRowResponse(BaseModel):
    """Matches ECL GET /api/observation/registry."""
    agentId:      str
    name:         str
    model:        str
    trustTier:    str
    status:       str
    totalRuns:    int
    successRate:  float
    hoursSaved:   float


class OutreachDraftResponse(BaseModel):
    """Matches ECL outreach draft row."""
    id:                   str
    candidateName:        str
    channel:              str
    messageText:          str
    personalizationScore: float
    status:               str
    capturedAt:           str
    humanReview:          str


class OutreachChannelMixResponse(BaseModel):
    LinkedIn: float = 0
    Email:    float = 0
    Slack:    float = 0


class OutreachKpisResponse(BaseModel):
    draftsThisWeek:     int
    avgPersonalization: float
    flaggedForReview:   int
    channelMix:         OutreachChannelMixResponse
    replyRate:          float = 0
    sentWithoutEdit:    float = 0


class OutreachSummaryResponse(BaseModel):
    drafts: list[OutreachDraftResponse]
    kpis:   OutreachKpisResponse


class ObservationKpisResponse(BaseModel):
    total_events:        int
    active_surfaces:     int
    pass_rate_pct:       float
    passed_count:        int
    total_spend:         float
    total_saved:         float
    total_tokens:        int = 0
    avg_latency_ms:      float
    p50_latency_ms:      float = 0.0
    avg_tokens:          float
    avg_cost:            float
    human_review_queued: int


class VendorBreakdownRow(BaseModel):
    vendor:        str
    events:        int
    mix_pct:       float
    input_tokens:  int = 0
    output_tokens: int = 0
    tokens:        int
    avg_ms:        float
    spend:   float
    saved:   float
    mer:     float
    health:  str


class LiveEventRow(BaseModel):
    time:          str
    captured_at:   str = ""
    event_id:      str = ""
    vendor:        str
    agent:         str
    model:         str
    input_tokens:  int = 0
    output_tokens: int = 0
    tokens:        int
    ms:           int
    cost:         float
    saved:        float
    status:       str


class ObservationCoverageRow(BaseModel):
    hyperscaler:       str
    surface:           str
    status:            str
    activatedAt:       Optional[str] = None
    lastTelemetryAt:   Optional[str] = None
    signedAt:          Optional[str] = None
    signature:         Optional[str] = None


class ObservationCoverageUpsertBody(BaseModel):
    hyperscaler:       str
    surface:           str
    status:            str
    activatedAt:       Optional[str] = None
    lastTelemetryAt:   Optional[str] = None


class DeploymentValidateBody(BaseModel):
    codeLanguage: str
    rawCode:      str


class DeploymentValidateResponse(BaseModel):
    agentKind:          str
    manifest:           dict[str, Any]
    validationStatus:   str
    validationNotes:    str


class DeploymentRowResponse(BaseModel):
    id:                 int
    deploymentId:       str
    name:               str
    codeLanguage:       str
    agentKind:          str
    classification:     str
    trustTier:          str
    ropTarget:          float
    recursiveDepth:     int
    reuseFromUop:       Optional[str] = None
    rawCode:            str
    manifestJson:       str
    uopInstructions:    str
    validationStatus:   str
    validationNotes:    Optional[str] = None
    status:             str
    signature:          str
    publishedAt:        str
    publishedBy:        str
    webhookUrl:         Optional[str] = None


class DeploymentCreateBody(BaseModel):
    name:               str
    codeLanguage:       str
    rawCode:            str
    classification:     str = "AI-Primary"
    trustTier:          str = "T0_unverified"
    ropTarget:          float = 3.0
    recursiveDepth:     int = 2
    reuseFromUop:       Optional[str] = None
    publishedBy:        Optional[str] = None
    webhookUrl:         Optional[str] = None
    webhookSecret:      Optional[str] = None


class UopLibraryAliasEntry(BaseModel):
    uopId:          str
    name:           str
    classification: str
    ropValue:       float
    mer:            float
    trustTier:      str


class ObservationSummaryResponse(BaseModel):
    days:              int
    kpis:              ObservationKpisResponse
    by_vendor:         list[VendorBreakdownRow]
    live_stream:       list[LiveEventRow]
    audit_hash:        str
    prev_event_hash:   str = ""
    latest_event_id:   str = ""


class ScorecardRowResponse(BaseModel):
    agent:         str
    group:         str
    tasks:         int
    success_count: int = 0
    fail_count:    int = 0
    success_rate:  float
    failure_rate:  float
    avg_quality:   float
    status:        str
    issues:        str


class GroupEvalResponse(BaseModel):
    group:               str
    agents:              int
    group_success_rate:  float
    agents_passing:      int
    passed:              bool


class AccuracyByTypeRow(BaseModel):
    task_type:     str
    total:         int
    success:       int
    success_rate:  float


class TaskScorecardsResponse(BaseModel):
    days:               Optional[int]
    time_range_label:   str
    groups:             list[str]
    selected_group:     str
    rows:               list[ScorecardRowResponse]
    group_eval:         Optional[GroupEvalResponse] = None
    accuracy_by_type:   list[AccuracyByTypeRow] = Field(default_factory=list)


class CompletionRateRow(BaseModel):
    agent:           str
    group:           str
    total_tasks:     int
    successful:      int
    completion_rate: float


class LatencyAgentRow(BaseModel):
    agent:   str
    mean_ms: float
    p50_ms:  float
    p90_ms:  float
    p99_ms:  float
    tasks:   int


class LatencyBinRow(BaseModel):
    start_ms: float
    end_ms:   float
    count:    int


class LatencyHistogram(BaseModel):
    stats: dict = Field(default_factory=dict)
    bins:  list[LatencyBinRow] = Field(default_factory=list)


class ThroughputPoint(BaseModel):
    date:             str
    task_count:       int
    success_rate:     float
    avg_latency_ms:   float


class LeaderboardRow(BaseModel):
    rank:             int
    agent:            str
    group:            str
    model:            str
    tasks:            int
    success_rate:     float
    avg_quality:      float
    avg_latency_ms:   float
    total_cost_usd:   float
    score:            float


class PerformanceSummaryResponse(BaseModel):
    days:             Optional[int]
    time_range_label: str
    granularity:      str
    completion_rates: list[CompletionRateRow]
    latency_by_agent: list[LatencyAgentRow]
    latency_histogram: LatencyHistogram
    throughput:       list[ThroughputPoint]
    leaderboard:      list[LeaderboardRow]


class RoiSummaryResponse(BaseModel):
    total_tasks:            int = 0
    successful_tasks:       int = 0
    agent_total_cost:       float = 0
    manual_equivalent_cost: float = 0
    savings:                float = 0
    roi_pct:                float = 0
    cost_per_successful_task: float = 0


class CostByAgentRow(BaseModel):
    agent:                str
    tasks:                int
    total_cost_usd:       float
    avg_cost_per_task_usd: float
    input_tokens:         int
    output_tokens:        int


class CostByTaskTypeRow(BaseModel):
    task_type:      str
    count:          int
    total_cost_usd: float
    avg_cost_usd:   float
    avg_tokens:     int
    avg_latency_ms: float


class CostTimeSeriesPoint(BaseModel):
    date:                str
    total_cost_usd:      float
    cumulative_cost_usd: float
    total_tokens:        int
    task_count:          int


class TokenUsageResponse(BaseModel):
    total_input_tokens:     int = 0
    total_output_tokens:    int = 0
    total_tokens:           int = 0
    avg_tokens_per_task:    int = 0
    avg_tokens_per_success: int = 0
    avg_tokens_per_failure: int = 0
    input_output_ratio:     float = 0
    token_efficiency:       float = 0


class WorkflowEconomicsRow(BaseModel):
    workflow:   str
    agents:     int
    tasks:      int
    result:     str
    cost_usd:   float
    duration_s: float
    date:       str


class EconomicsSummaryResponse(BaseModel):
    days:                  Optional[int]
    time_range_label:      str
    manual_cost_per_task:  float
    roi:                   RoiSummaryResponse
    cost_by_agent:         list[CostByAgentRow]
    cost_by_task_type:     list[CostByTaskTypeRow]
    cost_time_series:      list[CostTimeSeriesPoint]
    token_usage:           TokenUsageResponse
    workflow_economics:    list[WorkflowEconomicsRow]


class OverviewKpisResponse(BaseModel):
    total_tasks:            int = 0
    successful_tasks:       int = 0
    success_rate:           float = 0
    total_cost:             float = 0
    avg_cost_per_task:      float = 0
    avg_latency_ms:         float = 0
    p90_latency_ms:         float = 0
    avg_quality:            float = 0
    total_workflows:        int = 0
    workflow_success_rate:  float = 0
    active_agents:          int = 0


class OverviewSummaryResponse(BaseModel):
    days:               Optional[int]
    time_range_label:   str
    kpis:               OverviewKpisResponse
    cost_time_series:   list[CostTimeSeriesPoint]
    throughput:         list[ThroughputPoint]
    leaderboard:        list[LeaderboardRow]


class TraceSpanRow(BaseModel):
    span_id:          str
    parent_span_id:   Optional[str] = None
    operation:        str
    label:            str
    agent_id:         str
    agent_name:       str
    duration_ms:      float
    start_offset_ms:  float
    status:           str
    depth:            int
    attributes_json:  str = ""


class TraceDetailResponse(BaseModel):
    trace_id:          str
    span_count:        int
    agent_count:       int
    root_duration_ms:  float
    error_count:       int
    timeline_max_ms:   float
    spans:             list[TraceSpanRow]


class TraceListResponse(BaseModel):
    trace_ids: list[str]


class AgentTelemetryRow(BaseModel):
    agent_id:          str
    name:              str
    group:             str
    total:             int
    completion_rate:   float
    escalation_rate:   float
    accuracy:          float
    avg_latency_ms:    float
    avg_auop:          float


class RunReviewRunRow(BaseModel):
    workflow_id:   str
    started_at:    str
    started_label: str
    result:        str
    outcome:       str
    escalated:     bool
    input_text:    str
    preview:       str
    scenario_id:   Optional[str] = None
    is_v2_tuned:   bool
    pill_label:    str


class TaskStepRowResponse(BaseModel):
    step_number:        Optional[int] = None
    step_name:          str
    agent_id:           str
    result:             str
    latency_ms:         int
    total_tokens:       int
    cost_usd:           float
    escalation_flag:    bool = False
    confidence_score:   Optional[float] = None
    priority:           Optional[int] = None
    auop_score:         Optional[float] = None
    agent_output:       Optional[Any] = None
    agent_output_json:  str = ""


class TuneDefaultsResponse(BaseModel):
    confidence_threshold: float
    prompt_precision:     str
    sentiment_weight:     float
    data_prefetch:        bool
    tone_variant:         str
    fallback_depth:       int


class AgentTelemetrySnippet(BaseModel):
    agent_id:          str
    name:              str
    group:             str
    total:             int
    completion_rate:   float
    escalation_rate:   float
    accuracy:          float
    avg_latency_ms:    float
    avg_auop:          float


class TuneStepSignals(BaseModel):
    confidence:        Optional[float] = None
    escalated:         Optional[bool] = None
    priority:          Optional[int] = None
    agent_id:          Optional[str] = None
    auop_score:        Optional[float] = None
    agent_telemetry:   Optional[AgentTelemetrySnippet] = None


class CompareStepRow(BaseModel):
    step:               Optional[int] = None
    step_name:          Optional[str] = None
    agent_id:           str
    result:             str
    latency_ms:         Optional[float] = None
    confidence_score:   Optional[float] = None
    escalation_flag:    bool = False


class ComparePayloadResponse(BaseModel):
    status:              str
    escalated:           bool
    escalation_reason:   Optional[str] = None
    total_cost_usd:      float
    steps:               list[CompareStepRow]
    from_db:             bool = True
    ran_at:              Optional[str] = None
    workflow_id:         Optional[str] = None


class RopScoreResponse(BaseModel):
    scenario_id:   str
    rop:           float
    tuop:          float
    total:         int = 0


class WorkflowStudioResponse(BaseModel):
    workflow_id:            str
    workflow_id_short:      str
    scenario_id:            Optional[str] = None
    started_at:             str
    started_label:          str
    input_text:             str
    escalated:              bool
    result:                 str
    total_latency_ms:       float
    total_tokens:           int
    total_cost_usd:         float
    avg_confidence:         Optional[float] = None
    steps_overview:         list[TaskStepRowResponse]
    v1_steps:               list[TaskStepRowResponse]
    v2_steps:               list[TaskStepRowResponse]
    latest_v2_workflow_id:  Optional[str] = None
    compare:                Optional[ComparePayloadResponse] = None
    tune_defaults:          TuneDefaultsResponse
    tune_signals:           dict
    rop:                    dict


class RunReviewSummaryResponse(BaseModel):
    runs:      list[RunReviewRunRow]
    telemetry: list[AgentTelemetryRow]


class PipelineStepBody(BaseModel):
    step_number:         int
    name:                str
    agent_id:            Optional[str] = None
    task_type:           str = "general_inquiry"
    expected_latency_ms: float = 5000.0
    expected_quality:    float = 0.85
    input_tokens:        int = 1000
    output_tokens:       int = 500


class ScenarioTeamBody(BaseModel):
    agent_ids:           list[str] = Field(default_factory=list)
    extra_permissions:   list[str] = Field(default_factory=list)


class ScenarioCostBody(BaseModel):
    price_per_1k_input:       float = 0.0008
    price_per_1k_output:      float = 0.004
    human_baseline_minutes:   float = 60.0
    manual_hourly_cost_usd:   float = 75.0
    cost_center:              str = ""
    ledger_account:           str = ""


class ScenarioWriteBody(BaseModel):
    name:        str
    description: str = ""
    status:      str = "draft"
    team:        ScenarioTeamBody = Field(default_factory=ScenarioTeamBody)
    pipeline:    list[PipelineStepBody] = Field(default_factory=list)
    cost:        ScenarioCostBody = Field(default_factory=ScenarioCostBody)


class ScenarioCostPatchBody(BaseModel):
    price_per_1k_input:     Optional[float] = None
    price_per_1k_output:    Optional[float] = None
    human_baseline_minutes: Optional[float] = None
    manual_hourly_cost_usd: Optional[float] = None
    cost_center:            Optional[str] = None
    ledger_account:         Optional[str] = None


class ScenarioStatusBody(BaseModel):
    status: str


class ScenarioSummaryResponse(BaseModel):
    scenario_id:         str
    name:                str
    description:         str
    status:              str
    step_count:          int
    agent_count:         int
    estimated_cost_usd:  float
    roi_multiplier:      float
    updated_at:          str
    updated_label:       str


class ScenarioTeamResponse(BaseModel):
    agent_ids:           list[str]
    roles:               list[str]
    permissions:         list[str]
    extra_permissions:   list[str]


class ScenarioDetailResponse(ScenarioSummaryResponse):
    team:       ScenarioTeamResponse
    pipeline:   list[PipelineStepBody]
    cost:       ScenarioCostBody
    metadata:   dict = Field(default_factory=dict)
    created_at: str


class HealthResponse(BaseModel):
    status:           str
    active_agents:    int
    active_scenarios: int
    timestamp:        str


# ── Agent pool helpers ─────────────────────────────────────────────────────────

def _build_system_prompt(agent) -> str:
    skills = ", ".join(agent.skills) if agent.skills else "general support"
    perms  = ", ".join(agent.permissions) if agent.permissions else "standard access"

    if agent.group in ("drafters", "senior"):
        return (
            f"You are {agent.name}, a Response Drafter specialising in: {skills}.\n\n"
            f"You receive a JSON block from the Triage Scorer containing a classified "
            f"and prioritised customer service request. Your job is to draft the FIRST "
            f"reply to send to the customer.\n\n"
            f"Rules:\n"
            f"- Do NOT attempt to solve or resolve the issue — draft only the opening response\n"
            f"- Acknowledge the customer's concern warmly and professionally\n"
            f"- State that the right team is reviewing it and will follow up shortly\n"
            f"- Keep the draft under 80 words\n\n"
            f"Output ONLY a valid JSON object — no explanation, no markdown, no extra text.\n\n"
            f"JSON schema:\n"
            f'{{"draft_response": "<first reply to send>", "sentiment_flag": "<positive|neutral|negative>"}}\n\n'
            f"sentiment_flag: positive = calm/polite, neutral = factual, negative = frustrated/angry/threatening"
        )

    return (
        f"You are {agent.name}, a specialist in: {skills}. "
        f"Your available permissions are: {perms}. "
        f"Respond professionally and concisely. "
        f"If the request is outside your expertise, say so clearly."
    )


def refresh_agent_pool() -> dict[str, BaseAgent]:
    """Load all active agents into the shared process pool."""
    with _pool_lock:
        db_agents = db.get_all_agents()
        active    = [a for a in db_agents if a.status == AgentStatus.ACTIVE]

        for agent in active:
            if agent.agent_id not in _agent_pool:
                if agent.agent_id in _SPECIALIZED:
                    instance = _SPECIALIZED[agent.agent_id]()
                else:
                    instance = BaseAgent(
                        agent_id      = agent.agent_id,
                        name          = agent.name,
                        system_prompt = _build_system_prompt(agent),
                        task_types    = agent.skills,
                    )
                _agent_pool[agent.agent_id] = instance
                print(f"  [Pool] Started: {agent.name}")

        active_ids = {a.agent_id for a in active}
        for aid in list(_agent_pool.keys()):
            if aid not in active_ids:
                del _agent_pool[aid]
                print(f"  [Pool] Removed: {aid}")

        return dict(_agent_pool)



# ── Startup ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def on_startup():
    last_err: Exception | None = None
    for attempt in range(10):
        try:
            db.init_db()
            break
        except Exception as exc:
            last_err = exc
            if attempt < 9:
                time.sleep(2)
    else:
        raise last_err  # type: ignore[misc]
    init_tracing()
    ensure_admin_exists()
    pool = refresh_agent_pool()
    print(f"\n  Fuzebox Webhook Server ready — {len(pool)} agent(s) loaded.")
    print("  POST http://localhost:8000/webhook  to send requests.\n")


# ── Auth endpoints ─────────────────────────────────────────────────────────────

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str


@app.post("/auth/token", response_model=TokenResponse, tags=["Auth"])
def login(body: TokenRequest):
    """Exchange username + password for a JWT Bearer token."""
    user = authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    token, expires_at = create_access_token(body.username, user.role.value)
    return TokenResponse(
        access_token = token,
        expires_at   = expires_at.isoformat(),
        username     = user.username,
        role         = user.role.value,
    )


@app.post("/auth/register", response_model=TokenResponse, tags=["Auth"], status_code=201)
def register(body: RegisterRequest):
    """
    Create a new organisation and its first admin user.

    Returns a JWT token so the caller is immediately authenticated.
    """
    if not body.org_name.strip():
        raise HTTPException(status_code=400, detail="org_name cannot be empty.")
    if not body.username.strip():
        raise HTTPException(status_code=400, detail="username cannot be empty.")
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="password must be at least 8 characters.")

    try:
        ctx, token, expires_at = register_org(body.org_name, body.username, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return TokenResponse(
        access_token = token,
        expires_at   = expires_at.isoformat(),
        username     = ctx.username,
        role         = ctx.role,
    )


@app.post("/auth/change-password", tags=["Auth"])
def change_password(
    body: ChangePasswordRequest,
    auth: AuthContext = Depends(require_auth),
):
    """Any authenticated user can change their own password."""
    user = db.get_user_by_username(auth.username)
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    db.update_user_password(user.user_id, hash_password(body.new_password))
    return {"message": "Password updated successfully."}


@app.get("/api/auth/me", response_model=MeResponse, tags=["Dashboard"])
def auth_me(auth: AuthContext = Depends(require_auth)):
    """Return the authenticated user (for Next.js session checks)."""
    return MeResponse(username=auth.username, role=auth.role)


@app.get("/api/tenant", response_model=TenantConfigResponse, tags=["Dashboard"])
def get_tenant_config(auth: AuthContext = Depends(require_auth)):
    """Deployment health URL for Live Monitor (aligned with AEOS /api/tenant)."""
    return TenantConfigResponse(deploymentHealthUrl=db.get_deployment_health_url())


@app.patch(
    "/api/tenant/deployment-health-url",
    response_model=TenantConfigResponse,
    tags=["Dashboard"],
)
def patch_deployment_health_url(
    body: DeploymentHealthUrlRequest,
    auth: AuthContext = Depends(require_operator),
):
    """Save or clear the deployment health endpoint (operator+)."""
    url = (body.deploymentHealthUrl or "").strip() or None
    db.set_deployment_health_url(url)
    return TenantConfigResponse(deploymentHealthUrl=db.get_deployment_health_url())


# ── System endpoints ───────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    """Public — returns server status. No auth required."""
    pool      = refresh_agent_pool()
    scenarios = db.get_all_scenarios(status="active")
    return HealthResponse(
        status            = "ok",
        active_agents     = len(pool),
        active_scenarios  = len(scenarios),
        timestamp         = datetime.utcnow().isoformat(),
    )


class ObservationEventResponse(BaseModel):
    """AEOS GET /api/observation/events row."""
    eventId:           str
    capturedAt:        str
    agentId:           str
    hyperscaler:       str
    model:             Optional[str] = None
    inputTokens:       int = 0
    outputTokens:      int = 0
    totalTokens:       int = 0
    wallMs:            int = 0
    passedThresholds:  bool = True
    vendorCostUsd:     float = 0.0


@app.get("/api/agents", tags=["Dashboard"])
def list_registry_agents(
    enriched: bool = False,
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Agent registry; ?enriched=1 returns AEOS-shaped metrics (runs, sigma, cuow, mer, …)."""
    if enriched:
        days = max(1, min(days, 365))
        return build_enriched_agents(days)
    return [_agent_registry_item(a) for a in db.get_all_agents()]


@app.get(
    "/api/observation/events",
    response_model=list[ObservationEventResponse],
    tags=["Dashboard"],
)
def get_observation_events_api(
    days: int = 30,
    limit: int = 200,
    auth: AuthContext = Depends(require_auth),
):
    """Canonical event ledger (AEOS observation/events shape)."""
    days = max(1, min(days, 365))
    limit = max(1, min(limit, 2000))
    return [ObservationEventResponse(**row) for row in build_observation_events(days, limit)]


@app.get("/api/agents/dependencies", response_model=AgentDependenciesResponse, tags=["Dashboard"])
def get_agent_dependencies_api(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Agent dependency map: process chains, shared resources, cascade risks."""
    days = max(1, min(days, 365))
    raw = build_agent_dependencies(days=days)
    return AgentDependenciesResponse(
        days=raw["days"],
        kpis=DependencyKpis(**raw["kpis"]),
        process_chains=[DependencyProcessChain(**c) for c in raw["process_chains"]],
        shared_resources=[DependencySharedResource(**r) for r in raw["shared_resources"]],
        risks=[DependencyRisk(**r) for r in raw["risks"]],
    )


@app.get(
    "/api/observation/dependencies",
    response_model=list[DependencyProcessChain],
    tags=["Dashboard"],
)
def get_observation_dependencies_api(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Workflow dependency chains from canonical_events (audit-hash walk, AEOS parity)."""
    days = max(1, min(days, 365))
    rows = build_observation_dependency_chains(days=days)
    return [DependencyProcessChain(**c) for c in rows]


def _correlations_api_response(days: int) -> CognitionPlaneResponse:
    raw = build_cognition_plane_summary(days=max(1, min(days, 90)))
    return CognitionPlaneResponse(
        days=raw["days"],
        time_range_label=raw["time_range_label"],
        event_count=raw["event_count"],
        updated_at=raw["updated_at"],
        kpis=CognitionKpis(**raw["kpis"]),
        correlations=[CognitionCorrelation(**c) for c in raw["correlations"]],
    )


@app.get("/api/six-sigma/correlations", response_model=CognitionPlaneResponse, tags=["Dashboard"])
def get_six_sigma_correlations_api(
    days: int = 7,
    auth: AuthContext = Depends(require_auth),
):
    """Six Sigma — correlation engine from task telemetry."""
    return _correlations_api_response(days)


@app.get("/api/cognition-plane/summary", response_model=CognitionPlaneResponse, tags=["Dashboard"])
def get_cognition_plane_api(
    days: int = 7,
    auth: AuthContext = Depends(require_auth),
):
    """Deprecated alias for /api/six-sigma/correlations."""
    return _correlations_api_response(days)


@app.get("/api/economic-cognition/uop-library", response_model=UopLibraryResponse, tags=["Dashboard"])
def get_uop_library_api(
    manual_cost: float = 75.0,
    auth: AuthContext = Depends(require_auth),
):
    """UoP Library — published units of production catalogue."""
    raw = build_uop_library(manual_cost_per_task=max(10.0, min(manual_cost, 500.0)))
    return UopLibraryResponse(
        updated_at=raw["updated_at"],
        manual_cost_per_task=raw["manual_cost_per_task"],
        kpis=UopLibraryKpis(**raw["kpis"]),
        entries=[UopLibraryEntry(**e) for e in raw["entries"]],
    )


@app.get("/api/agents/matrices/skills", response_model=AgentMatrixResponse, tags=["Dashboard"])
def get_skills_matrix_api(
    agent_ids: Optional[str] = None,
    auth: AuthContext = Depends(require_auth),
):
    """Skills matrix: agents × skills (boolean cells)."""
    ids = [x.strip() for x in agent_ids.split(",") if x.strip()] if agent_ids else None
    raw = build_skills_matrix(ids)
    return AgentMatrixResponse(
        columns=raw["columns"],
        rows=[AgentMatrixRow(**r) for r in raw["rows"]],
    )


@app.get("/api/agents/matrices/permissions", response_model=AgentMatrixResponse, tags=["Dashboard"])
def get_permissions_matrix_api(
    agent_ids: Optional[str] = None,
    auth: AuthContext = Depends(require_auth),
):
    """Permissions matrix: agents × permissions (boolean cells)."""
    ids = [x.strip() for x in agent_ids.split(",") if x.strip()] if agent_ids else None
    raw = build_permissions_matrix(ids)
    return AgentMatrixResponse(
        columns=raw["columns"],
        rows=[AgentMatrixRow(**r) for r in raw["rows"]],
    )


@app.get("/api/agents/violations", response_model=AgentViolationsResponse, tags=["Dashboard"])
def get_agent_violations_api(auth: AuthContext = Depends(require_auth)):
    """Policy violations: tasks requiring skills/perms the agent lacks."""
    rows = build_agent_violations()
    return AgentViolationsResponse(
        violations=[AgentViolationRow(**v) for v in rows],
        count=len(rows),
    )


@app.get("/api/agents/{agent_id}", response_model=AgentDetailResponse, tags=["Dashboard"])
def get_registry_agent(agent_id: str, auth: AuthContext = Depends(require_auth)):
    agent = db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")
    return _agent_detail(agent)


@app.post("/api/agents", response_model=AgentDetailResponse, tags=["Dashboard"], status_code=201)
def create_registry_agent(
    body: AgentWriteBody,
    auth: AuthContext = Depends(require_operator),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Agent name is required.")
    if db.agent_name_exists(name):
        raise HTTPException(status_code=400, detail=f"An agent named '{name}' already exists.")

    group_slug = (body.group.strip() or "general").lower().replace(" ", "-")
    agent = Agent(
        agent_id           = f"agent-{group_slug}-{uuid.uuid4().hex[:6]}",
        name               = name,
        description        = body.description.strip(),
        group              = body.group.strip() or "general",
        model_name         = body.model_name,
        cost_per_1k_input  = body.cost_per_1k_input,
        cost_per_1k_output = body.cost_per_1k_output,
        skills             = body.skills,
        permissions        = body.permissions,
        status             = AgentStatus.ACTIVE,
    )
    db.upsert_agent(agent)
    refresh_agent_pool()
    return _agent_detail(agent)


@app.put("/api/agents/{agent_id}", response_model=AgentDetailResponse, tags=["Dashboard"])
def update_registry_agent(
    agent_id: str,
    body: AgentWriteBody,
    auth: AuthContext = Depends(require_operator),
):
    agent = db.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found.")

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Agent name is required.")
    if name != agent.name and db.agent_name_exists(name, exclude_id=agent_id):
        raise HTTPException(status_code=400, detail=f"An agent named '{name}' already exists.")

    updated = agent.model_copy(update={
        "name":               name,
        "description":        body.description.strip(),
        "group":              body.group.strip() or "general",
        "model_name":         body.model_name,
        "cost_per_1k_input":  body.cost_per_1k_input,
        "cost_per_1k_output": body.cost_per_1k_output,
        "skills":             body.skills,
        "permissions":        body.permissions,
        "status":             _parse_agent_status(body.status),
    })
    db.upsert_agent(updated)
    refresh_agent_pool()
    return _agent_detail(updated)


@app.delete("/api/agents/{agent_id}", tags=["Dashboard"])
def delete_registry_agent(
    agent_id: str,
    auth: AuthContext = Depends(require_operator),
):
    if not db.get_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agent not found.")
    db.delete_agent(agent_id)
    refresh_agent_pool()
    return {"message": "Agent deleted."}


@app.post("/api/admin/seed-demo", tags=["Dashboard"])
def seed_demo_data_api(auth: AuthContext = Depends(require_operator)):
    """Load bulk demo agents, tasks, workflows, and spans (operator+)."""
    result = db.seed_demo_data()
    refresh_agent_pool()
    return {
        "message": "Demo data loaded.",
        "agents": result.get("agents", 0),
        "tasks": result.get("tasks", 0),
        "spans": result.get("spans", 0),
        "workflows": result.get("workflows", 0),
    }


@app.get("/api/quality/summary", response_model=QualitySummaryResponse, tags=["Dashboard"])
def quality_summary(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Quality monitor: KPIs + task log for the last N days."""
    days = max(1, min(days, 90))
    rows = build_quality_task_rows(days)
    kpis = build_quality_kpis(rows, days=days)
    tasks = [
        QualityTaskRow(
            agent=r["agent"],
            task=r["task"],
            status=r["status"],
            duration=r["duration"],
            time_saved_m=r["time_saved_m"],
            timestamp=r["timestamp"],
            quality_score=r["quality_score"],
            task_type=r["task_type"],
            source_event_type=r.get("source_event_type") or "",
            task_id=r.get("task_id") or "",
            can_run=bool(r.get("can_run")),
        )
        for r in rows
    ]
    return QualitySummaryResponse(days=days, kpis=QualityKpisResponse(**kpis), tasks=tasks)


@app.post(
    "/api/quality/tasks",
    response_model=CreateQualityTaskResponse,
    tags=["Dashboard"],
    status_code=201,
)
def create_quality_task_api(
    body: CreateQualityTaskRequest,
    auth: AuthContext = Depends(require_operator),
):
    """Queue an operator task for the Quality task log (Running until executed)."""
    task = create_operator_task(
        agent_name=body.agent_name,
        capability=body.capability,
        message=body.message,
        channel=body.channel,
        user_id=body.user_id,
        team_id=body.team_id,
        platform=body.platform,
    )
    return CreateQualityTaskResponse(
        task_id=task.task_id,
        status="queued",
        message=f"Task queued for {body.agent_name}.",
    )


@app.post(
    "/api/quality/tasks/{task_id}/run",
    response_model=RunQualityTaskResponse,
    tags=["Dashboard"],
)
def run_quality_task_api(
    task_id:          str,
    background_tasks: BackgroundTasks,
    auth:             AuthContext = Depends(require_operator),
):
    """Dispatch a queued operator task to the agent pipeline."""
    task = db.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found.")
    if task.result.value != "pending":
        raise HTTPException(status_code=400, detail="Task is not queued for execution.")
    meta = task.metadata or {}
    if str(meta.get("source_event_type", "")) != "operator_task":
        raise HTTPException(status_code=400, detail="Only operator-queued tasks can be run.")

    request_id = str(uuid.uuid4())[:12]
    text = operator_task_webhook_text(task)
    dispatch_meta = operator_task_webhook_metadata(task)
    customer_id = str(meta.get("user_id") or "") or None

    background_tasks.add_task(
        _run_operator_task_dispatch,
        task_id=task_id,
        text=text,
        metadata=dispatch_meta,
        customer_id=customer_id,
        request_id=request_id,
    )

    return RunQualityTaskResponse(
        task_id=task_id,
        request_id=request_id,
        status="accepted",
        message=f"Queued task dispatched to the agent pipeline.",
    )


@app.get(
    "/api/observation/screening",
    response_model=ScreeningSummaryResponse,
    tags=["Dashboard"],
)
def observation_screening(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """AI screening histogram, HITL queue, and skill coverage (ECL proxy or local tasks)."""
    days = max(1, min(days, 90))
    payload = get_screening_summary(days)
    return ScreeningSummaryResponse(
        histogram=[ScreeningHistogramBin(**b) for b in payload.get("histogram", [])],
        totalCandidates=int(payload.get("totalCandidates", 0)),
        hitlAwaiting=int(payload.get("hitlAwaiting", 0)),
        reviewerAlignment=float(payload.get("reviewerAlignment", 0)),
        skills=[ScreeningSkillRow(**s) for s in payload.get("skills", [])],
    )


@app.get(
    "/api/governance/reviews",
    response_model=list[GovernanceReviewResponse],
    tags=["Dashboard"],
)
def governance_reviews(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Team review queue (ECL proxy or canonical events)."""
    days = max(1, min(days, 90))
    rows = get_governance_reviews(days)
    return [GovernanceReviewResponse(**r) for r in rows]


@app.get(
    "/api/governance/history",
    response_model=list[GovernanceReviewResponse],
    tags=["Dashboard"],
)
def governance_history(
    days: int = 30,
    limit: int = 200,
    auth: AuthContext = Depends(require_auth),
):
    """Completed Advance / Reject decisions for audit history."""
    from src.dashboard.governance import get_governance_history

    days = max(1, min(days, 90))
    limit = max(1, min(limit, 500))
    rows = get_governance_history(days, limit=limit)
    return [GovernanceReviewResponse(**r) for r in rows]


@app.post(
    "/api/governance/reviews/{task_id}/decide",
    response_model=GovernanceDecideResponse,
    tags=["Dashboard"],
)
def governance_review_decide(
    task_id: str,
    body: GovernanceDecideBody,
    background_tasks: BackgroundTasks,
    auth: AuthContext = Depends(require_operator),
):
    """Record Advance / Reject / Hold on a review-queue event."""
    try:
        result = decide_governance_review(
            task_id,
            body.decision,
            actor=auth.username,
            reviewer_name=auth.username,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.get("shouldResume") and result.get("workflowId"):
        pool = refresh_agent_pool()
        if pool:
            background_tasks.add_task(
                _run_resume_task,
                workflow_id=result["workflowId"],
                resume_from_step_index=0,
                agent_pool=pool,
            )

    return GovernanceDecideResponse(
        review=GovernanceReviewResponse(**result["review"]),
        decisionId=result["decisionId"],
        workflowId=result.get("workflowId"),
        shouldResume=bool(result.get("shouldResume")),
    )


@app.get(
    "/api/governance/performance",
    response_model=list[GovernancePerformanceResponse],
    tags=["Dashboard"],
)
def governance_performance(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Reviewer alignment stats (ECL proxy or derived from reviews)."""
    days = max(1, min(days, 90))
    rows = get_governance_performance(days)
    return [GovernancePerformanceResponse(**r) for r in rows]


@app.get(
    "/api/governance/gaps",
    response_model=list[GovernanceGapRow],
    tags=["Dashboard"],
)
def governance_gaps_api(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    days = max(1, min(days, 90))
    return [GovernanceGapRow(**g) for g in build_governance_gaps(days)]


@app.get(
    "/api/governance/gaps/coverage",
    response_model=list[GovernanceCoverageRow],
    tags=["Dashboard"],
)
def governance_gaps_coverage_api(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    days = max(1, min(days, 90))
    return [GovernanceCoverageRow(**r) for r in build_gaps_coverage(days)]


@app.get(
    "/api/governance/rules",
    response_model=list[GovernanceRuleRow],
    tags=["Dashboard"],
)
def governance_rules_list_api(auth: AuthContext = Depends(require_auth)):
    return [GovernanceRuleRow(**r) for r in db.list_governance_rules()]


@app.post(
    "/api/governance/rules",
    response_model=GovernanceRuleRow,
    tags=["Dashboard"],
    status_code=201,
)
def governance_rules_create_api(
    body: GovernanceRuleCreateBody,
    auth: AuthContext = Depends(require_operator),
):
    allowed = {"BLOCK", "WARN", "LOG"}
    action = (body.enforcement_action or "WARN").upper()
    if action not in allowed:
        raise HTTPException(status_code=400, detail="enforcement_action must be BLOCK, WARN, or LOG")
    if db.get_governance_rule(body.id.strip()):
        raise HTTPException(status_code=409, detail=f"Rule '{body.id}' already exists")
    try:
        row = db.insert_governance_rule(
            rule_id=body.id.strip(),
            name=body.name.strip(),
            task_type=body.task_type.strip(),
            enforcement_action=action,
            description=(body.description or "").strip(),
            reference_code=(body.reference_code or "").strip() or None,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return GovernanceRuleRow(**row)


@app.patch(
    "/api/governance/rules/{rule_id}",
    response_model=GovernanceRuleRow,
    tags=["Dashboard"],
)
def governance_rules_patch_api(
    rule_id: str,
    body: GovernanceRulePatchBody,
    auth: AuthContext = Depends(require_operator),
):
    action = None
    if body.enforcement_action is not None:
        action = body.enforcement_action.strip().upper()
        if action not in {"BLOCK", "WARN", "LOG"}:
            raise HTTPException(
                status_code=400,
                detail="enforcement_action must be BLOCK, WARN, or LOG",
            )
    try:
        row = db.patch_governance_rule(
            rule_id,
            is_active=body.is_active,
            name=body.name.strip() if body.name else None,
            description=body.description.strip() if body.description else None,
            enforcement_action=action,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=404, detail="Rule not found")
    return GovernanceRuleRow(**row)


@app.get(
    "/api/governance/violations",
    response_model=list[GovernanceViolationRow],
    tags=["Dashboard"],
)
def governance_violations_api(
    limit: int = 100,
    auth: AuthContext = Depends(require_auth),
):
    limit = max(1, min(limit, 200))
    return [GovernanceViolationRow(**r) for r in build_governance_violations(limit)]


@app.get(
    "/api/admin/api-keys",
    response_model=list[ApiKeyRow],
    tags=["Dashboard"],
)
def list_api_keys_api(auth: AuthContext = Depends(require_admin)):
    return [ApiKeyRow(**r) for r in db.list_api_keys()]


@app.post(
    "/api/admin/api-keys",
    response_model=ApiKeyCreateResponse,
    tags=["Dashboard"],
    status_code=201,
)
def create_api_key_api(
    body: ApiKeyCreateBody,
    auth: AuthContext = Depends(require_admin),
):
    label = (body.label or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="label is required")
    raw_key, meta = db.create_api_key(label)
    return ApiKeyCreateResponse(
        key=raw_key,
        label=meta["label"],
        id=meta["id"],
        keyPrefix=meta["keyPrefix"],
    )


@app.delete("/api/admin/api-keys/{key_id}", tags=["Dashboard"])
def revoke_api_key_api(
    key_id: int,
    auth: AuthContext = Depends(require_admin),
):
    if not db.revoke_api_key(key_id):
        raise HTTPException(status_code=404, detail="API key not found")
    return {"success": True}


@app.get(
    "/api/observation/registry",
    response_model=list[ObservationRegistryRowResponse],
    tags=["Dashboard"],
)
def observation_registry(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Quality agent registry with run stats (ECL proxy or local agents + tasks)."""
    days = max(1, min(days, 90))
    rows = get_observation_registry(days)
    return [ObservationRegistryRowResponse(**r) for r in rows]


@app.get(
    "/api/observation/outreach",
    response_model=OutreachSummaryResponse,
    tags=["Dashboard"],
)
def observation_outreach(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Outreach QA drafts and KPIs (ECL proxy or local response_draft events/tasks)."""
    days = max(1, min(days, 90))
    payload = get_outreach_summary(days)
    kpis_raw = payload.get("kpis") or {}
    mix_raw = kpis_raw.get("channelMix") or {}
    kpis = OutreachKpisResponse(
        draftsThisWeek=int(kpis_raw.get("draftsThisWeek", 0)),
        avgPersonalization=float(kpis_raw.get("avgPersonalization", 0)),
        flaggedForReview=int(kpis_raw.get("flaggedForReview", 0)),
        channelMix=OutreachChannelMixResponse(
            LinkedIn=float(mix_raw.get("LinkedIn", 0)),
            Email=float(mix_raw.get("Email", 0)),
            Slack=float(mix_raw.get("Slack", 0)),
        ),
        replyRate=float(kpis_raw.get("replyRate", 0)),
        sentWithoutEdit=float(kpis_raw.get("sentWithoutEdit", 0)),
    )
    drafts = [OutreachDraftResponse(**d) for d in payload.get("drafts", [])]
    return OutreachSummaryResponse(drafts=drafts, kpis=kpis)


@app.get(
    "/api/observation-plane/summary",
    response_model=ObservationSummaryResponse,
    tags=["Dashboard"],
)
def observation_plane_summary(
    days: int = 30,
    limit: int = 2000,
    feed_limit: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Observation Plane: KPIs, vendor breakdown, live stream, audit hash."""
    days = max(1, min(days, 90))
    limit = max(1, min(limit, 5000))
    feed_limit = max(1, min(feed_limit, 100))
    rows = build_observation_event_rows(days, limit)
    kpis = build_observation_kpis(rows)
    by_vendor = [VendorBreakdownRow(**v) for v in build_vendor_breakdown(rows)]
    live = [LiveEventRow(**e) for e in build_live_event_stream(rows, limit=feed_limit)]
    chain = latest_audit_chain(rows)
    return ObservationSummaryResponse(
        days=days,
        kpis=ObservationKpisResponse(**kpis),
        by_vendor=by_vendor,
        live_stream=live,
        audit_hash=chain.get("audit_hash") or "—",
        prev_event_hash=chain.get("prev_event_hash") or "",
        latest_event_id=chain.get("event_id") or "",
    )


@app.get(
    "/api/observation/coverage",
    response_model=list[ObservationCoverageRow],
    tags=["Dashboard"],
)
def get_observation_coverage_api(
    days: int = 30,
    auth: AuthContext = Depends(require_auth),
):
    """Capture surface health from coverage_manifest + event telemetry."""
    days = max(1, min(days, 365))
    return [ObservationCoverageRow(**row) for row in build_observation_coverage(days)]


@app.post(
    "/api/observation/coverage",
    response_model=ObservationCoverageRow,
    tags=["Dashboard"],
)
def upsert_observation_coverage_api(
    body: ObservationCoverageUpsertBody,
    auth: AuthContext = Depends(require_operator),
):
    """Register or update a capture surface (signed manifest row)."""
    try:
        row = db.upsert_coverage_manifest(
            body.hyperscaler,
            body.surface,
            body.status,
            activated_at=body.activatedAt,
            last_telemetry_at=body.lastTelemetryAt,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ObservationCoverageRow(**row)


def _find_uop_entry(uop_id: str) -> Optional[dict[str, Any]]:
    if not uop_id:
        return None
    library = build_uop_library()
    for entry in library.get("entries", []):
        if entry.get("uop_id") == uop_id:
            return entry
    return None


def _fire_deploy_webhook(
    *,
    url: str,
    secret: Optional[str],
    payload: dict[str, Any],
) -> None:
    import hashlib
    import hmac
    import json
    import requests

    headers = {"Content-Type": "application/json"}
    body = json.dumps(payload)
    if secret:
        sig = hmac.new(
            secret.encode(),
            body.encode(),
            hashlib.sha256,
        ).hexdigest()
        headers["X-Webhook-Signature"] = f"sha256={sig}"
    try:
        requests.post(url, data=body, headers=headers, timeout=8)
    except Exception:
        pass


@app.get(
    "/api/uop/library",
    response_model=list[UopLibraryAliasEntry],
    tags=["Dashboard"],
)
def get_uop_library_alias_api(auth: AuthContext = Depends(require_auth)):
    """AEOS alias — published UoP entries for deploy inheritance dropdown."""
    raw = build_uop_library()
    return [
        UopLibraryAliasEntry(
            uopId=e["uop_id"],
            name=e["name"],
            classification=e["classification"],
            ropValue=float(e.get("rop") or 0),
            mer=float(e.get("mer") or 0),
            trustTier=e.get("trust_tier_label") or "T0",
        )
        for e in raw.get("entries", [])
    ]


@app.get(
    "/api/deployments",
    response_model=list[DeploymentRowResponse],
    tags=["Dashboard"],
)
def list_deployments_api(auth: AuthContext = Depends(require_auth)):
    """List recent agent code deployments."""
    return [DeploymentRowResponse(**row) for row in db.list_deployments()]


@app.get(
    "/api/deployments/{deployment_id}",
    response_model=DeploymentRowResponse,
    tags=["Dashboard"],
)
def get_deployment_api(
    deployment_id: str,
    auth: AuthContext = Depends(require_auth),
):
    row = db.get_deployment(deployment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Deployment not found.")
    return DeploymentRowResponse(**row)


@app.post(
    "/api/deployments/validate",
    response_model=DeploymentValidateResponse,
    tags=["Dashboard"],
)
def validate_deployment_api(
    body: DeploymentValidateBody,
    auth: AuthContext = Depends(require_auth),
):
    parsed = parse_agent_code(body.codeLanguage, body.rawCode)
    return DeploymentValidateResponse(
        agentKind=parsed.agent_kind,
        manifest=parsed.manifest,
        validationStatus=parsed.validation_status,
        validationNotes=parsed.validation_notes,
    )


@app.post(
    "/api/deployments",
    response_model=DeploymentRowResponse,
    tags=["Dashboard"],
    status_code=201,
)
def create_deployment_api(
    body: DeploymentCreateBody,
    background_tasks: BackgroundTasks,
    auth: AuthContext = Depends(require_operator),
):
    name = (body.name or "").strip()
    raw_code = body.rawCode or ""
    code_language = (body.codeLanguage or "").strip().lower()
    if not name or not code_language or not raw_code.strip():
        raise HTTPException(
            status_code=400,
            detail="name, codeLanguage, and rawCode are required.",
        )
    if code_language not in ("json", "crewai", "python"):
        raise HTTPException(status_code=400, detail="Unsupported codeLanguage.")

    parsed = parse_agent_code(code_language, raw_code)
    if parsed.validation_status == "errors":
        raise HTTPException(status_code=400, detail=parsed.validation_notes)

    reuse_entry = _find_uop_entry(body.reuseFromUop or "")
    instructions = build_uop_instructions(
        name=name,
        classification=body.classification,
        trust_tier=body.trustTier,
        rop_target=float(body.ropTarget or 3.0),
        recursive_depth=int(body.recursiveDepth or 2),
        parsed=parsed,
        reuse_from=reuse_entry,
    )

    deployment_id = new_deployment_id()
    published_at = datetime.utcnow().isoformat()
    signature = deployment_signature(deployment_id, raw_code)
    published_by = (body.publishedBy or auth.username or "operator").strip()

    row = db.insert_deployment(
        deployment_id=deployment_id,
        name=name,
        code_language=code_language,
        agent_kind=parsed.agent_kind,
        classification=body.classification,
        trust_tier=body.trustTier,
        rop_target=float(body.ropTarget or 3.0),
        recursive_depth=int(body.recursiveDepth or 2),
        reuse_from_uop=body.reuseFromUop,
        raw_code=raw_code,
        manifest_json=json.dumps(parsed.manifest, indent=2, default=str),
        uop_instructions=instructions,
        validation_status=parsed.validation_status,
        validation_notes=parsed.validation_notes,
        signature=signature,
        published_at=published_at,
        published_by=published_by,
        webhook_url=body.webhookUrl,
        webhook_secret=body.webhookSecret,
    )

    agent_id = resolve_agent_id(parsed.manifest, name, deployment_id)
    skills = parsed.manifest.get("skills") or parsed.manifest.get("tools") or []
    if isinstance(skills, list):
        skill_list = [str(s) for s in skills]
    else:
        skill_list = []
    vendor = (
        parsed.manifest.get("vendor")
        or parsed.manifest.get("hyperscaler")
        or "anthropic"
    )
    model_name = parsed.manifest.get("model") or "claude-sonnet-4-6"
    try:
        agent = Agent(
            agent_id=agent_id,
            name=name,
            description=f"Deployed via {deployment_id}",
            skills=skill_list,
            permissions=[],
            group="deployed",
            status=AgentStatus.ACTIVE,
            vendor=str(vendor).strip().lower() or "anthropic",
            model_name=str(model_name),
            trust_level=trust_tier_to_level(body.trustTier),
        )
        db.upsert_agent(agent)
        refresh_agent_pool()
    except Exception:
        pass

    deploy_webhook_url = (
        (body.webhookUrl or "").strip()
        or os.getenv("DEPLOYMENT_WEBHOOK_URL")
        or ""
    )
    if deploy_webhook_url:
        payload = {
            "event": "agent.deployed",
            "deploymentId": deployment_id,
            "name": name,
            "agentKind": parsed.agent_kind,
            "trustTier": body.trustTier,
            "classification": body.classification,
            "ropTarget": float(body.ropTarget or 3.0),
            "signature": signature,
            "deployedAt": published_at,
        }
        secret = body.webhookSecret or os.getenv("DEPLOYMENT_WEBHOOK_SECRET")
        background_tasks.add_task(
            _fire_deploy_webhook,
            url=deploy_webhook_url,
            secret=secret,
            payload=payload,
        )

    return DeploymentRowResponse(**row)


@app.get("/api/tasks/scorecards", response_model=TaskScorecardsResponse, tags=["Dashboard"])
def task_scorecards(
    days: int = 7,
    group: str = "All",
    auth: AuthContext = Depends(require_auth),
):
    """Task completion scorecards, optional group filter, success by task type."""
    days_param: Optional[int] = None if days == 0 else max(1, min(days, 365))
    groups = ["All"] + list_agent_groups()
    selected = group if group in groups else "All"
    rows = build_scorecard_rows(days_param, selected)
    ge = build_group_eval(selected, days_param)
    group_eval = GroupEvalResponse(**ge) if ge else None
    acc = [AccuracyByTypeRow(**a) for a in build_accuracy_by_type(days_param)]
    return TaskScorecardsResponse(
        days=days_param,
        time_range_label=days_to_time_range_label(days_param),
        groups=groups,
        selected_group=selected,
        rows=[ScorecardRowResponse(**r) for r in rows],
        group_eval=group_eval,
        accuracy_by_type=acc,
    )


@app.get("/api/performance/summary", response_model=PerformanceSummaryResponse, tags=["Dashboard"])
def performance_summary(
    days: int = 7,
    granularity: str = "day",
    auth: AuthContext = Depends(require_auth),
):
    """Performance: reliability, latency, throughput, leaderboard."""
    days_param: Optional[int] = None if days == 0 else max(1, min(days, 365))
    g = granularity if granularity in ("day", "hour", "week") else "day"
    hist = build_latency_histogram(days_param)
    return PerformanceSummaryResponse(
        days=days_param,
        time_range_label=days_to_time_range_label(days_param),
        granularity=g,
        completion_rates=[CompletionRateRow(**r) for r in build_completion_rates(days_param)],
        latency_by_agent=[LatencyAgentRow(**r) for r in build_latency_by_agent(days_param)],
        latency_histogram=LatencyHistogram(
            stats=hist.get("stats") or {},
            bins=[LatencyBinRow(**b) for b in hist.get("bins") or []],
        ),
        throughput=[ThroughputPoint(**p) for p in build_throughput(days_param, g)],
        leaderboard=[LeaderboardRow(**r) for r in build_leaderboard(days_param)],
    )


@app.get("/api/economics/summary", response_model=EconomicsSummaryResponse, tags=["Dashboard"])
def economics_summary(
    days: int = 7,
    manual_cost: float = 50.0,
    auth: AuthContext = Depends(require_auth),
):
    """Economics: ROI, costs, tokens, workflow spend."""
    days_param: Optional[int] = None if days == 0 else max(1, min(days, 365))
    raw = build_economics_summary(days_param, manual_cost)
    roi_raw = raw.get("roi") or {}
    tokens_raw = raw.get("token_usage") or {}
    return EconomicsSummaryResponse(
        days=days_param,
        time_range_label=raw["time_range_label"],
        manual_cost_per_task=raw["manual_cost_per_task"],
        roi=RoiSummaryResponse(
            total_tasks=int(roi_raw.get("total_tasks", 0)),
            successful_tasks=int(roi_raw.get("successful_tasks", 0)),
            agent_total_cost=float(roi_raw.get("agent_total_cost", 0)),
            manual_equivalent_cost=float(roi_raw.get("manual_equivalent_cost", 0)),
            savings=float(roi_raw.get("savings", 0)),
            roi_pct=float(roi_raw.get("roi_pct", 0)),
            cost_per_successful_task=float(roi_raw.get("cost_per_successful_task", 0)),
        ),
        cost_by_agent=[CostByAgentRow(**r) for r in raw["cost_by_agent"]],
        cost_by_task_type=[CostByTaskTypeRow(**r) for r in raw["cost_by_task_type"]],
        cost_time_series=[CostTimeSeriesPoint(**p) for p in raw["cost_time_series"]],
        token_usage=TokenUsageResponse(**tokens_raw) if tokens_raw else TokenUsageResponse(),
        workflow_economics=[WorkflowEconomicsRow(**r) for r in raw["workflow_economics"]],
    )


@app.get("/api/overview/summary", response_model=OverviewSummaryResponse, tags=["Dashboard"])
def overview_summary(
    days: int = 7,
    auth: AuthContext = Depends(require_auth),
):
    """Dashboard overview: KPIs, cost trend, throughput, top agents."""
    days_param: Optional[int] = None if days == 0 else max(1, min(days, 365))
    raw = build_overview_summary(days_param)
    kpis = raw.get("kpis") or {}
    return OverviewSummaryResponse(
        days=days_param,
        time_range_label=raw["time_range_label"],
        kpis=OverviewKpisResponse(
            total_tasks=int(kpis.get("total_tasks", 0)),
            successful_tasks=int(kpis.get("successful_tasks", 0)),
            success_rate=float(kpis.get("success_rate", 0)),
            total_cost=float(kpis.get("total_cost", 0)),
            avg_cost_per_task=float(kpis.get("avg_cost_per_task", 0)),
            avg_latency_ms=float(kpis.get("avg_latency_ms", 0)),
            p90_latency_ms=float(kpis.get("p90_latency_ms", 0)),
            avg_quality=float(kpis.get("avg_quality", 0)),
            total_workflows=int(kpis.get("total_workflows", 0)),
            workflow_success_rate=float(kpis.get("workflow_success_rate", 0)),
            active_agents=int(kpis.get("active_agents", 0)),
        ),
        cost_time_series=[CostTimeSeriesPoint(**p) for p in raw["cost_time_series"]],
        throughput=[ThroughputPoint(**p) for p in raw["throughput"]],
        leaderboard=[LeaderboardRow(**r) for r in raw["leaderboard"]],
    )


@app.get("/api/traces", response_model=TraceListResponse, tags=["Dashboard"])
def list_traces(
    limit: int = 50,
    auth: AuthContext = Depends(require_auth),
):
    """Recent distributed trace IDs."""
    limit = max(1, min(limit, 200))
    return TraceListResponse(trace_ids=build_trace_id_list(limit))


@app.get("/api/traces/{trace_id}", response_model=TraceDetailResponse, tags=["Dashboard"])
def get_trace_detail(
    trace_id: str,
    auth: AuthContext = Depends(require_auth),
):
    """Spans and timeline data for one trace."""
    detail = build_trace_detail(trace_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Trace not found or has no spans.")
    return TraceDetailResponse(
        trace_id=detail["trace_id"],
        span_count=detail["span_count"],
        agent_count=detail["agent_count"],
        root_duration_ms=detail["root_duration_ms"],
        error_count=detail["error_count"],
        timeline_max_ms=detail["timeline_max_ms"],
        spans=[TraceSpanRow(**s) for s in detail["spans"]],
    )


@app.get("/api/run-review/summary", response_model=RunReviewSummaryResponse, tags=["Dashboard"])
def run_review_summary(auth: AuthContext = Depends(require_auth)):
    """Pipeline runs list and per-agent telemetry for Run Review."""
    raw = build_run_review_summary()
    return RunReviewSummaryResponse(
        runs=[RunReviewRunRow(**r) for r in raw["runs"]],
        telemetry=[AgentTelemetryRow(**t) for t in raw["telemetry"]],
    )


@app.get(
    "/api/run-review/workflows/{workflow_id}",
    response_model=WorkflowStudioResponse,
    tags=["Dashboard"],
)
def run_review_workflow_studio(
    workflow_id: str,
    auth: AuthContext = Depends(require_auth),
):
    """Training studio payload for one workflow."""
    raw = build_workflow_studio(workflow_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Workflow not found.")

    compare = None
    if raw.get("compare"):
        c = raw["compare"]
        compare = ComparePayloadResponse(
            status=c["status"],
            escalated=c["escalated"],
            escalation_reason=c.get("escalation_reason"),
            total_cost_usd=c["total_cost_usd"],
            steps=[CompareStepRow(**s) for s in c["steps"]],
            from_db=c.get("from_db", True),
            ran_at=c.get("ran_at"),
            workflow_id=c.get("workflow_id"),
        )

    return WorkflowStudioResponse(
        workflow_id=raw["workflow_id"],
        workflow_id_short=raw["workflow_id_short"],
        scenario_id=raw.get("scenario_id"),
        started_at=raw["started_at"],
        started_label=raw["started_label"],
        input_text=raw.get("input_text") or "",
        escalated=raw["escalated"],
        result=raw["result"],
        total_latency_ms=raw["total_latency_ms"],
        total_tokens=raw["total_tokens"],
        total_cost_usd=raw["total_cost_usd"],
        avg_confidence=raw.get("avg_confidence"),
        steps_overview=[TaskStepRowResponse(**s) for s in raw["steps_overview"]],
        v1_steps=[TaskStepRowResponse(**s) for s in raw["v1_steps"]],
        v2_steps=[TaskStepRowResponse(**s) for s in raw["v2_steps"]],
        latest_v2_workflow_id=raw.get("latest_v2_workflow_id"),
        compare=compare,
        tune_defaults=TuneDefaultsResponse(**raw["tune_defaults"]),
        tune_signals=raw["tune_signals"],
        rop=raw["rop"],
    )


def _parse_scenario_status(value: str) -> ScenarioStatus:
    try:
        return ScenarioStatus(value.lower())
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid status: {value}")


def _scenario_detail_response(sc: ScenarioConfig) -> ScenarioDetailResponse:
    raw = scenario_detail(sc)
    return ScenarioDetailResponse(
        scenario_id=raw["scenario_id"],
        name=raw["name"],
        description=raw["description"],
        status=raw["status"],
        step_count=raw["step_count"],
        agent_count=raw["agent_count"],
        estimated_cost_usd=raw["estimated_cost_usd"],
        roi_multiplier=raw["roi_multiplier"],
        updated_at=raw["updated_at"],
        updated_label=raw["updated_label"],
        team=ScenarioTeamResponse(**raw["team"]),
        pipeline=[PipelineStepBody(**s) for s in raw["pipeline"]],
        cost=ScenarioCostBody(**raw["cost"]),
        metadata=raw.get("metadata") or {},
        created_at=raw["created_at"],
    )


@app.get("/api/scenarios", response_model=list[ScenarioSummaryResponse], tags=["Dashboard"])
def list_scenario_library(auth: AuthContext = Depends(require_auth)):
    """All saved scenarios for the builder library."""
    return [ScenarioSummaryResponse(**s) for s in build_scenario_library()]


@app.get(
    "/api/scenarios/{scenario_id}",
    response_model=ScenarioDetailResponse,
    tags=["Dashboard"],
)
def get_scenario_detail_api(
    scenario_id: str,
    auth: AuthContext = Depends(require_auth),
):
    raw = build_scenario_detail(scenario_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    return ScenarioDetailResponse(
        scenario_id=raw["scenario_id"],
        name=raw["name"],
        description=raw["description"],
        status=raw["status"],
        step_count=raw["step_count"],
        agent_count=raw["agent_count"],
        estimated_cost_usd=raw["estimated_cost_usd"],
        roi_multiplier=raw["roi_multiplier"],
        updated_at=raw["updated_at"],
        updated_label=raw["updated_label"],
        team=ScenarioTeamResponse(**raw["team"]),
        pipeline=[PipelineStepBody(**s) for s in raw["pipeline"]],
        cost=ScenarioCostBody(**raw["cost"]),
        metadata=raw.get("metadata") or {},
        created_at=raw["created_at"],
    )


@app.post(
    "/api/scenarios",
    response_model=ScenarioDetailResponse,
    tags=["Dashboard"],
    status_code=201,
)
def create_scenario(
    body: ScenarioWriteBody,
    auth: AuthContext = Depends(require_operator),
):
    try:
        scenario = scenario_from_write_body(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if db.get_scenario(scenario.scenario_id):
        raise HTTPException(status_code=400, detail="Scenario ID already exists.")
    db.upsert_scenario(scenario)
    return _scenario_detail_response(scenario)


@app.put(
    "/api/scenarios/{scenario_id}",
    response_model=ScenarioDetailResponse,
    tags=["Dashboard"],
)
def update_scenario(
    scenario_id: str,
    body: ScenarioWriteBody,
    auth: AuthContext = Depends(require_operator),
):
    if not db.get_scenario(scenario_id):
        raise HTTPException(status_code=404, detail="Scenario not found.")
    try:
        scenario = scenario_from_write_body(body.model_dump(), scenario_id=scenario_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.upsert_scenario(scenario)
    return _scenario_detail_response(scenario)


@app.patch(
    "/api/scenarios/{scenario_id}/status",
    response_model=ScenarioDetailResponse,
    tags=["Dashboard"],
)
def update_scenario_status_api(
    scenario_id: str,
    body: ScenarioStatusBody,
    auth: AuthContext = Depends(require_operator),
):
    sc = db.get_scenario(scenario_id)
    if not sc:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    db.update_scenario_status(scenario_id, _parse_scenario_status(body.status))
    updated = db.get_scenario(scenario_id)
    return _scenario_detail_response(updated)


@app.patch(
    "/api/scenarios/{scenario_id}/cost",
    response_model=ScenarioDetailResponse,
    tags=["Dashboard"],
)
def patch_scenario_cost_api(
    scenario_id: str,
    body: ScenarioCostPatchBody,
    auth: AuthContext = Depends(require_operator),
):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    raw = patch_scenario_cost(scenario_id, patch)
    if not raw:
        raise HTTPException(status_code=404, detail="Scenario not found.")
    return ScenarioDetailResponse(
        scenario_id=raw["scenario_id"],
        name=raw["name"],
        description=raw["description"],
        status=raw["status"],
        step_count=raw["step_count"],
        agent_count=raw["agent_count"],
        estimated_cost_usd=raw["estimated_cost_usd"],
        roi_multiplier=raw["roi_multiplier"],
        updated_at=raw["updated_at"],
        updated_label=raw["updated_label"],
        team=ScenarioTeamResponse(**raw["team"]),
        pipeline=[PipelineStepBody(**s) for s in raw["pipeline"]],
        cost=ScenarioCostBody(**raw["cost"]),
        metadata=raw.get("metadata") or {},
        created_at=raw["created_at"],
    )


@app.delete("/api/scenarios/{scenario_id}", tags=["Dashboard"])
def delete_scenario_api(
    scenario_id: str,
    auth: AuthContext = Depends(require_operator),
):
    if not db.get_scenario(scenario_id):
        raise HTTPException(status_code=404, detail="Scenario not found.")
    db.delete_scenario(scenario_id)
    return {"message": "Scenario deleted."}


@app.get("/agents", tags=["System"])
def list_agents(auth: AuthContext = Depends(require_auth)):
    """Returns all active agents."""
    pool      = refresh_agent_pool()
    db_agents = {a.agent_id: a for a in db.get_all_agents()}
    return [
        {
            "agent_id":   aid,
            "name":       db_agents[aid].name if aid in db_agents else aid,
            "group":      db_agents[aid].group if aid in db_agents else "unknown",
            "skills":     db_agents[aid].skills if aid in db_agents else [],
            "is_free":    instance.is_free(),
            "queue_size": instance.task_queue.qsize(),
        }
        for aid, instance in pool.items()
    ]


@app.get("/scenarios", tags=["System"])
def list_scenarios(auth: AuthContext = Depends(require_auth)):
    """Returns all active scenarios."""
    scenarios = db.get_all_scenarios(status="active")
    return [
        {
            "scenario_id": s.scenario_id,
            "name":        s.name,
            "description": s.description,
            "steps":       len(s.pipeline),
            "est_cost":    s.estimated_cost_usd(),
        }
        for s in scenarios
    ]


# ── User management (admin only) ───────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username: str
    password: str
    role:     str = "operator"


@app.get("/users", tags=["Users"])
def list_users(auth: AuthContext = Depends(require_admin)):
    """Admin only — list users in the caller's organisation."""
    return [
        {
            "user_id":    u.user_id,
            "username":   u.username,
            "role":       u.role.value,
            "is_active":  u.is_active,
            "created_at": u.created_at.isoformat(),
            "last_login": u.last_login.isoformat() if u.last_login else None,
        }
        for u in db.get_all_users()
    ]


@app.post("/users", tags=["Users"], status_code=201)
def create_user(body: CreateUserRequest, auth: AuthContext = Depends(require_admin)):
    """Admin only — create a new user in the caller's organisation."""
    from src.dashboard.models import User, UserRole

    if db.user_exists(body.username):
        raise HTTPException(status_code=400, detail=f"Username '{body.username}' already exists.")

    try:
        role = UserRole(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role '{body.role}'.")

    new_user = User(
        user_id         = str(uuid.uuid4())[:12],
        username        = body.username,
        hashed_password = hash_password(body.password),
        role            = role,
        is_active       = True,
    )
    db.create_user(new_user)
    return {"message": f"User '{body.username}' created.", "user_id": new_user.user_id}


@app.patch("/users/{user_id}/status", tags=["Users"])
def toggle_user_status(user_id: str, is_active: bool,
                       auth: AuthContext = Depends(require_admin)):
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    db.update_user_status(user_id, is_active)
    return {"message": f"User '{user.username}' {'activated' if is_active else 'deactivated'}."}


@app.patch("/users/{user_id}/role", tags=["Users"])
def change_user_role(user_id: str, role: str,
                     auth: AuthContext = Depends(require_admin)):
    from src.dashboard.models import UserRole
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    try:
        db.update_user_role(user_id, UserRole(role))
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role '{role}'.")
    return {"message": f"Role updated to '{role}' for '{user.username}'."}


@app.delete("/users/{user_id}", tags=["Users"])
def remove_user(user_id: str, auth: AuthContext = Depends(require_admin)):
    user = db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.username == auth.username:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    db.delete_user(user_id)
    return {"message": f"User '{user.username}' deleted."}


# ── V2 Mission Control ─────────────────────────────────────────────────────────

class TuneRequest(BaseModel):
    confidence_threshold: float = 0.70
    sentiment_weight:     float = 0.50
    tone_variant:         str   = "formal"
    prompt_precision:     str   = "standard"
    fallback_depth:       int   = 1
    data_prefetch:        bool  = True


class RerunRequest(BaseModel):
    input_text:  str
    workflow_id: str

    @field_validator("input_text")
    @classmethod
    def input_text_must_be_non_empty(cls, v: str) -> str:
        return require_workflow_input_text(v)


@app.post("/v2/tune", tags=["V2"])
def save_v2_tune_params(body: TuneRequest, auth: AuthContext = Depends(require_auth)):
    from src.dashboard.models import ScenarioConfig, ScenarioStatus

    scenario = db.get_scenario("v2-tuned-pipeline")
    if not scenario:
        v1 = db.get_scenario("v1-baseline-pipeline")
        if not v1:
            raise HTTPException(
                status_code=404,
                detail="v1-baseline-pipeline not found — run seed_agents.py first.",
            )
        scenario = ScenarioConfig(
            scenario_id = "v2-tuned-pipeline",
            name        = "V2 Tuned Pipeline",
            description = "Tuned variant of V1 baseline, managed via V2 Mission Control.",
            status      = ScenarioStatus.ACTIVE,
            team        = v1.team,
            pipeline    = v1.pipeline,
            cost        = v1.cost,
        )

    scenario.metadata.update({
        "agent_params": {
            "agent-intake-classifier-01": {
                "confidence_threshold": body.confidence_threshold,
                "prompt_precision":     body.prompt_precision,
            },
            "agent-triage-scorer-01": {
                "sentiment_weight": body.sentiment_weight,
                "data_prefetch":    body.data_prefetch,
            },
            "response_drafter": {
                "tone_variant":   body.tone_variant,
                "fallback_depth": body.fallback_depth,
            },
        },
        "tuned_at": datetime.utcnow().isoformat(),
        "tuned_by": auth.username,
    })
    scenario.updated_at = datetime.utcnow()
    db.upsert_scenario(scenario)
    return {"message": "V2 parameters saved.", "scenario_id": "v2-tuned-pipeline"}


@app.post("/v2/rerun", tags=["V2"])
def rerun_with_v2_params(
    body:             RerunRequest,
    background_tasks: BackgroundTasks,
    auth:             AuthContext = Depends(require_auth),
):
    scenario = db.get_scenario("v2-tuned-pipeline")
    if not scenario:
        raise HTTPException(
            status_code=404,
            detail="v2-tuned-pipeline not found — call POST /v2/tune first.",
        )

    pool = refresh_agent_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="No active agents available.")

    request_id   = str(uuid.uuid4())[:12]
    orchestrator = OrchestratorAgent(pool)
    background_tasks.add_task(
        _run_scenario_task,
        orchestrator   = orchestrator,
        scenario_id    = "v2-tuned-pipeline",
        text           = body.input_text,
        request_id     = request_id,
        extra_metadata = {"original_workflow_id": body.workflow_id},
    )
    return {
        "request_id": request_id,
        "status":     "accepted",
        "message":    "Re-running through v2-tuned-pipeline.",
    }


# ── Webhook ────────────────────────────────────────────────────────────────────

def _is_operator_webhook(metadata: dict) -> bool:
    return metadata.get("source") == "quality-create-task" or bool(
        metadata.get("operator_task")
    )


def _route_webhook_request(
    payload: WebhookRequest,
    pool:    dict,
) -> tuple[str, str, BaseAgent, bool]:
    """Return (request_id, task_type, agent_instance, use_direct_agent)."""
    meta = payload.metadata or {}
    request_id = str(uuid.uuid4())[:12]

    if _is_operator_webhook(meta):
        try:
            task_type, agent_instance = _resolve_operator_agent(payload, pool)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        return request_id, task_type, agent_instance, True

    task_type, agent_instance = _triage.route(payload.text, pool)
    if agent_instance is None:
        raise HTTPException(
            status_code=503,
            detail=f"No agent found for task type '{task_type}'.",
        )
    return request_id, task_type, agent_instance, False


def _dispatch_direct_agent(
    agent_instance: BaseAgent,
    task_type:      str,
    payload:        WebhookRequest,
    request_id:     str,
) -> WebhookResponse:
    agent_instance.enqueue({
        "request_id": request_id,
        "task_type":  task_type,
        "customer":   payload.customer_id or f"webhook-{request_id}",
        "text":       payload.text,
        "metadata":   {**payload.metadata, "source": payload.source},
    })
    return WebhookResponse(
        request_id=request_id,
        status="accepted",
        task_type=task_type,
        agent_name=agent_instance.name,
        workflow_id=None,
        message=f"Request accepted. Assigned to {agent_instance.name}.",
    )


@app.post("/webhook", response_model=WebhookResponse, tags=["Webhook"])
def receive_webhook(
    payload:          WebhookRequest,
    background_tasks: BackgroundTasks,
    auth:             AuthContext = Depends(require_auth),
):
    """Main entry point. Routes the request through triage → scenario/agent pipeline."""
    pool = refresh_agent_pool()

    if not pool:
        raise HTTPException(
            status_code = 503,
            detail      = "No active agents available. Create agents in the Scenario Builder first.",
        )

    request_id, task_type, agent_instance, direct = _route_webhook_request(
        payload, pool
    )

    if direct:
        return _dispatch_direct_agent(agent_instance, task_type, payload, request_id)

    scenario_id = payload.scenario_id

    if not scenario_id:
        active_scenarios = db.get_all_scenarios(status="active")
        for sc in active_scenarios:
            if any(step.task_type == task_type for step in sc.pipeline):
                scenario_id = sc.scenario_id
                break

    if not scenario_id:
        scenario_id = "v1-baseline-pipeline"

    if scenario_id:
        orchestrator = OrchestratorAgent(pool)
        background_tasks.add_task(
            _run_scenario_task,
            orchestrator = orchestrator,
            scenario_id  = scenario_id,
            text         = payload.text,
            request_id   = request_id,
        )
        scenario = db.get_scenario(scenario_id)
        return WebhookResponse(
            request_id  = request_id,
            status      = "accepted",
            task_type   = task_type,
            agent_name  = scenario.name if scenario else "Unknown Scenario",
            workflow_id = None,
            message     = f"Request accepted. Running scenario '{scenario.name if scenario else scenario_id}'.",
        )
    else:
        agent_instance.enqueue({
            "request_id": request_id,
            "task_type":  task_type,
            "customer":   payload.customer_id or f"webhook-{request_id}",
            "text":       payload.text,
            "metadata":   {**payload.metadata, "source": payload.source},
        })
        return WebhookResponse(
            request_id  = request_id,
            status      = "accepted",
            task_type   = task_type,
            agent_name  = agent_instance.name,
            workflow_id = None,
            message     = f"Request accepted. Assigned to {agent_instance.name}.",
        )


@app.get("/status/{request_id}", tags=["Webhook"])
def get_request_status(request_id: str, auth: AuthContext = Depends(require_auth)):
    """Poll for the result of a previously submitted webhook request."""
    workflow = db.get_workflow_by_request_id(request_id)
    if not workflow:
        return {"request_id": request_id, "status": "pending",
                "message": "Pipeline still running or request not found."}

    tasks = db.get_tasks_by_workflow(workflow.workflow_id)
    steps = []
    for task in tasks:
        meta = task.metadata or {}
        steps.append({
            "step":             meta.get("step_number"),
            "step_name":        meta.get("step_name"),
            "agent_id":         task.agent_id,
            "task_type":        task.task_type,
            "result":           task.result.value,
            "latency_ms":       task.latency_ms,
            "input_tokens":     task.input_tokens,
            "output_tokens":    task.output_tokens,
            "cost_usd":         task.cost_usd,
            "quality_score":    task.quality_score,
            "auop_score":       meta.get("auop_score"),
            "escalation_flag":  meta.get("escalation_flag", False),
            "confidence_score": meta.get("confidence_score"),
            "priority":         meta.get("priority"),
            "sentiment_flag":   meta.get("sentiment_flag"),
            "agent_output":     meta.get("agent_output"),
        })

    return {
        "request_id":        request_id,
        "workflow_id":       workflow.workflow_id,
        "scenario_id":       workflow.metadata.get("scenario_id"),
        "status":            workflow.result.value,
        "escalated":         workflow.metadata.get("escalated", False),
        "escalation_reason": workflow.metadata.get("escalation_reason"),
        "total_cost_usd":    workflow.total_cost_usd,
        "started_at":        workflow.started_at.isoformat(),
        "completed_at":      workflow.completed_at.isoformat() if workflow.completed_at else None,
        "steps":             steps,
    }


# ── Workforce Resume (AEOS Human-in-the-Loop callback) ────────────────────────

class ResumeRequest(BaseModel):
    workflowId:           str = Field(..., description="workflow_id of the halted workflow")
    resumeFromStepIndex:  int = Field(..., ge=0, description="Zero-based pipeline step index to resume from")


@app.post("/api/workforce/resume", tags=["Workforce"])
def resume_workforce_workflow(
    body:             ResumeRequest,
    background_tasks: BackgroundTasks,
):
    """
    AEOS callback endpoint — resumes a governance-halted workflow.

    Accepts workflowId and resumeFromStepIndex from the AEOS callback, fires
    the resume task asynchronously, and immediately returns 200 so AEOS is
    not kept waiting.  No auth required: the call originates from AEOS using
    a shared-secret or mTLS (add Depends(require_auth) here if needed).
    """
    pool = refresh_agent_pool()
    if not pool:
        raise HTTPException(status_code=503, detail="No active agents available.")

    background_tasks.add_task(
        _run_resume_task,
        workflow_id=body.workflowId,
        resume_from_step_index=body.resumeFromStepIndex,
        agent_pool=pool,
    )
    return {
        "status": "accepted",
        "workflowId": body.workflowId,
        "resumeFromStepIndex": body.resumeFromStepIndex,
        "message": "Resume acknowledged. Continuation pipeline is executing.",
    }


# ── Background helpers ─────────────────────────────────────────────────────────

def _resolve_operator_agent(
    payload: WebhookRequest,
    pool:    dict,
) -> tuple[str, BaseAgent]:
    meta = payload.metadata or {}
    task_type = (
        meta.get("capability")
        or meta.get("task_type")
        or _triage.classify(payload.text)
    )
    agent_id = meta.get("agent_id") or resolve_agent_id(
        str(meta.get("agent_name") or "")
    )
    agent_instance = pool.get(agent_id) if agent_id in pool else None
    if agent_instance is None:
        agent_instance = _triage.find_agent(str(task_type), pool)
    if agent_instance is None:
        raise RuntimeError(f"No agent found for operator task type '{task_type}'")
    return str(task_type), agent_instance


def _run_operator_task_dispatch(
    task_id:     str,
    text:        str,
    metadata:    dict,
    customer_id: Optional[str],
    request_id:  str,
) -> None:
    """Background: route a queued operator task to a specific agent."""
    try:
        pool = refresh_agent_pool()
        if not pool:
            print(f"  [OperatorTask] {task_id} failed: no agents in pool")
            return
        payload = WebhookRequest(
            text=text,
            source="quality-create-task",
            customer_id=customer_id,
            metadata=metadata,
        )
        task_type, agent_instance = _resolve_operator_agent(payload, pool)
        _dispatch_direct_agent(agent_instance, task_type, payload, request_id)
        db.complete_operator_placeholder(task_id, request_id)
        print(
            f"  [OperatorTask] {task_id} → {request_id} via {agent_instance.name}"
        )
    except Exception as e:
        print(f"  [OperatorTask] {task_id} failed: {e}")
        try:
            db.complete_operator_placeholder(task_id, request_id, success=False)
        except Exception:
            pass


def _run_scenario_task(
    orchestrator:   OrchestratorAgent,
    scenario_id:    str,
    text:           str,
    request_id:     str,
    extra_metadata: dict = None,
) -> None:
    import os as _os
    ecl_api_key = _os.getenv("ECL_API_KEY", "")
    try:
        workflow = orchestrator.run_scenario(
            scenario_id, text, request_id=request_id,
            extra_metadata=extra_metadata, ecl_api_key=ecl_api_key,
        )
        if workflow:
            print(f"  [Webhook] {request_id} → workflow {workflow.workflow_id} "
                  f"({workflow.result.value})")
    except Exception as e:
        print(f"  [Webhook] {request_id} failed: {e}")


def _run_resume_task(
    workflow_id:            str,
    resume_from_step_index: int,
    agent_pool:             dict,
) -> None:
    import os as _os
    ecl_api_key = _os.getenv("ECL_API_KEY", "")
    try:
        continuation = _resume_workflow(
            original_workflow_id=workflow_id,
            resume_from_step_index=resume_from_step_index,
            agent_pool=agent_pool,
            ecl_api_key=ecl_api_key,
        )
        if continuation:
            print(f"  [Resume] {workflow_id} → continuation {continuation.workflow_id} "
                  f"({continuation.result.value})")
        else:
            print(f"  [Resume] {workflow_id} → resume failed (workflow or scenario not found)")
    except Exception as exc:
        print(f"  [Resume] {workflow_id} → unhandled error: {exc}")


# ── Import fix (ChangePasswordRequest used before definition) ──────────────────

from src.auth import verify_password  # noqa: E402

# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _reload = os.getenv("WEBHOOK_RELOAD", "").lower() in ("1", "true", "yes")
    uvicorn.run(
        "webhook_server:app",
        host      = "0.0.0.0",
        port      = 8000,
        reload    = _reload,
        log_level = "info",
    )
