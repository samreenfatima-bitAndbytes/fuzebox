"""Human-in-the-Loop Resume Engine.

Implements the generic resume circuit for any workflow that was halted by an
AEOS governance gate. Responsibilities:

  1. Re-hydrate historical step outputs from the database (no re-execution).
  2. Resume execution from an arbitrary step index, injecting humanOverride:true
     into the AEOS check for exactly that one step so the gate passes.
  3. Execute all subsequent steps with normal (unmodified) governance checks.
  4. Persist the continuation as a new WorkflowRecord linked back to the
     original via metadata so the audit trail stays intact.
"""

import sys
import uuid
import json
import os
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

import requests as _http

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.dashboard import db
from src.dashboard.models import (
    ScenarioConfig,
    PipelineStep,
    CostConfig,
    WorkflowRecord,
    TaskRecord,
    TaskResult,
)
from agents.triage_agent import TriageAgent

_ECL_ENDPOINT = os.environ.get("ECL_API_URL", "http://host.docker.internal:5000") + "/api/observation/ingest"
_base_url = os.environ.get("ECL_API_URL", "http://host.docker.internal:5000")
AEOS_SERVER_URL = os.environ.get("AEOS_SERVER_URL", _base_url)


# ── Internal helpers ───────────────────────────────────────────────────────────

def _aeos_governance_check(
    task_type: str,
    ecl_api_key: str,
    human_override: bool = False,
) -> bool:
    """
    Query the AEOS governance endpoint.

    When human_override=True, passes humanOverride=true as a query parameter so
    AEOS always returns is_blocked:false for the resumed step.

    Returns True if the step is blocked, False if it may proceed.
    """
    try:
        params: dict = {"task_type": task_type}
        if human_override:
            params["humanOverride"] = "true"
        resp = _http.get(
            f"{AEOS_SERVER_URL}/api/governance/rules/check",
            params=params,
            headers={"Authorization": f"Bearer {ecl_api_key}"},
            timeout=5,
        )
        resp.raise_for_status()
        return resp.json().get("is_blocked", False)
    except Exception as exc:
        print(f"  [AEOS/Resume] Governance check unavailable — defaulting to allow: {exc}")
        return False


def _load_historical_outputs(original_workflow_id: str) -> dict[int, str]:
    """
    Load completed task outputs from a prior (blocked) workflow run.

    Returns a mapping of step_number → agent_output (the text that was fed
    into the next step), so downstream steps can consume prior results
    without re-executing anything.
    """
    tasks = db.get_tasks_by_workflow(original_workflow_id)
    history: dict[int, str] = {}
    for task in tasks:
        meta = task.metadata or {}
        step_num = meta.get("step_number")
        agent_output = meta.get("agent_output", "")
        if step_num is not None and agent_output:
            history[int(step_num)] = agent_output
    return history


def _resolve_agent(step: PipelineStep, agent_pool: dict, input_text: str = None):
    """Mirror of OrchestratorAgent._resolve_agent — kept local to stay decoupled."""
    if step.agent_id and step.agent_id in agent_pool:
        return agent_pool[step.agent_id]

    routed_task_type = None
    if input_text:
        try:
            _ct = input_text.strip()
            if _ct.startswith("```"):
                _ct = _ct.split("\n", 1)[-1]
            if _ct.endswith("```"):
                _ct = _ct.rsplit("```", 1)[0]
            routed_task_type = json.loads(_ct.strip()).get("task_type")
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

    task_type = routed_task_type or step.task_type
    triage = TriageAgent()
    agent = triage.find_agent(task_type, agent_pool)
    if agent is None:
        _, agent = triage.route(step.task_type, agent_pool)
    return agent


