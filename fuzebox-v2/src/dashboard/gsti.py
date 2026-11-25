"""Fleet GSTI — Governance, Safety & Trust Index (0–100).

GSTI is a fleet-level trust/governance health score, distinct from per-task
quality_score (QSI). Components align with AEOS Cognition Plane semantics:

  - Trust (40%): agent trust tier T0–T4 from the registry
  - Governance (35%): human review outcomes + policy gates on canonical events
  - Safety (25%): task success / threshold pass rate in the window
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from . import db

# T-tier anchor scores (Patent Family 5 ladder).
_TRUST_GSTI: dict[int, float] = {
    0: 30.0,
    1: 50.0,
    2: 65.0,
    3: 82.0,
    4: 95.0,
}

_WEIGHT_TRUST = 0.40
_WEIGHT_GOV = 0.35
_WEIGHT_SAFETY = 0.25


def _normalize_trust_level(level: int) -> int:
    return max(0, min(4, int(level or 0)))


def trust_component(trust_level: int) -> float:
    return _TRUST_GSTI[_normalize_trust_level(trust_level)]


def _event_ctx(event: dict[str, Any]) -> dict[str, Any]:
    payload = event.get("raw_payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = {}
    if not isinstance(payload, dict):
        payload = {}
    ctx = payload.get("ctx") or {}
    return ctx if isinstance(ctx, dict) else {}


def _event_human_review(event: dict[str, Any]) -> str:
    ctx = _event_ctx(event)
    payload = event.get("raw_payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = {}
    raw = (
        ctx.get("humanReview")
        or (payload.get("humanReview") if isinstance(payload, dict) else None)
        or ""
    )
    return str(raw).lower()


def _event_policy_outcome(event: dict[str, Any]) -> str:
    ctx = _event_ctx(event)
    payload = event.get("raw_payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = {}
    raw = (
        ctx.get("policyOutcome")
        or (payload.get("policyOutcome") if isinstance(payload, dict) else None)
        or ""
    )
    return str(raw).lower()


def governance_component(events: list[dict[str, Any]]) -> float:
    """Derive governance health from review + policy telemetry."""
    if not events:
        return 70.0

    verified = rejected = pending = 0
    allowed = blocked = gated = 0
    passed = 0

    for event in events:
        hr = _event_human_review(event)
        if hr == "verified":
            verified += 1
        elif hr == "rejected":
            rejected += 1
        elif hr in ("queued", "pending", "flagged"):
            pending += 1

        po = _event_policy_outcome(event)
        if po == "allowed":
            allowed += 1
            gated += 1
        elif po in ("blocked", "human_gate"):
            if po == "blocked":
                blocked += 1
            gated += 1

        if event.get("passed_thresholds", True):
            passed += 1

    parts: list[float] = []

    decided = verified + rejected
    if decided:
        parts.append(verified / decided * 100.0)

    if gated:
        parts.append(allowed / gated * 100.0)

    if events:
        parts.append(passed / len(events) * 100.0)

    base = sum(parts) / len(parts) if parts else 70.0
    if pending and len(events):
        pending_ratio = pending / len(events)
        base = max(0.0, base - pending_ratio * 12.0)
    return max(0.0, min(100.0, base))


def safety_component(
    *,
    completed: int,
    failed: int,
    total: int,
    passed_events: int,
    event_runs: int,
) -> float:
    """Execution safety from tasks and canonical threshold passes."""
    parts: list[float] = []
    if total > 0:
        success_rate = completed / total
        failure_rate = failed / total
        parts.append(max(0.0, success_rate * 100.0 - failure_rate * 10.0))
    if event_runs > 0:
        parts.append(passed_events / event_runs * 100.0)
    if not parts:
        return 70.0
    return max(0.0, min(100.0, sum(parts) / len(parts)))


def agent_gsti(
    *,
    trust_level: int,
    events: list[dict[str, Any]],
    completed: int,
    failed: int,
    total: int,
) -> float:
    trust = trust_component(trust_level)
    gov = governance_component(events)
    passed = sum(1 for e in events if e.get("passed_thresholds", True))
    safety = safety_component(
        completed=completed,
        failed=failed,
        total=total,
        passed_events=passed,
        event_runs=len(events),
    )
    score = _WEIGHT_TRUST * trust + _WEIGHT_GOV * gov + _WEIGHT_SAFETY * safety
    return round(max(0.0, min(100.0, score)), 1)


def compute_fleet_avg_gsti(days: int = 30) -> float:
    """Run-weighted fleet GSTI across registered agents."""
    now = datetime.utcnow()
    start = now - timedelta(days=max(1, days))
    agents = db.get_all_agents()
    if not agents:
        return 0.0

    events = db.get_canonical_events(start_date=start, end_date=now, limit=5000)
    tasks = db.get_tasks(start_date=start, end_date=now)

    events_by_agent: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        aid = str(event.get("agent_id") or "")
        if aid:
            events_by_agent[aid].append(event)

    task_stats: dict[str, dict[str, int]] = defaultdict(
        lambda: {"total": 0, "completed": 0, "failed": 0},
    )
    for task in tasks:
        aid = task.agent_id or ""
        if not aid:
            continue
        task_stats[aid]["total"] += 1
        result = str(task.result.value).lower()
        if "success" in result or "partial" in result:
            task_stats[aid]["completed"] += 1
        elif "failure" in result or "timeout" in result or "escalated" in result:
            task_stats[aid]["failed"] += 1

    weighted_sum = 0.0
    weight_total = 0.0
    for agent in agents:
        aid = agent.agent_id
        ev = events_by_agent.get(aid, [])
        ts = task_stats.get(aid, {"total": 0, "completed": 0, "failed": 0})
        runs = max(len(ev), int(ts["total"]))
        weight = max(1, runs) if runs > 0 else 0
        if weight == 0:
            continue
        score = agent_gsti(
            trust_level=int(agent.trust_level or 0),
            events=ev,
            completed=int(ts["completed"]),
            failed=int(ts["failed"]),
            total=int(ts["total"]),
        )
        weighted_sum += score * weight
        weight_total += weight

    if weight_total <= 0:
        # No telemetry — fall back to trust ladder average for registered agents.
        trust_only = [trust_component(int(a.trust_level or 0)) for a in agents]
        return round(sum(trust_only) / len(trust_only), 1)

    return round(weighted_sum / weight_total, 1)
