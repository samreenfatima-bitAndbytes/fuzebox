"""Run Review data layer (API)."""

from __future__ import annotations

import json
from statistics import mean
from typing import Any, Optional

from . import db, economics


def _mean_or_zero(values: list[float]) -> float:
    return float(mean(values)) if values else 0.0


def build_agent_telemetry() -> list[dict]:
    """Per-agent aggregates for the telemetry tab."""
    all_agents = db.get_all_agents()
    all_tasks = db.get_tasks()
    rows: list[dict] = []

    for agent in all_agents:
        a_tasks = [t for t in all_tasks if t.agent_id == agent.agent_id]
        if not a_tasks:
            continue
        total = len(a_tasks)
        success = sum(1 for t in a_tasks if t.result.value == "success")
        esc_count = sum(
            1 for t in a_tasks if (t.metadata or {}).get("escalation_flag")
        )
        latencies = [t.latency_ms for t in a_tasks if t.latency_ms]
        qualities = [t.quality_score for t in a_tasks if t.quality_score is not None]
        auops = [
            float((t.metadata or {}).get("auop_score", 0))
            for t in a_tasks
            if (t.metadata or {}).get("auop_score")
        ]
        rows.append({
            "agent_id": agent.agent_id,
            "name": agent.name,
            "group": agent.group,
            "total": total,
            "completion_rate": success / total,
            "escalation_rate": esc_count / total,
            "accuracy": _mean_or_zero(qualities),
            "avg_latency_ms": _mean_or_zero(latencies),
            "avg_auop": _mean_or_zero(auops),
        })

    rows.sort(key=lambda r: r["name"])
    return rows


def _workflow_run_row(wf) -> dict:
    meta = wf.metadata or {}
    input_text = str(meta.get("input_text") or "")
    preview = (input_text[:100] + "…") if len(input_text) > 100 else (input_text or "—")
    is_esc = bool(meta.get("escalated"))
    scenario_id = meta.get("scenario_id")
    is_v2_tuned = scenario_id == "v2-tuned-pipeline"

    if is_esc:
        outcome = "escalated"
    else:
        outcome = wf.result.value

    return {
        "workflow_id": wf.workflow_id,
        "started_at": wf.started_at.isoformat(),
        "started_label": wf.started_at.strftime("%b %d · %H:%M"),
        "result": wf.result.value,
        "outcome": outcome,
        "escalated": is_esc,
        "input_text": input_text,
        "preview": preview,
        "scenario_id": scenario_id,
        "is_v2_tuned": is_v2_tuned,
        "pill_label": "Tuned" if is_v2_tuned else "Untuned",
    }


def build_run_list(limit: int = 200) -> list[dict]:
    workflows = sorted(db.get_workflows(), key=lambda w: w.started_at, reverse=True)
    return [_workflow_run_row(wf) for wf in workflows[:limit]]


def _task_step_row(task) -> dict:
    meta = task.metadata or {}
    return {
        "step_number": meta.get("step_number"),
        "step_name": meta.get("step_name", task.task_type),
        "agent_id": task.agent_id,
        "result": task.result.value,
        "latency_ms": int(task.latency_ms or 0),
        "total_tokens": int(task.total_tokens or 0),
        "cost_usd": float(task.cost_usd or 0),
        "escalation_flag": bool(meta.get("escalation_flag")),
        "confidence_score": meta.get("confidence_score"),
        "priority": meta.get("priority"),
        "auop_score": meta.get("auop_score"),
        "agent_output": meta.get("agent_output"),
        "agent_output_json": json.dumps(meta.get("agent_output"), default=str)
        if meta.get("agent_output") is not None
        else "",
    }


def _get_v2_tune_defaults() -> dict:
    scenario = db.get_scenario("v2-tuned-pipeline")
    v2_meta = (scenario.metadata if scenario else {}) or {}
    ap = v2_meta.get("agent_params", {})
    p1 = ap.get("agent-intake-classifier-01", {})
    p2 = ap.get("agent-triage-scorer-01", {})
    p3 = ap.get("response_drafter", {})

    return {
        "confidence_threshold": float(
            p1.get("confidence_threshold", v2_meta.get("confidence_threshold", 0.70))
        ),
        "prompt_precision": p1.get("prompt_precision", v2_meta.get("prompt_precision", "standard")),
        "sentiment_weight": float(
            p2.get("sentiment_weight", v2_meta.get("sentiment_weight", 0.50))
        ),
        "data_prefetch": bool(p2.get("data_prefetch", v2_meta.get("data_prefetch", True))),
        "tone_variant": p3.get("tone_variant", v2_meta.get("tone_variant", "formal")),
        "fallback_depth": int(p3.get("fallback_depth", v2_meta.get("fallback_depth", 1))),
    }


def _latest_v2_for_workflow(sel_id: str):
    all_v2 = [
        w
        for w in db.get_workflows()
        if (w.metadata or {}).get("scenario_id") == "v2-tuned-pipeline"
        and (w.metadata or {}).get("original_workflow_id") == sel_id
    ]
    if not all_v2:
        return None
    return sorted(all_v2, key=lambda w: w.started_at, reverse=True)[0]


