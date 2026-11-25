"""Fetch canonical observation events from ECL/AEOS and merge with v2 local rows."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import requests

from . import db


def _ecl_base_url() -> str:
    return (os.getenv("ECL_API_URL") or "").strip().rstrip("/")


def _ecl_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    key = (os.getenv("ECL_API_KEY") or "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _parse_captured_at(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    try:
        if raw.endswith("Z"):
            raw = raw[:-1] + "+00:00"
        dt = datetime.fromisoformat(raw)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _normalize_dt(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def ecl_row_to_v2_event(row: dict[str, Any]) -> dict[str, Any]:
    """Map AEOS canonical event JSON into v2 canonical_events dict shape."""
    captured = _parse_captured_at(row.get("capturedAt") or row.get("captured_at"))
    wall_ms = float(row.get("wallMs") or row.get("wall_ms") or 0)
    vendor_cost = float(row.get("vendorCostUsd") or row.get("vendor_cost_usd") or 0)
    amortized_cost = float(
        row.get("amortizedCostUsd") or row.get("amortized_cost_usd") or 0
    )
    if amortized_cost <= 0 and vendor_cost > 0:
        amortized_cost = vendor_cost * 1.15
    labor_saved = float(
        row.get("laborValueSavedUsd") or row.get("labor_value_saved_usd") or 0
    )
    input_tokens = int(row.get("inputTokens") or row.get("input_tokens") or 0)
    output_tokens = int(row.get("outputTokens") or row.get("output_tokens") or 0)
    audit_hash = str(row.get("auditHash") or row.get("audit_hash") or "")
    return {
        "event_id": str(row.get("eventId") or row.get("event_id") or ""),
        "event_version": str(row.get("schemaVersion") or "fbx-canonical-v1.0"),
        "received_at": captured or datetime.now(timezone.utc),
        "vendor": str(row.get("hyperscaler") or row.get("vendor") or "unknown").lower(),
        "source": str(row.get("capturedVia") or "ecl"),
        "source_event_type": str(row.get("skill") or "observation"),
        "org_id": str(row.get("tenantId") or ""),
        "agent_id": str(row.get("agentId") or row.get("agent_id") or "unknown"),
        "request_id": row.get("vendorRequestId"),
        "customer_id": None,
        "model": row.get("model"),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "trust_level": 0,
        "quality_score": row.get("confidence"),
        "raw_payload": {
            "latency_ms": wall_ms,
            "cost_usd": vendor_cost,
            "amortizedCostUsd": amortized_cost,
            "laborValueSavedUsd": labor_saved,
            "ctx": {
                "workflowId": row.get("workflowId"),
                "skill": row.get("skill"),
                "humanReview": row.get("humanReview"),
                "policyOutcome": row.get("policyOutcome"),
                "trustTier": row.get("trustTier"),
            },
            "auditHash": audit_hash,
            "prevEventHash": row.get("prevEventHash"),
        },
        "payload_hash": audit_hash,
        "hmac_signature": audit_hash,
        "workflow_id": row.get("workflowId"),
        "audit_hash": audit_hash,
        "prev_event_hash": row.get("prevEventHash"),
        "wall_ms": wall_ms,
        "vendor_cost_usd": vendor_cost,
        "amortized_cost_usd": amortized_cost,
        "labor_value_saved_usd": labor_saved,
        "human_review": str(row.get("humanReview") or "auto").lower(),
        "passed_thresholds": bool(row.get("passedThresholds", True)),
    }


def fetch_ecl_canonical_events(
    limit: int = 2000,
    timeout: float = 8.0,
) -> list[dict[str, Any]] | None:
    base = _ecl_base_url()
    headers = _ecl_headers()
    if not base or not headers:
        return None
    try:
        resp = requests.get(
            f"{base}/api/observation/events",
            headers=headers,
            params={"limit": max(1, min(limit, 5000))},
            timeout=timeout,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, list):
            return None
        return [ecl_row_to_v2_event(row) for row in data if isinstance(row, dict)]
    except Exception:
        return None


def get_merged_canonical_events(
    days: int = 30,
    limit: int = 500,
    prefer_remote: bool = True,
) -> list[dict[str, Any]]:
    """Local v2 events merged with ECL canonical events (ECL wins on duplicate ids)."""
    now = _normalize_dt(datetime.now(timezone.utc))
    start = now - timedelta(days=max(1, days))
    cap = max(1, int(limit))

    local = db.get_canonical_events(
        start_date=start.replace(tzinfo=None),
        end_date=now.replace(tzinfo=None),
        limit=cap,
    )

    remote: list[dict[str, Any]] = []
    if prefer_remote:
        fetched = fetch_ecl_canonical_events(limit=max(cap, 500))
        if fetched:
            for ev in fetched:
                captured = ev.get("received_at")
                if isinstance(captured, datetime):
                    captured_norm = _normalize_dt(captured)
                    if start <= captured_norm <= now:
                        remote.append(ev)

    by_id: dict[str, dict[str, Any]] = {}
    for ev in local:
        eid = str(ev.get("event_id") or "")
        if eid:
            by_id[eid] = ev
    for ev in remote:
        eid = str(ev.get("event_id") or "")
        if eid:
            by_id[eid] = ev

    merged = list(by_id.values())
    merged.sort(
        key=lambda e: _normalize_dt(e["received_at"])
        if isinstance(e.get("received_at"), datetime)
        else datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return merged[:cap]
