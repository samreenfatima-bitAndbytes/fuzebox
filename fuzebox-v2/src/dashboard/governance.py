"""Team reviews / governance metrics (ECL-compatible shape)."""

from __future__ import annotations

import json
import os
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional

import requests

from . import db

TRUST_TIER_LABELS = (
    "T0_unverified",
    "T1_observed",
    "T2_verified",
    "T3_trusted",
)


def _governance_base_url() -> str:
    return (os.getenv("ECL_API_URL") or os.getenv("GOVERNANCE_API_URL") or "").strip().rstrip("/")


def _governance_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    key = (os.getenv("ECL_API_KEY") or "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _trust_tier_label(trust_level: int) -> str:
    idx = min(max(int(trust_level or 0), 0), len(TRUST_TIER_LABELS) - 1)
    return TRUST_TIER_LABELS[idx]


def _iso_captured_at(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat().replace("+00:00", "Z")
    return str(value or "")


def event_to_review_row(event: dict) -> dict[str, Any] | None:
    """Map a canonical event to a governance review queue row."""
    payload = event.get("raw_payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = {}
    ctx = payload.get("ctx") or {}
    human_review = (
        ctx.get("humanReview")
        or payload.get("humanReview")
        or ""
    )
    hr_lower = str(human_review).lower()
    if hr_lower in ("none", ""):
        policy = str(
            ctx.get("policyOutcome") or payload.get("policyOutcome") or ""
        ).lower()
        if policy in ("blocked", "human_gate") or not event.get("passed_thresholds", True):
            human_review = "pending"
            hr_lower = "pending"
        else:
            return None
    if hr_lower == "auto":
        return None

    skill = str(ctx.get("skill") or event.get("source_event_type") or "unknown")
    confidence = payload.get("qualityConfidence")
    if confidence is None:
        confidence = event.get("quality_score")
    if confidence is None:
        confidence = 0.0
    confidence = float(confidence)
    if confidence > 1.0:
        confidence = confidence / 100.0

    return {
        "eventId": event.get("event_id") or "",
        "agentId": event.get("agent_id") or "unknown",
        "skill": skill,
        "confidence": confidence,
        "humanReview": str(human_review),
        "policyOutcome": str(ctx.get("policyOutcome") or payload.get("policyOutcome") or "blocked"),
        "trustTier": str(ctx.get("trustTier") or _trust_tier_label(event.get("trust_level", 0))),
        "capturedAt": _iso_captured_at(event.get("received_at")),
        "humanUserId": str(ctx.get("humanUserId") or "1"),
        "reviewerName": str(ctx.get("reviewerName") or "Operations"),
    }


def build_reviews_from_events(days: int = 30, limit: int = 500) -> list[dict[str, Any]]:
    now = datetime.utcnow()
    start = now - timedelta(days=max(1, days))
    events = db.get_canonical_events(start_date=start, end_date=now, limit=limit)
    rows: list[dict[str, Any]] = []
    for event in events:
        row = event_to_review_row(event)
        if row:
            rows.append(row)
    rows.sort(key=lambda r: r.get("capturedAt") or "", reverse=True)
    return rows


def build_performance_from_reviews(reviews: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reviewer stats derived from review rows."""
    by_name: dict[str, dict[str, int]] = defaultdict(lambda: {"reviewed": 0, "advance": 0})
    for row in reviews:
        name = str(row.get("reviewerName") or "Unknown")
        by_name[name]["reviewed"] += 1
        if str(row.get("humanReview", "")).lower() == "verified":
            by_name[name]["advance"] += 1

    result: list[dict[str, Any]] = []
    for name, stats in by_name.items():
        reviewed = stats["reviewed"]
        advance = stats["advance"]
        rate = (advance / reviewed) if reviewed else 0.0
        calibration = "Drift" if rate < 0.85 else "Calibrated"
        result.append(
            {
                "name": name,
                "reviewed": reviewed,
                "advanceRate": rate,
                "calibration": calibration,
            }
        )
    result.sort(key=lambda r: (-r["reviewed"], r["name"]))
    return result


def fetch_governance_reviews_remote(timeout: float = 5.0) -> list[dict[str, Any]] | None:
    base = _governance_base_url()
    if not base:
        return None
    try:
        resp = requests.get(
            f"{base}/api/governance/reviews",
            headers=_governance_headers() or None,
            timeout=timeout,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, list):
            return None
        return data
    except Exception:
        return None


def fetch_governance_performance_remote(timeout: float = 5.0) -> list[dict[str, Any]] | None:
    base = _governance_base_url()
    if not base:
        return None
    try:
        resp = requests.get(
            f"{base}/api/governance/performance",
            headers=_governance_headers() or None,
            timeout=timeout,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, list):
            return None
        return data
    except Exception:
        return None


def get_governance_reviews(days: int = 30, prefer_remote: bool = True) -> list[dict[str, Any]]:
    local = build_reviews_from_events(days)
    if prefer_remote:
        remote = fetch_governance_reviews_remote()
        if remote is not None and len(remote) > 0:
            return remote
    return local


def get_governance_history(days: int = 30, limit: int = 200) -> list[dict[str, Any]]:
    """Completed review decisions (verified / rejected) for audit history."""
    limit = max(1, min(limit, 500))
    rows = build_reviews_from_events(days, limit=limit * 3)
    done = [
        r
        for r in rows
        if str(r.get("humanReview") or "").lower() in ("verified", "rejected")
    ]
    return done[:limit]


def get_governance_performance(
    days: int = 30,
    prefer_remote: bool = True,
) -> list[dict[str, Any]]:
    reviews = build_reviews_from_events(days)
    local = build_performance_from_reviews(reviews)
    if prefer_remote:
        remote = fetch_governance_performance_remote()
        if remote is not None and len(remote) > 0:
            return remote
    return local


_DECISION_TO_REVIEW = {
    "Advance": "verified",
    "Reject": "rejected",
    "Hold": "pending",
}

_DECISION_TO_POLICY = {
    "Advance": "allowed",
    "Reject": "blocked",
    "Hold": "human_gate",
}


def decide_governance_review(
    event_id: str,
    decision: str,
    *,
    actor: str,
    reviewer_name: Optional[str] = None,
) -> dict[str, Any]:
    """Persist human decision on a canonical event + governance_decisions row."""
    allowed = {"Advance", "Reject", "Hold"}
    if decision not in allowed:
        raise ValueError("decision must be Advance, Reject, or Hold")

    event = db.get_canonical_event_by_id(event_id)
    if not event:
        raise LookupError("event not found")

    human_review = _DECISION_TO_REVIEW[decision]
    policy_outcome = _DECISION_TO_POLICY[decision]
    prev_tier = _trust_tier_label(int(event.get("trust_level", 0) or 0))
    new_tier = "T3_trusted" if decision == "Advance" else prev_tier
    fired_at = datetime.utcnow().isoformat()
    decision_id = f"rev-{int(datetime.utcnow().timestamp() * 1000)}-{event_id[:12]}"

    db.update_canonical_event_review(
        event_id,
        human_review,
        reviewer_name=reviewer_name or actor,
        human_user_id=actor,
        policy_outcome=policy_outcome,
    )
    db.insert_governance_decision(
        decision_id=decision_id,
        event_id=event_id,
        decision=decision,
        human_review=human_review,
        fired_at=fired_at,
        actor=actor,
        org_id=event.get("org_id"),
        policy_outcome=policy_outcome,
        rationale=f"Human reviewer decision: {decision}",
        prev_trust_tier=prev_tier,
        new_trust_tier=new_tier,
        workflow_id=event.get("workflow_id"),
    )

    updated = db.get_canonical_event_by_id(event_id) or event
    row = event_to_review_row(updated)
    if not row:
        row = {
            "eventId": event_id,
            "agentId": event.get("agent_id") or "unknown",
            "skill": str(event.get("source_event_type") or "unknown"),
            "confidence": 0.0,
            "humanReview": human_review,
            "policyOutcome": policy_outcome,
            "trustTier": new_tier,
            "capturedAt": _iso_captured_at(event.get("received_at")),
            "humanUserId": actor,
            "reviewerName": reviewer_name or actor,
        }
    return {
        "review": row,
        "decisionId": decision_id,
        "workflowId": event.get("workflow_id"),
        "shouldResume": decision == "Advance" and bool(event.get("workflow_id")),
    }