def _log_task(
    task_id: str,
    agent_id: str,
    workflow_id: str,
    step: PipelineStep,
    result: TaskResult,
    input_tokens: int,
    output_tokens: int,
    latency_ms: float,
    cost_usd: float,
    quality_score: float = 0.90,
    extra_meta: dict = None,
) -> None:
    now = datetime.utcnow()
    metadata = {
        "step_number": step.step_number,
        "step_name": step.name,
        "timestamp": now.isoformat(),
        "completion_status": result.value,
        "escalation_flag": False,
        "auop_score": None,
        "resumed": True,
    }
    if extra_meta:
        metadata.update(extra_meta)

    task = TaskRecord(
        task_id=task_id,
        agent_id=agent_id,
        workflow_id=workflow_id,
        task_type=step.task_type,
        description=step.name,
        result=result,
        started_at=now,
        completed_at=now,
        latency_ms=latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=input_tokens + output_tokens,
        cost_usd=cost_usd,
        quality_score=quality_score if result == TaskResult.SUCCESS else 0.0,
        metadata=metadata,
    )
    db.insert_task(task)


def _push_ingest_event(
    ecl_api_key: str,
    task_id: str,
    agent_id: str,
    workflow_id: str,
    step: PipelineStep,
) -> None:
    """
    POST a blocked-step observation to the AEOS ingestion endpoint so the
    Team Reviews dashboard receives a new row for this escalated step.
    Failures are logged but never raise — the pipeline must not be blocked by ECL.
    """
    payload = {
        "hyperscaler": "anthropic",
        "raw": {
            "id":    f"evt-{task_id}",
            "model": "unknown",
            "usage": {"input_tokens": 0, "output_tokens": 0},
        },
        "ctx": {
            "agentId":    agent_id,
            "workflowId": workflow_id,
            "skill":      step.task_type,
            "stepIndex":  step.step_number,
            "trigger":    "resume-engine",
            "capturedVia": "fuzebox_python_v2",
            "policyOutcome": "blocked",
            "humanReview":   "queued",
        },
        "qualityConfidence": None,
        "reworkMinutes": 0,
    }
    try:
        resp = _http.post(
            _ECL_ENDPOINT,
            json=payload,
            headers={
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {ecl_api_key}",
            },
            timeout=5,
        )
        resp.raise_for_status()
        print(f"  [Resume/ECL] Ingestion fired for blocked step '{step.name}' "
              f"(workflow={workflow_id}, stepIndex={step.step_number})")
    except Exception as exc:
        print(f"  [Resume/ECL] Ingestion push failed for step '{step.name}': {exc}")


