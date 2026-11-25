"""Seed V1 + V2 scenarios (and optional sample runs) into the dashboard DB.

Manual script only (no background automation). Safe to run multiple times.

Usage examples:
  python seed_scenarios.py --scenarios
  python seed_scenarios.py --scenarios --sample-runs 25
  python seed_scenarios.py --all
"""

from __future__ import annotations

import argparse
import json
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import sys

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from src.dashboard import db
from src.dashboard.traces_page import spans_from_tasks
from src.dashboard.models import (
    ScenarioConfig,
    ScenarioStatus,
    PipelineStep,
    TaskRecord,
    TaskResult,
    WorkflowRecord,
)


def _ensure_agents_seeded() -> None:
    """Seed the baseline pipeline agents if DB is empty."""
    try:
        existing = db.get_all_agents()
    except Exception:
        existing = []

    if existing:
        return

    # Fall back to the canonical agent seeder shipped with the repo.
    import seed_agents as _seed_agents

    for agent in _seed_agents.AGENTS:
        db.upsert_agent(agent)


def _ensure_v1_scenario() -> ScenarioConfig:
    import seed_agents as _seed_agents

    v1 = db.get_scenario("v1-baseline-pipeline")
    if v1:
        return v1

    # Reuse the canonical definition from seed_agents.py to avoid drift.
    sc = next((s for s in _seed_agents.SCENARIOS if s.scenario_id == "v1-baseline-pipeline"), None)
    if not sc:
        raise RuntimeError("Could not locate v1-baseline-pipeline in seed_agents.SCENARIOS")

    db.upsert_scenario(sc)
    return sc


def _ensure_v2_scenario_from_v1(v1: ScenarioConfig) -> ScenarioConfig:
    v2 = db.get_scenario("v2-tuned-pipeline")
    if v2:
        # Ensure required nested structure exists (dashboard expects this shape).
        v2.metadata = v2.metadata or {}
        v2.metadata.setdefault("agent_params", {})
        v2.metadata["agent_params"].setdefault("agent-intake-classifier-01", {})
        v2.metadata["agent_params"].setdefault("agent-triage-scorer-01", {})
        v2.metadata["agent_params"].setdefault("response_drafter", {})
        db.upsert_scenario(v2)
        return v2

    v2 = ScenarioConfig(
        scenario_id="v2-tuned-pipeline",
        name="V2 Tuned Pipeline",
        description="Tuned variant of V1 baseline, managed via V2 Mission Control.",
        status=ScenarioStatus.ACTIVE,
        team=v1.team,
        pipeline=v1.pipeline,
        cost=v1.cost,
        metadata={
            "version": "v2",
            "tuned": True,
            "agent_params": {
                # Matches the schema used by POST /v2/tune
                "agent-intake-classifier-01": {
                    "confidence_threshold": 0.70,
                    "prompt_precision": "standard",
                },
                "agent-triage-scorer-01": {
                    "sentiment_weight": 0.50,
                    "data_prefetch": True,
                },
                "response_drafter": {
                    "tone_variant": "formal",
                    "fallback_depth": 1,
                },
            },
            "tuned_at": datetime.now(timezone.utc).isoformat(),
            "tuned_by": "seed_scenarios.py",
        },
    )
    db.upsert_scenario(v2)
    return v2


def _parse_jsonish(text: str) -> dict | None:
    """Best-effort parsing of agent JSON output."""
    if not text:
        return None
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1]
    if t.endswith("```"):
        t = t.rsplit("```", 1)[0]
    try:
        return json.loads(t.strip())
    except Exception:
        return None


