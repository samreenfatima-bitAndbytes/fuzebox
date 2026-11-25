"""Seed 10 real agents + V1 scenario (pipeline steps + cost model) into the database.

Safe to run multiple times — uses upsert so no duplicates.

Usage:
    python seed_agents.py
"""

import sys
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

from src.dashboard import db
from src.dashboard.models import (
    Agent, AgentStatus,
    ScenarioConfig, ScenarioStatus,
    TeamConfig, CostConfig, PipelineStep,
)

HAIKU   = "claude-haiku-4-5-20251001"
SONNET  = "claude-sonnet-4-6"

# Haiku pricing
H_IN  = 0.00025
H_OUT = 0.00125

# Sonnet pricing
S_IN  = 0.003
S_OUT = 0.015

AGENTS = [

    # ── Pipeline agents ────────────────────────────────────────────────────────

    Agent(
        agent_id           = "agent-intake-classifier-01",
        name               = "Intake Classifier",
        description        = "Agent 1 — classifies raw customer requests via LLM and outputs task_type + confidence_score",
        skills             = ["intake_classification"],
        permissions        = ["read_request"],
        group              = "pipeline",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = H_IN,
        cost_per_1k_output = H_OUT,
        model_name         = HAIKU,
        registered_at      = datetime.utcnow(),
    ),

    Agent(
        agent_id           = "agent-triage-scorer-01",
        name               = "Triage Scorer",
        description        = "Agent 2 — scores classified requests with priority 1–5 and rationale",
        skills             = ["triage_scoring"],
        permissions        = ["read_request"],
        group              = "pipeline",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = H_IN,
        cost_per_1k_output = H_OUT,
        model_name         = HAIKU,
        registered_at      = datetime.utcnow(),
    ),

    # ── Drafter agents (Agent 3 variants) ─────────────────────────────────────

    Agent(
        agent_id           = "agent-billing-01",
        name               = "Billing Agent",
        description        = "Drafts first responses for billing inquiries, invoice disputes and charge questions",
        skills             = ["billing_inquiry", "response_draft"],
        permissions        = ["read_request", "draft_response"],
        group              = "drafters",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = H_IN,
        cost_per_1k_output = H_OUT,
        model_name         = HAIKU,
        registered_at      = datetime.utcnow(),
    ),

    Agent(
        agent_id           = "agent-refund-01",
        name               = "Refund Specialist",
        description        = "Drafts first responses specifically for refund requests and chargeback disputes",
        skills             = ["refund_request", "response_draft"],
        permissions        = ["read_request", "draft_response"],
        group              = "drafters",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = H_IN,
        cost_per_1k_output = H_OUT,
        model_name         = HAIKU,
        registered_at      = datetime.utcnow(),
    ),

    Agent(
        agent_id           = "agent-tech-01",
        name               = "Tech Support Agent",
        description        = "Drafts first responses for platform bugs, errors, and performance issues",
        skills             = ["technical_support", "response_draft"],
        permissions        = ["read_request", "draft_response"],
        group              = "drafters",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = H_IN,
        cost_per_1k_output = H_OUT,
        model_name         = HAIKU,
        registered_at      = datetime.utcnow(),
    ),

    Agent(
        agent_id           = "agent-api-01",
        name               = "API Integration Specialist",
        description        = "Drafts first responses for API errors, rate limits, SDK issues and integration problems",
        skills             = ["api_troubleshooting", "response_draft"],
        permissions        = ["read_request", "draft_response", "read_logs"],
        group              = "drafters",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = H_IN,
        cost_per_1k_output = H_OUT,
        model_name         = HAIKU,
        registered_at      = datetime.utcnow(),
    ),

    Agent(
        agent_id           = "agent-account-01",
        name               = "Account Manager Agent",
        description        = "Drafts first responses for password resets, login issues and subscription changes",
        skills             = ["password_reset", "account_management", "response_draft"],
        permissions        = ["read_request", "draft_response", "read_account"],
        group              = "drafters",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = H_IN,
        cost_per_1k_output = H_OUT,
        model_name         = HAIKU,
        registered_at      = datetime.utcnow(),
    ),

    Agent(
        agent_id           = "agent-general-01",
        name               = "General Support Agent",
        description        = "Drafts first responses for order status, FAQs and anything that doesn't fit a specific category",
        skills             = ["order_status", "general_inquiry", "response_draft"],
        permissions        = ["read_request", "draft_response", "read_orders"],
        group              = "drafters",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = H_IN,
        cost_per_1k_output = H_OUT,
        model_name         = HAIKU,
        registered_at      = datetime.utcnow(),
    ),

    # ── Senior agents (higher capability, higher cost) ─────────────────────────

    Agent(
        agent_id           = "agent-customer-success-01",
        name               = "Customer Success Manager",
        description        = "Handles retention risk, upgrade enquiries and high-value customer situations",
        skills             = ["account_management", "billing_inquiry", "general_inquiry", "response_draft"],
        permissions        = ["read_request", "draft_response", "read_account", "read_orders"],
        group              = "senior",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = S_IN,
        cost_per_1k_output = S_OUT,
        model_name         = SONNET,
        registered_at      = datetime.utcnow(),
    ),

    Agent(
        agent_id           = "agent-escalation-01",
        name               = "Escalation Coordinator",
        description        = "Receives escalated tickets (confidence < 0.70 or priority 5), drafts human handoff summary",
        skills             = ["escalation_handling", "response_draft"],
        permissions        = ["read_request", "draft_response", "read_account", "read_logs"],
        group              = "senior",
        status             = AgentStatus.ACTIVE,
        cost_per_1k_input  = S_IN,
        cost_per_1k_output = S_OUT,
        model_name         = SONNET,
        registered_at      = datetime.utcnow(),
    ),

]


