"""Workflow traces data layer (API)."""

from __future__ import annotations

import json
import uuid
from typing import Optional

from . import db
from .models import SpanRecord, TaskRecord, TaskResult


def spans_from_tasks(
    workflow_id: str,
    tasks: list[TaskRecord],
    trace_id: Optional[str] = None,
) -> list[SpanRecord]:
    """Build a parent-chain span tree from workflow step tasks."""
    if not tasks:
        return []

    trace_id = trace_id or str(uuid.uuid4())[:16]
    tasks_sorted = sorted(tasks, key=lambda t: t.started_at)
    spans: list[SpanRecord] = []
    parent_span_id: Optional[str] = None

    for task in tasks_sorted:
        meta = task.metadata or {}
        step_num = meta.get("step_number")
        step_name = meta.get("step_name", task.task_type)
        operation = (
            f"Step {step_num} — {step_name}"
            if step_num is not None
            else str(step_name)
        )
        escalated = bool(meta.get("escalation_flag"))
        is_error = (
            escalated
            or task.result in (TaskResult.FAILURE, TaskResult.TIMEOUT, TaskResult.ESCALATED)
        )
        ended = task.completed_at or task.started_at

        span = SpanRecord(
            trace_id=trace_id,
            span_id=str(uuid.uuid4())[:12],
            parent_span_id=parent_span_id,
            agent_id=task.agent_id,
            operation=operation,
            started_at=task.started_at,
            ended_at=ended,
            duration_ms=float(task.latency_ms or 0),
            status="ERROR" if is_error else "OK",
            attributes={
                "workflow_id": workflow_id,
                "task_id": task.task_id,
                "step_number": step_num,
                "step_name": step_name,
                "result": task.result.value,
                "escalation_flag": escalated,
            },
        )
        spans.append(span)
        parent_span_id = span.span_id

    return spans


def backfill_spans_from_workflows() -> dict:
    """Create spans for workflows that have tasks but no trace yet."""
    existing_traces = set(db.get_unique_trace_ids(limit=10_000))
    workflows = db.get_workflows()
    workflows_touched = 0
    spans_inserted = 0

    for wf in workflows:
        meta = wf.metadata or {}
        trace_id = meta.get("trace_id") or wf.workflow_id
        if trace_id in existing_traces:
            continue

        tasks = db.get_tasks_by_workflow(wf.workflow_id)
        if not tasks:
            continue

        for span in spans_from_tasks(wf.workflow_id, tasks, trace_id=trace_id):
            db.insert_span(span)
            spans_inserted += 1

        existing_traces.add(trace_id)
        workflows_touched += 1

    return {
        "workflows": workflows_touched,
        "spans": spans_inserted,
        "trace_ids": len(existing_traces),
    }


def build_trace_id_list(limit: int = 50) -> list[str]:
    return db.get_unique_trace_ids(limit=limit)


def build_trace_detail(trace_id: str) -> Optional[dict]:
    spans = db.get_spans(trace_id=trace_id)
    if not spans:
        return None

    agent_map = {a.agent_id: a.name for a in db.get_all_agents()}
    spans_sorted = sorted(spans, key=lambda s: s.started_at)
    min_time = min(s.started_at for s in spans_sorted)
    span_ids = {s.span_id for s in spans_sorted}

    rows: list[dict] = []
    max_end_ms = 0.0
    for span in spans_sorted:
        start_offset_ms = (span.started_at - min_time).total_seconds() * 1000
        duration_ms = float(span.duration_ms or 0)
        end_ms = start_offset_ms + duration_ms
        max_end_ms = max(max_end_ms, end_ms)

        depth = 0
        if span.parent_span_id and span.parent_span_id in span_ids:
            depth = 1
            parent = next(
                (s for s in spans_sorted if s.span_id == span.parent_span_id),
                None,
            )
            if parent and parent.parent_span_id:
                depth = 2

        label = span.operation
        if depth == 0:
            label = f"[{agent_map.get(span.agent_id, span.agent_id)}] {label}"

        rows.append({
            "span_id": span.span_id,
            "parent_span_id": span.parent_span_id,
            "operation": span.operation,
            "label": label,
            "agent_id": span.agent_id,
            "agent_name": agent_map.get(span.agent_id, span.agent_id),
            "duration_ms": round(duration_ms, 1),
            "start_offset_ms": round(start_offset_ms, 1),
            "status": span.status,
            "depth": depth,
            "attributes": span.attributes or {},
            "attributes_json": json.dumps(span.attributes or {}, default=str),
            "started_at": span.started_at.isoformat(),
        })

    agents_in_trace = {s.agent_id for s in spans}
    root_duration = sum(s.duration_ms or 0 for s in spans if s.parent_span_id is None)
    errors = sum(1 for s in spans if s.status == "ERROR")

    return {
        "trace_id": trace_id,
        "span_count": len(spans),
        "agent_count": len(agents_in_trace),
        "root_duration_ms": round(float(root_duration), 1),
        "error_count": errors,
        "timeline_max_ms": round(max_end_ms, 1),
        "spans": rows,
    }
