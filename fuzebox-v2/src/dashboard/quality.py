"""Quality dashboard data layer (API)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from . import db
from .gsti import compute_fleet_avg_gsti
from .models import TaskRecord, TaskResult


def _human_duration_from_ms(latency_ms: float | None) -> str:
    if not latency_ms or latency_ms <= 0:
        return "0m"
    total_minutes = int(round(latency_ms / 60000))
    if total_minutes < 60:
        return f"{total_minutes}m"
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours}h {minutes}m" if minutes else f"{hours}h"


def _status_chip(task: Any) -> str:
    result = str(getattr(task, "result", "")).lower()
    if "success" in result or "partial" in result:
        return "Completed"
    if "failure" in result or "timeout" in result or "escalated" in result:
        return "Failed"
    return "Running"


def _estimate_time_saved_minutes(row: dict) -> int:
    # Simple deterministic estimate: manual baseline (22m) minus observed duration.
    baseline = 22
    duration_min = max(1, int(round((row.get("latency_ms") or 0) / 60000)))
    return max(0, baseline - duration_min)


def build_quality_task_rows(days: int = 30) -> list[dict]:
    """Task rows for Quality dashboard API."""
    now = datetime.utcnow()
    start = now - timedelta(days=max(1, days))
    tasks = db.get_tasks(start_date=start, end_date=now)
    agent_names = {a.agent_id: a.name for a in db.get_all_agents()}
    rows: list[dict] = []
    for task in tasks:
        meta = task.metadata or {}
        started_at = task.started_at or now
        display_agent = agent_names.get(task.agent_id) or str(
            meta.get("agent_display_name") or task.agent_id
        )
        rows.append(
            {
                "agent": display_agent,
                "task": task.description or task.task_type,
                "status": _status_chip(task),
                "latency_ms": task.latency_ms or 0.0,
                "duration": _human_duration_from_ms(task.latency_ms),
                "time_saved_m": _estimate_time_saved_minutes({"latency_ms": task.latency_ms}),
                "timestamp_dt": started_at,
                "timestamp": started_at.strftime("%Y-%m-%d %H:%M UTC"),
                "quality_score": float(task.quality_score or 0.0),
                "task_type": task.task_type,
                "source_event_type": str(meta.get("source_event_type", "")),
                "task_id": task.task_id,
                "can_run": str(task.result.value).lower() == "pending"
                and str(meta.get("source_event_type", "")) == "operator_task",
            }
        )
    return rows


def operator_task_webhook_text(task: TaskRecord) -> str:
    """Build webhook body text from a queued operator task."""
    meta = task.metadata or {}
    agent_label = str(meta.get("agent_display_name") or task.agent_id)
    lines = [f"Operator task for {agent_label}", f"Capability: {task.task_type}"]
    if meta.get("user_id"):
        lines.append(f"User: {meta['user_id']}")
    if meta.get("team_id"):
        lines.append(f"Team: {meta['team_id']}")
    if meta.get("channel"):
        lines.append(f"Channel: {meta['channel']}")
    if task.description:
        lines.append("", task.description)
    return "\n".join(lines)


def operator_task_webhook_metadata(task: TaskRecord) -> dict[str, Any]:
    """Metadata for dispatching a queued operator task through the webhook router."""
    meta = dict(task.metadata or {})
    meta["source"] = "quality-create-task"
    meta["operator_task"] = True
    meta["agent_id"] = task.agent_id
    meta["agent_name"] = str(meta.get("agent_display_name") or task.agent_id)
    meta["capability"] = task.task_type
    meta["queued_task_id"] = task.task_id
    return meta


def resolve_agent_id(agent_name: str) -> str:
    needle = agent_name.strip().lower()
    if not needle:
        return "operator-task"
    for agent in db.get_all_agents():
        if agent.name.strip().lower() == needle:
            return agent.agent_id
    return agent_name.strip()


def create_operator_task(
    *,
    agent_name: str,
    capability: str,
    message: str = "",
    channel: str = "",
    user_id: str = "",
    team_id: str = "",
    platform: str = "",
) -> TaskRecord:
    """Queue an operator-created task (shown as Running in Quality until executed)."""
    agent_id = resolve_agent_id(agent_name)
    task_id = f"op-{uuid.uuid4().hex[:10]}"
    now = datetime.utcnow()

    desc_parts: list[str] = []
    if channel.strip():
        desc_parts.append(channel.strip())
    if message.strip():
        desc_parts.append(message.strip())
    description = " · ".join(desc_parts) if desc_parts else (capability or "Operator task")

    metadata: dict[str, Any] = {
        "source": "quality_create_task",
        "source_event_type": "operator_task",
        "capability": capability,
        "agent_display_name": agent_name,
    }
    if channel.strip():
        metadata["channel"] = channel.strip()
    if user_id.strip():
        metadata["user_id"] = user_id.strip()
    if team_id.strip():
        metadata["team_id"] = team_id.strip()
    if platform.strip():
        metadata["platform"] = platform.strip()

    task = TaskRecord(
        task_id=task_id,
        agent_id=agent_id,
        task_type=capability or "operator_task",
        description=description[:500],
        result=TaskResult.PENDING,
        started_at=now,
        completed_at=None,
        latency_ms=None,
        quality_score=None,
        metadata=metadata,
    )
    db.insert_task(task)
    return task


def build_quality_kpis(rows: list[dict], *, days: int = 30) -> dict:
    """Aggregate KPIs from task rows."""
    total = len(rows)
    avg_gsti = compute_fleet_avg_gsti(days)
    if total == 0:
        return {
            "total": 0,
            "completed": 0,
            "failed": 0,
            "running": 0,
            "completed_pct": 0.0,
            "failed_pct": 0.0,
            "time_saved_hours": 0.0,
            "avg_gsti": avg_gsti,
        }
    completed = sum(1 for r in rows if r["status"] == "Completed")
    failed = sum(1 for r in rows if r["status"] == "Failed")
    running = sum(1 for r in rows if r["status"] == "Running")
    total_saved_m = sum(r["time_saved_m"] for r in rows)
    return {
        "total": total,
        "completed": completed,
        "failed": failed,
        "running": running,
        "completed_pct": round(completed / total * 100, 1),
        "failed_pct": round(failed / total * 100, 1),
        "time_saved_hours": round(total_saved_m / 60, 1),
        "avg_gsti": avg_gsti,
    }