def _run_step_with_override(
    step: PipelineStep,
    workflow_id: str,
    text: str,
    agent_pool: dict,
    scenario: ScenarioConfig,
    ecl_api_key: str,
    human_override: bool = False,
) -> tuple[str, TaskResult, float, str, str]:
    """
    Execute a single pipeline step, optionally bypassing the AEOS gate.

    Returns (task_id, result, cost_usd, agent_id, output_text).
    """
    print(f"  → Step {step.step_number}: '{step.name}' [{step.task_type}]"
          + (" [OVERRIDE]" if human_override else ""))

    agent_instance = _resolve_agent(step, agent_pool, text)
    if agent_instance is None:
        task_id = str(uuid.uuid4())[:12]
        _log_task(task_id, "unknown", workflow_id, step, TaskResult.FAILURE,
                  0, 0, 0.0, 0.0, quality_score=0.0,
                  extra_meta={"escalation_flag": False, "auop_score": 0.0})
        return task_id, TaskResult.FAILURE, 0.0, "unknown", text

    is_blocked = _aeos_governance_check(step.task_type, ecl_api_key, human_override)

    if is_blocked:
        print(f"  [AEOS/Resume] Step '{step.name}' still blocked after override attempt.")
        task_id = str(uuid.uuid4())[:12]
        _log_task(
            task_id, agent_instance.agent_id, workflow_id, step,
            TaskResult.ESCALATED, 0, 0, 0.0, 0.0,
            quality_score=0.0,
            extra_meta={"escalation_flag": True, "auop_score": 0.0,
                        "reason": "Blocked by AEOS even after humanOverride"},
        )
        _push_ingest_event(
            ecl_api_key=ecl_api_key,
            task_id=task_id,
            agent_id=agent_instance.agent_id,
            workflow_id=workflow_id,
            step=step,
        )
        return task_id, TaskResult.ESCALATED, 0.0, agent_instance.agent_id, \
            "Halted by Governance Compliance Gate"

    result_box: dict = {}
    done_event = threading.Event()

    request = {
        "request_id": str(uuid.uuid4())[:8],
        "task_type": step.task_type,
        "customer": "resume-orchestrator",
        "text": text,
        "_callback": lambda r: (result_box.update(r), done_event.set()),
    }

    agent_instance.enqueue(request)
    done_event.wait(timeout=120)

    if not result_box:
        task_id = str(uuid.uuid4())[:12]
        _log_task(task_id, agent_instance.agent_id, workflow_id, step,
                  TaskResult.TIMEOUT, 0, 0, 0.0, 0.0,
                  quality_score=0.0,
                  extra_meta={"escalation_flag": False, "auop_score": 0.0})
        return task_id, TaskResult.TIMEOUT, 0.0, agent_instance.agent_id, text

    task_result = TaskResult(result_box.get("result", "failure"))
    input_tokens = result_box.get("input_tokens", 0)
    output_tokens = result_box.get("output_tokens", 0)
    latency_ms = result_box.get("latency_ms", 0.0)
    output_text = result_box.get("answer", text)
    quality = result_box.get("quality", 0.90)

    step_meta = {
        "agent_output": output_text,
        "confidence_score": result_box.get("confidence_score"),
        "priority": result_box.get("priority"),
        "sentiment_flag": result_box.get("sentiment_flag"),
        "routing_reason": result_box.get("routing_reason"),
        "rationale": result_box.get("rationale"),
        "escalation_flag": False,
        "human_override_applied": human_override,
    }
    auop_score = round(quality / (latency_ms / 1000), 4) if latency_ms > 0 else 0.0
    step_meta["auop_score"] = auop_score

    db_agent = db.get_agent(agent_instance.agent_id)
    if db_agent:
        cost = (input_tokens / 1000 * db_agent.cost_per_1k_input +
                output_tokens / 1000 * db_agent.cost_per_1k_output)
    else:
        cost = (input_tokens / 1000 * 0.0008 + output_tokens / 1000 * 0.004)
    cost = round(cost, 6)

    task_id = str(uuid.uuid4())[:12]
    _log_task(task_id, agent_instance.agent_id, workflow_id, step,
              task_result, input_tokens, output_tokens, latency_ms, cost,
              quality, step_meta)

    return task_id, task_result, cost, agent_instance.agent_id, output_text


# ── Public API ─────────────────────────────────────────────────────────────────