def _insert_sample_run(
    *,
    scenario: ScenarioConfig,
    run_at: datetime,
    input_text: str,
    force_confidence: float | None = None,
    force_priority: int | None = None,
) -> str:
    """Insert a workflow + 3 step tasks matching the orchestrator's metadata shape."""
    workflow_id = str(uuid.uuid4())[:12]
    request_id = str(uuid.uuid4())[:12]
    trace_id = str(uuid.uuid4())[:16]

    # Step 1 output (classifier)
    task_type = random.choice(
        [
            "billing_inquiry",
            "refund_request",
            "technical_support",
            "api_troubleshooting",
            "account_management",
            "general_inquiry",
        ]
    )
    confidence = force_confidence if force_confidence is not None else round(random.uniform(0.45, 0.98), 2)
    step1_output = json.dumps(
        {
            "task_type": task_type,
            "confidence_score": confidence,
            "routing_reason": "Seeded demo classification for dashboard scenarios.",
            "secondary_task_type": None,
            "is_blended": False,
        }
    )

    # Escalation gate behavior (mirrors orchestrator: confidence < threshold escalates)
    conf_threshold = float(
        ((scenario.metadata or {}).get("agent_params", {}))
        .get("agent-intake-classifier-01", {})
        .get("confidence_threshold", 0.70)
    )
    escalated = confidence < conf_threshold

    step2_priority = force_priority if force_priority is not None else random.randint(1, 5)
    step2_output = json.dumps(
        {
            "task_type": task_type,
            "priority": step2_priority,
            "sentiment_flag": random.choice(["positive", "neutral", "negative"]),
            "rationale": "Seeded demo priority for dashboard comparisons.",
        }
    )

    step3_output = json.dumps(
        {
            "draft_response": "Thanks for reaching out — we’ve received your request and our team is reviewing it now. "
            "We’ll follow up shortly with next steps.",
            "sentiment_flag": "neutral",
        }
    )

    # Choose agents consistent with seed_agents.py
    intake_agent = "agent-intake-classifier-01"
    triage_agent = "agent-triage-scorer-01"
    drafter_by_type = {
        "billing_inquiry": "agent-billing-01",
        "refund_request": "agent-refund-01",
        "technical_support": "agent-tech-01",
        "api_troubleshooting": "agent-api-01",
        "account_management": "agent-account-01",
        "general_inquiry": "agent-general-01",
    }
    draft_agent = drafter_by_type.get(task_type, "agent-general-01")

    def mk_task(
        *,
        step: PipelineStep,
        agent_id: str,
        started_at: datetime,
        output_text: str,
        result: TaskResult,
        meta_patch: dict,
    ) -> TaskRecord:
        latency_ms = round(random.uniform(600, 3500), 2)
        input_tokens = random.randint(150, 600)
        output_tokens = random.randint(80, 260)
        cost_usd = round(random.uniform(0.00005, 0.0012), 6)

        metadata = {
            "step_number": step.step_number,
            "step_name": step.name,
            "timestamp": started_at.isoformat(),
            "completion_status": result.value,
            "escalation_flag": False,
            "auop_score": round(random.uniform(0.03, 0.25), 4),
            "agent_output": output_text,
        }
        metadata.update(meta_patch)

        return TaskRecord(
            task_id=str(uuid.uuid4())[:12],
            agent_id=agent_id,
            workflow_id=workflow_id,
            task_type=step.task_type,
            description=step.name,
            result=result,
            started_at=started_at,
            completed_at=started_at + timedelta(milliseconds=latency_ms),
            latency_ms=latency_ms,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=input_tokens + output_tokens,
            cost_usd=cost_usd,
            quality_score=round(random.uniform(0.75, 0.98), 3) if result == TaskResult.SUCCESS else 0.0,
            metadata=metadata,
        )

    # Map steps by number (v1 baseline is always 3 steps)
    steps = {s.step_number: s for s in scenario.pipeline}
    s1, s2, s3 = steps.get(1), steps.get(2), steps.get(3)
    if not (s1 and s2 and s3):
        raise RuntimeError(f"Scenario {scenario.scenario_id} missing expected 3 steps.")

    t0 = run_at
    tasks: list[TaskRecord] = []

    # Step 1 always runs
    tasks.append(
        mk_task(
            step=s1,
            agent_id=intake_agent,
            started_at=t0,
            output_text=step1_output,
            result=TaskResult.SUCCESS,
            meta_patch={
                "confidence_score": confidence,
                "routing_reason": _parse_jsonish(step1_output).get("routing_reason"),
            },
        )
    )

    if escalated:
        # Patch step1 metadata like orchestrator does and stop.
        tasks[-1].metadata.update({"escalation_flag": True, "completion_status": "escalated"})
        wf_result = TaskResult.ESCALATED
        task_ids = [tasks[-1].task_id]
        agent_ids = [intake_agent]
        total_cost = sum(t.cost_usd for t in tasks)

        wf = WorkflowRecord(
            workflow_id=workflow_id,
            name=scenario.name,
            description=scenario.description,
            agent_ids=agent_ids,
            task_ids=task_ids,
            started_at=t0,
            completed_at=t0 + timedelta(milliseconds=tasks[-1].latency_ms or 0),
            result=wf_result,
            total_cost_usd=round(total_cost, 6),
            metadata={
                "scenario_id": scenario.scenario_id,
                "request_id": request_id,
                "trace_id": trace_id,
                "input_text": input_text,
                "seeded": True,
                "escalated": True,
                "escalation_reason": f"Intake classifier confidence {confidence:.2f} below threshold {conf_threshold:.2f}",
                "escalation_step": 1,
            },
        )
        for t in tasks:
            db.insert_task(t)
        for span in spans_from_tasks(workflow_id, tasks, trace_id=trace_id):
            db.insert_span(span)
        db.insert_workflow(wf)
        return workflow_id

    # Step 2
    tasks.append(
        mk_task(
            step=s2,
            agent_id=triage_agent,
            started_at=t0 + timedelta(seconds=2),
            output_text=step2_output,
            result=TaskResult.SUCCESS,
            meta_patch={
                "priority": step2_priority,
                "sentiment_flag": _parse_jsonish(step2_output).get("sentiment_flag"),
                "rationale": _parse_jsonish(step2_output).get("rationale"),
            },
        )
    )

    # Step 3
    tasks.append(
        mk_task(
            step=s3,
            agent_id=draft_agent,
            started_at=t0 + timedelta(seconds=4),
            output_text=step3_output,
            result=TaskResult.SUCCESS,
            meta_patch={
                "auop_score": round(random.uniform(0.03, 0.25), 4),
            },
        )
    )

    task_ids = [t.task_id for t in tasks]
    agent_ids = list({t.agent_id for t in tasks})
    total_cost = sum(t.cost_usd for t in tasks)

    wf = WorkflowRecord(
        workflow_id=workflow_id,
        name=scenario.name,
        description=scenario.description,
        agent_ids=agent_ids,
        task_ids=task_ids,
        started_at=t0,
        completed_at=t0 + timedelta(seconds=6),
        result=TaskResult.SUCCESS,
        total_cost_usd=round(total_cost, 6),
        metadata={
            "scenario_id": scenario.scenario_id,
            "request_id": request_id,
            "trace_id": trace_id,
            "input_text": input_text,
            "seeded": True,
            "source": "seed_scenarios.py",
        },
    )

    for t in tasks:
        db.insert_task(t)
    for span in spans_from_tasks(workflow_id, tasks, trace_id=trace_id):
        db.insert_span(span)
    db.insert_workflow(wf)
    return workflow_id