# ── V1 Scenario ───────────────────────────────────────────────────────────────

SCENARIOS = [

    ScenarioConfig(
        scenario_id = "v1-baseline-pipeline",
        name        = "V1 Baseline Pipeline",
        description = "Three-agent triage + acknowledgement workflow. Classify → Score → Draft first response. Default settings, no tuning.",
        status      = ScenarioStatus.ACTIVE,
        team        = TeamConfig(
            agent_ids   = [
                "agent-intake-classifier-01",
                "agent-triage-scorer-01",
                "agent-billing-01",
                "agent-refund-01",
                "agent-tech-01",
                "agent-api-01",
                "agent-account-01",
                "agent-general-01",
            ],
            roles       = ["intake_classifier", "triage_scorer", "response_drafter"],
            permissions = ["read_request", "draft_response"],
        ),
        pipeline = [
            PipelineStep(
                step_number         = 1,
                name                = "Intake Classification",
                agent_id            = "agent-intake-classifier-01",
                task_type           = "intake_classification",
                expected_latency_ms = 3000.0,
                expected_quality    = 0.85,
                input_tokens        = 300,
                output_tokens       = 150,
            ),
            PipelineStep(
                step_number         = 2,
                name                = "Triage Scoring",
                agent_id            = "agent-triage-scorer-01",
                task_type           = "triage_scoring",
                expected_latency_ms = 3000.0,
                expected_quality    = 0.85,
                input_tokens        = 400,
                output_tokens       = 200,
            ),
            PipelineStep(
                step_number         = 3,
                name                = "Response Drafting",
                agent_id            = None,   # resolved at runtime by triage
                task_type           = "response_draft",
                expected_latency_ms = 4000.0,
                expected_quality    = 0.85,
                input_tokens        = 500,
                output_tokens       = 200,
            ),
        ],
        cost = CostConfig(
            price_per_1k_input     = H_IN,
            price_per_1k_output    = H_OUT,
            human_baseline_minutes = 60.0,   # 60 min human handle time
            manual_hourly_cost_usd = 75.0,   # $75/hr loaded rate → $75/task
            cost_center            = "technical_support",
            ledger_account         = "GL_AI_OPS",
        ),
        metadata = {"version": "v1", "tuned": False},
    ),

]


# ── Removed scenarios (v1-billing-only, v1-tech-fast-track, v1-high-value-customer)
# Only the default v1-baseline-pipeline is seeded. Additional scenarios can be
# created via the Scenario Builder in the dashboard.