def resume_workflow(
    original_workflow_id: str,
    resume_from_step_index: int,
    agent_pool: dict,
    ecl_api_key: str = "",
) -> Optional[WorkflowRecord]:
    """
    Resume a previously blocked workflow from an arbitrary step index.

    Algorithm:
      1. Look up the original workflow + its scenario from the DB.
      2. Load historical task outputs for steps 0..(resume_from_step_index-1)
         into memory — these are NOT re-executed.
      3. Rebuild the `current_text` cursor by walking the history so the
         resumed step receives the correct upstream input.
      4. Execute steps[resume_from_step_index] with humanOverride:true injected
         into the AEOS check payload.
      5. Execute any remaining steps normally (standard governance checks).
      6. Persist a new WorkflowRecord that references the original workflow.

    Args:
        original_workflow_id:  The workflow_id of the halted run.
        resume_from_step_index: Zero-based index into scenario.pipeline to jump to.
        agent_pool:            Live agent dict (agent_id → BaseAgent).
        ecl_api_key:           Bearer token forwarded to ECL / AEOS endpoints.

    Returns:
        The newly created WorkflowRecord, or None if the original workflow or
        its scenario cannot be found.
    """
    # ── 1. Resolve original workflow + scenario ─────────────────────────────────
    original_workflows = db.get_workflows()
    original_wf: Optional[WorkflowRecord] = next(
        (w for w in original_workflows if w.workflow_id == original_workflow_id),
        None,
    )
    if not original_wf:
        print(f"[Resume] Original workflow not found: {original_workflow_id}")
        return None

    scenario_id = (original_wf.metadata or {}).get("scenario_id")
    if not scenario_id:
        print(f"[Resume] No scenario_id in original workflow metadata: {original_workflow_id}")
        return None

    scenario: Optional[ScenarioConfig] = db.get_scenario(scenario_id)
    if not scenario:
        print(f"[Resume] Scenario not found: {scenario_id}")
        return None

    pipeline = scenario.pipeline
    if resume_from_step_index < 0 or resume_from_step_index >= len(pipeline):
        print(f"[Resume] resume_from_step_index {resume_from_step_index} out of range "
              f"for pipeline of length {len(pipeline)}")
        return None

    print(f"\n[Resume] Resuming workflow '{original_workflow_id}' "
          f"at step index {resume_from_step_index} "
          f"(step_number={pipeline[resume_from_step_index].step_number})")

    # ── 2. Re-hydrate historical step outputs ───────────────────────────────────
    history: dict[int, str] = _load_historical_outputs(original_workflow_id)

    original_input_text = (original_wf.metadata or {}).get("input_text", "")

    # Walk the pipeline up to (but not including) the resume point to build
    # the correct `current_text` cursor from history.
    current_text = original_input_text
    for idx in range(resume_from_step_index):
        step = pipeline[idx]
        if step.step_number in history:
            current_text = history[step.step_number]
            print(f"  [Resume] Step {step.step_number} re-hydrated from DB (not re-executed)")
        else:
            print(f"  [Resume] Step {step.step_number} has no history — using last known text")

    # ── 3. Execute from the resume step forward ─────────────────────────────────
    continuation_workflow_id = str(uuid.uuid4())[:12]
    started_at = datetime.utcnow()
    task_ids: list[str] = []
    agent_ids: set[str] = set()
    total_cost = 0.0
    step_results: list[TaskResult] = []

    for idx in range(resume_from_step_index, len(pipeline)):
        step = pipeline[idx]
        is_resume_step = (idx == resume_from_step_index)

        task_id, result, cost, agent_id, current_text = _run_step_with_override(
            step=step,
            workflow_id=continuation_workflow_id,
            text=current_text,
            agent_pool=agent_pool,
            scenario=scenario,
            ecl_api_key=ecl_api_key,
            human_override=is_resume_step,
        )
        task_ids.append(task_id)
        agent_ids.add(agent_id)
        step_results.append(result)
        total_cost += cost

        if result == TaskResult.FAILURE:
            print(f"  [Resume] Step '{step.name}' failed — aborting continuation.")
            break

        if result == TaskResult.ESCALATED:
            print(f"  [Resume] Step '{step.name}' escalated — stopping continuation.")
            break

    # ── 4. Determine overall continuation result ────────────────────────────────
    if TaskResult.ESCALATED in step_results:
        wf_result = TaskResult.ESCALATED
    elif all(r == TaskResult.SUCCESS for r in step_results):
        wf_result = TaskResult.SUCCESS
    elif any(r == TaskResult.FAILURE for r in step_results):
        wf_result = TaskResult.FAILURE
    else:
        wf_result = TaskResult.PARTIAL

    # ── 5. Persist continuation WorkflowRecord ──────────────────────────────────
    continuation_meta = {
        "scenario_id": scenario_id,
        "input_text": current_text,
        "resumed_from_workflow_id": original_workflow_id,
        "resume_from_step_index": resume_from_step_index,
        "resumed_at": datetime.utcnow().isoformat(),
    }

    continuation_wf = WorkflowRecord(
        workflow_id=continuation_workflow_id,
        name=f"{scenario.name} [Resumed]",
        description=scenario.description,
        agent_ids=list(agent_ids),
        task_ids=task_ids,
        started_at=started_at,
        completed_at=datetime.utcnow(),
        result=wf_result,
        total_cost_usd=round(total_cost, 6),
        metadata=continuation_meta,
    )
    db.insert_workflow(continuation_wf)

    print(
        f"[Resume] Continuation workflow {continuation_workflow_id} complete — "
        f"{wf_result.value}, ${total_cost:.4f}"
    )
    return continuation_wf