def seed_scenarios() -> dict:
    db.init_db()
    _ensure_agents_seeded()
    v1 = _ensure_v1_scenario()
    v2 = _ensure_v2_scenario_from_v1(v1)
    return {"v1": v1.scenario_id, "v2": v2.scenario_id}


def seed_sample_runs(n: int) -> dict:
    """Create n seeded workflows across V1 and V2, with some escalations."""
    db.init_db()
    _ensure_agents_seeded()
    v1 = _ensure_v1_scenario()
    v2 = _ensure_v2_scenario_from_v1(v1)

    now = datetime.now(timezone.utc)
    seeded_ids: list[str] = []
    for i in range(n):
        scenario = v2 if (i % 2 == 0) else v1
        # Spread over last 7 days so dashboard charts look natural.
        run_at = now - timedelta(hours=random.uniform(1, 7 * 24))
        input_text = random.choice(
            [
                "I was charged twice this month — can you help?",
                "My API requests are failing with 429 errors since this morning.",
                "I can’t log in after changing my password.",
                "The dashboard is slow and sometimes errors out.",
                "Please refund my last invoice, I didn’t authorize this renewal.",
                "How do I change my subscription plan?",
            ]
        )
        # Make ~20% escalations (confidence low)
        if random.random() < 0.2:
            force_conf = round(random.uniform(0.35, 0.65), 2)
        else:
            force_conf = None

        seeded_ids.append(
            _insert_sample_run(
                scenario=scenario,
                run_at=run_at,
                input_text=input_text,
                force_confidence=force_conf,
            )
        )

    return {"seeded_workflows": len(seeded_ids)}


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--scenarios", action="store_true", help="Seed V1 + V2 scenario configs")
    p.add_argument("--sample-runs", type=int, default=0, help="Seed N example workflows/tasks for the dashboard")
    p.add_argument("--all", action="store_true", help="Seed scenarios + 20 sample runs")
    args = p.parse_args()

    if args.all:
        args.scenarios = True
        args.sample_runs = args.sample_runs or 20

    if not args.scenarios and args.sample_runs <= 0:
        p.error("Nothing to do. Use --scenarios, --sample-runs N, or --all.")

    if args.scenarios:
        ids = seed_scenarios()
        print(f"✓ Seeded scenarios: {ids['v1']} + {ids['v2']}")

    if args.sample_runs > 0:
        out = seed_sample_runs(args.sample_runs)
        print(f"✓ Seeded {out['seeded_workflows']} workflows with per-step task records")

    print("Done. Refresh the dashboard and check Scenarios + Workflows.")


if __name__ == "__main__":
    main()

