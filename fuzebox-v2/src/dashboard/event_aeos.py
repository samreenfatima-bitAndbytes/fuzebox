"""AEOS-shaped field extraction from v2 canonical events."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional


def _dig(payload: dict, *keys: str) -> Any:
    cur: Any = payload
    for key in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def event_workflow_id(event: dict[str, Any]) -> str:
    row_wf = event.get("workflow_id")
    if row_wf:
        return str(row_wf)
    payload = event.get("raw_payload") or {}
    for path in (
        ("workflow_id",),
        ("ctx", "workflowId"),
        ("metadata", "workflow_id"),
    ):
        val = _dig(payload, *path) if len(path) > 1 else payload.get(path[0])
        if val:
            return str(val)
    return "unassigned"


def event_audit_hash(event: dict[str, Any]) -> str:
    if event.get("audit_hash"):
        return str(event["audit_hash"])
    payload = event.get("raw_payload") or {}
    for key in ("auditHash", "audit_hash"):
        if payload.get(key):
            return str(payload[key])
    return str(event.get("payload_hash") or "")


def event_prev_hash(event: dict[str, Any]) -> Optional[str]:
    prev = event.get("prev_event_hash")
    if prev:
        return str(prev)
    payload = event.get("raw_payload") or {}
    for key in ("prevEventHash", "prev_event_hash"):
        if payload.get(key):
            return str(payload[key])
    return None


def event_captured_at(event: dict[str, Any]) -> str:
    at = event.get("received_at")
    if isinstance(at, datetime):
        return at.isoformat()
    return str(at or "")


def event_wall_ms(event: dict[str, Any]) -> float:
    if event.get("wall_ms") is not None:
        return float(event["wall_ms"])
    payload = event.get("raw_payload") or {}
    for path in (("latency_ms",), ("ctx", "wallMs"), ("metadata", "latency_ms")):
        val = _dig(payload, *path) if len(path) > 1 else payload.get(path[0])
        if val is not None:
            return float(val)
    return 0.0


def event_token_counts(event: dict[str, Any]) -> tuple[int, int]:
    """Input/output tokens from row columns, with raw_payload usage fallback."""
    input_tokens = int(event.get("input_tokens", 0) or 0)
    output_tokens = int(event.get("output_tokens", 0) or 0)
    if input_tokens or output_tokens:
        return input_tokens, output_tokens
    payload = event.get("raw_payload") or {}
    if not isinstance(payload, dict):
        return 0, 0
    usage = payload.get("usage")
    if not isinstance(usage, dict):
        raw = payload.get("raw")
        usage = raw.get("usage") if isinstance(raw, dict) else {}
    if not isinstance(usage, dict):
        return 0, 0
    return (
        int(usage.get("input_tokens") or usage.get("inputTokens") or 0),
        int(usage.get("output_tokens") or usage.get("outputTokens") or 0),
    )


def event_vendor_cost_usd(event: dict[str, Any]) -> float:
    if event.get("vendor_cost_usd") is not None:
        return float(event["vendor_cost_usd"])
    payload = event.get("raw_payload") or {}
    for path in (("cost_usd",), ("ctx", "vendorCostUsd"), ("metadata", "cost_usd")):
        val = _dig(payload, *path) if len(path) > 1 else payload.get(path[0])
        if val is not None:
            return float(val)
    return 0.0


def event_amortized_cost_usd(event: dict[str, Any]) -> float:
    if event.get("amortized_cost_usd") is not None:
        return float(event["amortized_cost_usd"])
    payload = event.get("raw_payload") or {}
    for path in (
        ("amortized_cost_usd",),
        ("amortizedCostUsd",),
        ("ctx", "amortizedCostUsd"),
    ):
        val = _dig(payload, *path) if len(path) > 1 else payload.get(path[0])
        if val is not None:
            return float(val)
    vendor = event_vendor_cost_usd(event)
    return vendor * 1.15 if vendor > 0 else 0.0


def event_labor_value_saved_usd(event: dict[str, Any]) -> float:
    if event.get("labor_value_saved_usd") is not None:
        return float(event["labor_value_saved_usd"])
    payload = event.get("raw_payload") or {}
    for path in (
        ("labor_value_saved_usd",),
        ("laborValueSavedUsd",),
        ("ctx", "laborValueSavedUsd"),
    ):
        val = _dig(payload, *path) if len(path) > 1 else payload.get(path[0])
        if val is not None:
            return float(val)
    return 0.0


def event_passed_thresholds(event: dict[str, Any]) -> bool:
    if event.get("passed_thresholds") is not None:
        return bool(event["passed_thresholds"])
    payload = event.get("raw_payload") or {}
    result = str(payload.get("result", "")).lower()
    if result in ("failed", "error", "escalated"):
        return False
    qs = event.get("quality_score")
    if qs is not None and float(qs) < 0.5:
        return False
    return True


def event_human_review(event: dict[str, Any]) -> str:
    if event.get("human_review") is not None:
        return str(event["human_review"]).lower()
    payload = event.get("raw_payload") or {}
    for path in (("humanReview",), ("ctx", "humanReview")):
        val = _dig(payload, *path) if len(path) > 1 else payload.get(path[0])
        if val is not None and str(val).strip():
            return str(val).lower()
    return "auto"


def workflow_bucket_id(workflow_id: Optional[str]) -> str:
    wf = (workflow_id or "").strip()
    return wf if wf else "unassigned"


def is_chain_root_prev(prev: Optional[str]) -> bool:
    if not prev:
        return True
    p = str(prev).strip().lower()
    return p in {"", "null", "none", "genesis", "0" * 32}
