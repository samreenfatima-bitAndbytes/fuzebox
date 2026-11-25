"""Pydantic data models for the Agent Performance Dashboard."""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, model_validator


# ── Tenant / Organisation models ─────────────────────────────────────────────


class Organization(BaseModel):
    org_id:     str
    name:       str
    slug:       str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active:  bool = True
    deployment_health_url: Optional[str] = None


# ── User models ───────────────────────────────────────────────────────────────


class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"   # can send webhook requests, view dashboard
    READONLY = "readonly"   # dashboard view only


class User(BaseModel):
    user_id:         str
    username:        str
    hashed_password: str
    role:            UserRole = UserRole.OPERATOR
    is_active:       bool = True
    created_at:      datetime = Field(default_factory=datetime.utcnow)
    last_login:      Optional[datetime] = None


# ── Scenario Builder models ────────────────────────────────────────────────────


class ScenarioStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class PipelineStep(BaseModel):
    """A single step inside a scenario pipeline."""

    step_number: int
    name: str
    agent_id: Optional[str] = None          # FK → agents.agent_id (None = any free agent)
    task_type: str = "general_inquiry"
    expected_latency_ms: float = 5000.0
    expected_quality: float = 0.85
    input_tokens: int = 1000
    output_tokens: int = 500


class TeamConfig(BaseModel):
    """The set of agents assigned to a scenario and their shared permissions."""

    agent_ids: list[str] = Field(default_factory=list)
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)


class CostConfig(BaseModel):
    """Pricing assumptions used to estimate scenario cost."""

    price_per_1k_input: float = 0.0008
    price_per_1k_output: float = 0.004
    human_baseline_minutes: float = 60.0      # minutes a human takes per task
    manual_hourly_cost_usd: float = 75.0      # loaded hourly rate for that human
    manual_cost_per_task: float = 75.0        # derived: (human_baseline_minutes / 60) * manual_hourly_cost_usd
    cost_center: str = ""                     # e.g. "technical_support"
    ledger_account: str = ""                  # e.g. "GL_AI_OPS"

    @model_validator(mode="after")
    def _compute_manual_cost(self) -> "CostConfig":
        self.manual_cost_per_task = round(
            (self.human_baseline_minutes / 60.0) * self.manual_hourly_cost_usd, 4
        )
        return self


class ScenarioConfig(BaseModel):
    """A saved scenario: team + pipeline + cost model."""

    scenario_id: str
    name: str
    description: str = ""
    status: ScenarioStatus = ScenarioStatus.DRAFT
    team: TeamConfig = Field(default_factory=TeamConfig)
    pipeline: list[PipelineStep] = Field(default_factory=list)
    cost: CostConfig = Field(default_factory=CostConfig)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict = Field(default_factory=dict)

    # ── Derived helpers ────────────────────────────────────────────────────────

    def estimated_cost_usd(self) -> float:
        """Sum estimated LLM cost across all pipeline steps."""
        total = 0.0
        for step in self.pipeline:
            total += (step.input_tokens / 1000.0) * self.cost.price_per_1k_input
            total += (step.output_tokens / 1000.0) * self.cost.price_per_1k_output
        return round(total, 6)

    def roi_multiplier(self) -> float:
        """How many times cheaper than fully manual execution."""
        est = self.estimated_cost_usd()
        manual_total = self.cost.manual_cost_per_task * max(len(self.pipeline), 1)
        if est <= 0:
            return 0.0
        return round(manual_total / est, 2)


class AgentStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"


class TaskResult(str, Enum):
    SUCCESS   = "success"
    FAILURE   = "failure"
    PARTIAL   = "partial"
    TIMEOUT   = "timeout"
    ESCALATED = "escalated"
    PENDING   = "pending"


class Agent(BaseModel):
    agent_id: str
    name: str
    description: str = ""
    skills: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    group: str = "default"
    status: AgentStatus = AgentStatus.ACTIVE
    cost_per_1k_input: float = 0.003
    cost_per_1k_output: float = 0.015
    vendor: str = "anthropic"
    model_name: str = "gpt-4"
    registered_at: datetime = Field(default_factory=datetime.utcnow)
    trust_level: int = 0  # T0–T4 on the trust ladder; starts at T0 (unverified)


class TaskRecord(BaseModel):
    task_id: str
    agent_id: str
    workflow_id: Optional[str] = None
    task_type: str
    description: str = ""
    required_skills: list[str] = Field(default_factory=list)
    required_permissions: list[str] = Field(default_factory=list)
    result: TaskResult = TaskResult.SUCCESS
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    latency_ms: Optional[float] = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost_usd: float = 0.0
    quality_score: Optional[float] = None  # 0.0 - 1.0
    metadata: dict = Field(default_factory=dict)


class SpanRecord(BaseModel):
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    agent_id: str
    operation: str
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    duration_ms: Optional[float] = None
    status: str = "OK"
    attributes: dict = Field(default_factory=dict)


class WorkflowRecord(BaseModel):
    workflow_id: str
    name: str
    description: str = ""
    agent_ids: list[str] = Field(default_factory=list)
    task_ids: list[str] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    result: TaskResult = TaskResult.SUCCESS
    total_cost_usd: float = 0.0
    metadata: dict = Field(default_factory=dict)