def _build_compare_from_v2_workflow(latest_v2) -> Optional[dict]:
    if not latest_v2:
        return None
    v2_tasks = db.get_tasks_by_workflow(latest_v2.workflow_id)
    meta = latest_v2.metadata or {}
    steps = []
    for t in v2_tasks:
        m = t.metadata or {}
        steps.append({
            "step": m.get("step_number"),
            "step_name": m.get("step_name"),
            "agent_id": t.agent_id,
            "result": t.result.value,
            "latency_ms": t.latency_ms,
            "confidence_score": m.get("confidence_score"),
            "escalation_flag": bool(m.get("escalation_flag")),
        })
    return {
        "status": latest_v2.result.value,
        "escalated": meta.get("escalated", False),
        "escalation_reason": meta.get("escalation_reason"),
        "total_cost_usd": latest_v2.total_cost_usd,
        "steps": steps,
        "from_db": True,
        "ran_at": latest_v2.started_at.strftime("%Y-%m-%d %H:%M UTC"),
        "workflow_id": latest_v2.workflow_id,
    }


def build_workflow_studio(workflow_id: str) -> Optional[dict]:
    workflows = db.get_workflows()
    wf = next((w for w in workflows if w.workflow_id == workflow_id), None)
    if not wf:
        return None

    meta = wf.metadata or {}
    tasks = db.get_tasks_by_workflow(workflow_id)
    telemetry_map = {t["agent_id"]: t for t in build_agent_telemetry()}

    total_latency = sum(t.latency_ms or 0 for t in tasks)
    total_tokens = sum(t.total_tokens or 0 for t in tasks)
    is_escalated_v1 = bool(meta.get("escalated"))
    avg_conf = next(
        (
            float(t.metadata["confidence_score"])
            for t in tasks
            if (t.metadata or {}).get("confidence_score") is not None
        ),
        None,
    )

    latest_v2 = _latest_v2_for_workflow(workflow_id)
    v2_tasks_detail = []
    if latest_v2:
        v2_tasks_detail = [
            _task_step_row(t) for t in db.get_tasks_by_workflow(latest_v2.workflow_id)
        ]

    step1 = [t for t in tasks if (t.metadata or {}).get("step_number") == 1]
    step2 = [t for t in tasks if (t.metadata or {}).get("step_number") == 2]
    step3 = [t for t in tasks if (t.metadata or {}).get("step_number") == 3]

    step1_conf = next(
        (
            float((t.metadata or {}).get("confidence_score", 0))
            for t in step1
            if (t.metadata or {}).get("confidence_score") is not None
        ),
        None,
    )
    step2_priority = next(
        (
            (t.metadata or {}).get("priority")
            for t in step2
            if (t.metadata or {}).get("priority") is not None
        ),
        None,
    )

    intake_aid = next((t.agent_id for t in step1), None)
    triage_aid = next((t.agent_id for t in step2), None)
    drafter = step3[0] if step3 else None

    return {
        "workflow_id": workflow_id,
        "workflow_id_short": workflow_id[:20] + "…",
        "scenario_id": meta.get("scenario_id"),
        "started_at": wf.started_at.isoformat(),
        "started_label": wf.started_at.strftime("%Y-%m-%d %H:%M UTC"),
        "input_text": meta.get("input_text", ""),
        "escalated": is_escalated_v1,
        "result": wf.result.value,
        "total_latency_ms": round(total_latency, 1),
        "total_tokens": int(total_tokens),
        "total_cost_usd": float(wf.total_cost_usd or 0),
        "avg_confidence": avg_conf,
        "steps_overview": [_task_step_row(t) for t in tasks],
        "v1_steps": [_task_step_row(t) for t in tasks],
        "v2_steps": v2_tasks_detail,
        "latest_v2_workflow_id": latest_v2.workflow_id if latest_v2 else None,
        "compare": _build_compare_from_v2_workflow(latest_v2),
        "tune_defaults": _get_v2_tune_defaults(),
        "tune_signals": {
            "step1": {
                "confidence": step1_conf,
                "escalated": any(
                    (t.metadata or {}).get("escalation_flag") for t in step1
                ),
                "agent_telemetry": telemetry_map.get(intake_aid) if intake_aid else None,
            },
            "step2": {
                "priority": step2_priority,
                "agent_telemetry": telemetry_map.get(triage_aid) if triage_aid else None,
            },
            "step3": {
                "agent_id": drafter.agent_id if drafter else None,
                "auop_score": (drafter.metadata or {}).get("auop_score")
                if drafter
                else None,
                "agent_telemetry": telemetry_map.get(drafter.agent_id)
                if drafter
                else None,
            },
        },
        "rop": {
            "v1": economics.rop_score("v1-baseline-pipeline"),
            "v2": economics.rop_score("v2-tuned-pipeline"),
        },
    }


def build_run_review_summary() -> dict:
    return {
        "runs": build_run_list(),
        "telemetry": build_agent_telemetry(),
    }
