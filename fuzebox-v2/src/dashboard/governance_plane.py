"""Governance plane — oversight gaps, rules, violations (AEOS parity)."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional

from . import db

TIER_RISK: dict[str, str] = {
    "T0_unverified": "HIGH",
    "T0_probation": "HIGH",
    "T1_observed": "HIGH",
    "T2_supervised": "MEDIUM",
    "T2_verified": "MEDIUM",
    "T3_trusted": "LOW",
    "T3_autonomous": "LOW",
    "T4_autonomous": "LOW",
}

TRUST_LABELS = (
    "T0_unverified",
    "T1_observed",
    "T2_verified",
    "T3_trusted",
    "T4_autonomous",
)


def _trust_tier_label(level: int) -> str:
    idx = min(max(int(level or 0), 0), len(TRUST_LABELS) - 1)
    return TRUST_LABELS[idx]


def _human_review(event: dict) -> str:
    payload = _event_payload(event)
    ctx = payload.get("ctx") or {}
    return str(
        ctx.get("humanReview") or payload.get("humanReview") or "auto"
    ).lower()


def _event_payload(event: dict) -> dict:
    payload = event.get("raw_payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            return {}
    return payload if isinstance(payload, dict) else {}


def _skill(event: dict) -> str:
    """Resolve workforce skill — matches AEOS canonicalEvents.skill semantics."""
    payload = _event_payload(event)
    ctx = payload.get("ctx") or {}
    # Task-derived events store the real skill in payload.task_type while
    # source_event_type stays "task_completion".
    return str(
        ctx.get("skill")
        or payload.get("task_type")
        or payload.get("skill")
        or event.get("source_event_type")
        or "unknown"
    )


def _confidence(event: dict) -> float:
    payload = _event_payload(event)
    val = payload.get("qualityConfidence") or event.get("quality_score") or 0
    try:
        f = float(val)
    except (TypeError, ValueError):
        return 0.0
    return f / 100.0 if f > 1.0 else f


def build_governance_gaps(days: int = 30) -> list[dict[str, Any]]:
    now = datetime.utcnow()
    start = now - timedelta(days=max(1, days))
    events = db.get_canonical_events(start_date=start, end_date=now, limit=5000)
    agents = {a.agent_id: a for a in db.get_all_agents()}
    ruled = {
        r["taskType"]
        for r in db.list_governance_rules()
        if r.get("isActive")
    }

    grouped: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"total": 0, "auto": 0, "confidence": []}
    )
    for event in events:
        key = (event.get("agent_id") or "unknown", _skill(event))
        grouped[key]["total"] += 1
        if _human_review(event) == "auto":
            grouped[key]["auto"] += 1
        grouped[key]["confidence"].append(_confidence(event))

    gaps: list[dict[str, Any]] = []
    for (agent_id, skill), stats in grouped.items():
        total = stats["total"]
        if total <= 0:
            continue
        auto_rate = stats["auto"] / total
        if auto_rate < 0.80:
            continue
        agent = agents.get(agent_id)
        tier = _trust_tier_label(agent.trust_level if agent else 2)
        avg_conf = (
            sum(stats["confidence"]) / len(stats["confidence"])
            if stats["confidence"]
            else 0.0
        )
        risk = TIER_RISK.get(tier) or (
            "HIGH" if auto_rate >= 0.95 else "MEDIUM" if auto_rate >= 0.85 else "LOW"
        )
        gaps.append(
            {
                "agentId": agent_id,
                "agentName": agent.name if agent else agent_id,
                "skill": skill,
                "trustTier": tier,
                "totalDecisions": total,
                "autoRate": round(auto_rate, 4),
                "avgConfidence": round(avg_conf, 4),
                "riskLevel": risk,
                "hasRule": skill in ruled,
            }
        )

    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
    gaps.sort(key=lambda g: (order.get(g["riskLevel"], 9), -g["totalDecisions"]))
    return gaps


def build_gaps_coverage(days: int = 30) -> list[dict[str, Any]]:
    gaps = build_governance_gaps(days)
    gap_skills = {g["skill"] for g in gaps}
    rules = db.list_governance_rules()
    rule_counts: dict[str, int] = defaultdict(int)
    for rule in rules:
        if rule.get("isActive"):
            rule_counts[rule["taskType"]] += 1

    now = datetime.utcnow()
    start = now - timedelta(days=max(1, days))
    events = db.get_canonical_events(start_date=start, end_date=now, limit=5000)
    skill_counts: dict[str, int] = defaultdict(int)
    for event in events:
        skill_counts[_skill(event)] += 1

    processes = sorted(set(skill_counts) | set(rule_counts))
    return [
        {
            "process": proc,
            "gates": rule_counts.get(proc, 0),
            "decisionsPerWeek": skill_counts.get(proc, 0),
            "gapCount": 1 if proc in gap_skills else 0,
        }
        for proc in processes
    ]


def build_governance_violations(limit: int = 100) -> list[dict[str, Any]]:
    events = db.get_canonical_events(limit=max(1, min(limit, 500)))
    rules = {r["id"]: r for r in db.list_governance_rules()}
    rows: list[dict[str, Any]] = []

    for event in events:
        payload = event.get("raw_payload") or {}
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}
        ctx = payload.get("ctx") or {}
        policy = str(
            ctx.get("policyOutcome") or payload.get("policyOutcome") or ""
        ).lower()
        passed = bool(event.get("passed_thresholds", True))
        if policy not in ("violated", "blocked") and passed:
            continue
        policy_id = str(ctx.get("policyId") or payload.get("policyId") or "")
        rule = rules.get(policy_id)
        received = event.get("received_at")
        captured = (
            received.isoformat()
            if isinstance(received, datetime)
            else str(received or "")
        )
        rows.append(
            {
                "eventId": event.get("event_id") or "",
                "capturedAt": captured,
                "agentId": event.get("agent_id") or "",
                "skill": _skill(event),
                "policyId": policy_id or None,
                "policyOutcome": policy or None,
                "passedThresholds": passed,
                "workflowId": event.get("workflow_id"),
                "ruleName": rule.get("name") if rule else None,
                "ruleDescription": rule.get("description") if rule else None,
                "ruleTaskType": rule.get("taskType") if rule else None,
                "ruleReferenceCode": rule.get("referenceCode") if rule else None,
            }
        )
    return rows[:limit]