_REMOVED = [
    ScenarioConfig(
        scenario_id = "v1-billing-only",
        name        = "V1 Billing Fast Track",
        description = "Two-step billing-specific pipeline. Classify → Billing Agent drafts response. No scoring step.",
        status      = ScenarioStatus.ACTIVE,
        team        = TeamConfig(
            agent_ids   = ["agent-intake-classifier-01", "agent-billing-01"],
            roles       = ["intake_classifier", "response_drafter"],
            permissions = ["read_request", "draft_response"],
        ),
        pipeline = [
            PipelineStep(
                step_number         = 1,
                name                = "Intake Classification",
                agent_id            = "agent-intake-classifier-01",
                task_type           = "intake_classification",
                expected_latency_ms = 3000.0,
                expected_quality    = 0.85,
                input_tokens        = 300,
                output_tokens       = 150,
            ),
            PipelineStep(
                step_number         = 2,
                name                = "Billing Response Draft",
                agent_id            = "agent-billing-01",
                task_type           = "billing_inquiry",
                expected_latency_ms = 3500.0,
                expected_quality    = 0.85,
                input_tokens        = 400,
                output_tokens       = 200,
            ),
        ],
        cost = CostConfig(
            price_per_1k_input  = H_IN,
            price_per_1k_output = H_OUT,
            manual_cost_per_task= 75.0,
        ),
        metadata = {"version": "v1", "tuned": False},
    ),

    ScenarioConfig(
        scenario_id = "v1-tech-fast-track",
        name        = "V1 Tech Fast Track",
        description = "Two-step technical pipeline. Classify → API Specialist or Tech Agent drafts response.",
        status      = ScenarioStatus.ACTIVE,
        team        = TeamConfig(
            agent_ids   = ["agent-intake-classifier-01", "agent-tech-01", "agent-api-01"],
            roles       = ["intake_classifier", "response_drafter"],
            permissions = ["read_request", "draft_response", "read_logs"],
        ),
        pipeline = [
            PipelineStep(
                step_number         = 1,
                name                = "Intake Classification",
                agent_id            = "agent-intake-classifier-01",
                task_type           = "intake_classification",
                expected_latency_ms = 3000.0,
                expected_quality    = 0.85,
                input_tokens        = 300,
                output_tokens       = 150,
            ),
            PipelineStep(
                step_number         = 2,
                name                = "Tech Response Draft",
                agent_id            = "agent-api-01",
                task_type           = "api_troubleshooting",
                expected_latency_ms = 4000.0,
                expected_quality    = 0.85,
                input_tokens        = 500,
                output_tokens       = 250,
            ),
        ],
        cost = CostConfig(
            price_per_1k_input  = H_IN,
            price_per_1k_output = H_OUT,
            manual_cost_per_task= 75.0,
        ),
        metadata = {"version": "v1", "tuned": False},
    ),

    ScenarioConfig(
        scenario_id = "v1-high-value-customer",
        name        = "V1 High Value Customer",
        description = "Full pipeline with senior agents. Classify → Score → Customer Success Manager drafts response.",
        status      = ScenarioStatus.ACTIVE,
        team        = TeamConfig(
            agent_ids   = [
                "agent-intake-classifier-01",
                "agent-triage-scorer-01",
                "agent-customer-success-01",
            ],
            roles       = ["intake_classifier", "triage_scorer", "response_drafter"],
            permissions = ["read_request", "draft_response", "read_account", "read_orders"],
        ),
        pipeline = [
            PipelineStep(
                step_number         = 1,
                name                = "Intake Classification",
                agent_id            = "agent-intake-classifier-01",
                task_type           = "intake_classification",
                expected_latency_ms = 3000.0,
                expected_quality    = 0.90,
                input_tokens        = 300,
                output_tokens       = 150,
            ),
            PipelineStep(
                step_number         = 2,
                name                = "Triage Scoring",
                agent_id            = "agent-triage-scorer-01",
                task_type           = "triage_scoring",
                expected_latency_ms = 3000.0,
                expected_quality    = 0.90,
                input_tokens        = 400,
                output_tokens       = 200,
            ),
            PipelineStep(
                step_number         = 3,
                name                = "Customer Success Response Draft",
                agent_id            = "agent-customer-success-01",
                task_type           = "response_draft",
                expected_latency_ms = 5000.0,
                expected_quality    = 0.92,
                input_tokens        = 600,
                output_tokens       = 300,
            ),
        ],
        cost = CostConfig(
            price_per_1k_input  = S_IN,
            price_per_1k_output = S_OUT,
            manual_cost_per_task= 150.0,
        ),
        metadata = {"version": "v1", "tuned": False, "tier": "high_value"},
    ),

]


def main():
    db.init_db()

    print(f"Seeding {len(AGENTS)} agents...\n")
    for agent in AGENTS:
        db.upsert_agent(agent)
        print(f"  ✓  {agent.name:<35}  [{agent.group}]  {agent.model_name}")

    print(f"\nSeeding {len(SCENARIOS)} scenarios...\n")
    for scenario in SCENARIOS:
        db.upsert_scenario(scenario)
        print(f"  ✓  {scenario.name:<40}  ({len(scenario.pipeline)} steps)  ~${scenario.estimated_cost_usd():.5f}/run")

    print(f"\nDone. Open the dashboard → Scenario Builder to view and edit them.")


if __name__ == "__main__":
    main()
