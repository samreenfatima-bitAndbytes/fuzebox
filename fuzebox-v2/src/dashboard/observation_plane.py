"""Observation Plane data layer (API)."""

from __future__ import annotations

from datetime import datetime, timedelta

from . import db
from .event_aeos import (
    event_amortized_cost_usd,
    event_audit_hash,
    event_human_review,
    event_labor_value_saved_usd,
    event_passed_thresholds,
    event_prev_hash,
    event_token_counts,
    event_vendor_cost_usd,
)
from .observation_ecl import get_merged_canonical_events


def _p50_latency_ms(rows: list[dict]) -> float:
    if not rows:
        return 0.0
    sorted_ms = sorted(float(r["ms"]) for r in rows)
    mid = len(sorted_ms) // 2
    if len(sorted_ms) % 2:
        return round(sorted_ms[mid], 1)
    return round((sorted_ms[mid - 1] + sorted_ms[mid]) / 2, 1)


def build_observation_event_rows(days: int = 30, limit: int = 2000) -> list[dict]:
    """Canonical event rows for Observation Plane API."""
    events = get_merged_canonical_events(days=days, limit=limit)
    agent_vendor_map = {
        a.agent_id: (a.vendor or "anthropic")
        for a in db.get_all_agents()
    }
    rows: list[dict] = []
    for e in events:
        payload = e.get("raw_payload") or {}
        agent_id = e.get("agent_id") or "unknown"
        event_vendor = (e.get("vendor") or "unknown").strip().lower()
        resolved_vendor = event_vendor
        if event_vendor in {"", "unknown"}:
            resolved_vendor = (agent_vendor_map.get(agent_id) or "anthropic").strip().lower()
        received_at = e.get("received_at")
        if isinstance(received_at, datetime):
            time_iso = received_at.isoformat()
            time_display = received_at.strftime("%H:%M:%S")
        else:
            time_iso = str(received_at or "")
            time_display = time_iso[:8] if time_iso else "—"
        input_tokens, output_tokens = event_token_counts(e)
        latency_ms = float(payload.get("latency_ms") or e.get("wall_ms") or 0.0)
        amortized = event_amortized_cost_usd(e)
        labor_saved = event_labor_value_saved_usd(e)
        passed = event_passed_thresholds(e)
        human_review = event_human_review(e)
        escalated = not passed or human_review in ("queued", "pending", "rejected")
        rows.append(
            {
                "event_id": e["event_id"],
                "time_iso": time_iso,
                "time_display": time_display,
                "vendor": resolved_vendor,
                "agent": agent_id,
                "model": e.get("model") or "—",
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "tokens": input_tokens + output_tokens,
                "ms": latency_ms,
                "cost": amortized,
                "vendor_cost": event_vendor_cost_usd(e),
                "saved": labor_saved,
                "passed_thresholds": passed,
                "human_review": human_review,
                "status": "Escalated" if escalated else "Captured",
                "escalated": escalated,
                "payload_hash": e.get("payload_hash") or "",
                "audit_hash": event_audit_hash(e),
                "prev_event_hash": event_prev_hash(e) or "",
            }
        )
    return rows


def build_observation_kpis(rows: list[dict]) -> dict:
    total = len(rows)
    if total == 0:
        return {
            "total_events": 0,
            "active_surfaces": 0,
            "pass_rate_pct": 0.0,
            "passed_count": 0,
            "total_spend": 0.0,
            "total_saved": 0.0,
            "total_tokens": 0,
            "avg_latency_ms": 0.0,
            "p50_latency_ms": 0.0,
            "avg_tokens": 0.0,
            "avg_cost": 0.0,
            "human_review_queued": 0,
        }
    vendors = {r["vendor"] for r in rows}
    passed_count = sum(1 for r in rows if r.get("passed_thresholds", True))
    human_review_queued = sum(1 for r in rows if r.get("human_review") == "queued")
    total_spend = sum(r["cost"] for r in rows)
    total_saved = sum(r["saved"] for r in rows)
    total_tokens = sum(int(r.get("tokens") or 0) for r in rows)
    p50_ms = _p50_latency_ms(rows)
    return {
        "total_events": total,
        "active_surfaces": len(vendors),
        "pass_rate_pct": round(passed_count / total * 100, 1),
        "passed_count": passed_count,
        "total_spend": round(total_spend, 2),
        "total_saved": round(total_saved, 2),
        "total_tokens": total_tokens,
        "avg_latency_ms": round(sum(r["ms"] for r in rows) / total, 1),
        "p50_latency_ms": p50_ms,
        "avg_tokens": round(total_tokens / total, 1),
        "avg_cost": round(total_spend / total, 4),
        "human_review_queued": human_review_queued,
    }


def build_vendor_breakdown(rows: list[dict]) -> list[dict]:
    if not rows:
        return []
    total = len(rows)
    by_vendor: dict[str, dict] = {}
    for r in rows:
        v = r["vendor"]
        if v not in by_vendor:
            by_vendor[v] = {
                "events": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "tokens": 0,
                "ms_sum": 0.0,
                "spend": 0.0,
                "saved": 0.0,
            }
        by_vendor[v]["events"] += 1
        by_vendor[v]["input_tokens"] += int(r.get("input_tokens") or 0)
        by_vendor[v]["output_tokens"] += int(r.get("output_tokens") or 0)
        by_vendor[v]["tokens"] += r["tokens"]
        by_vendor[v]["ms_sum"] += r["ms"]
        by_vendor[v]["spend"] += r["cost"]
        by_vendor[v]["saved"] += r["saved"]
    result = []
    for vendor, agg in sorted(by_vendor.items(), key=lambda x: -x[1]["events"]):
        events = agg["events"]
        spend = agg["spend"]
        saved = agg["saved"]
        result.append({
            "vendor": vendor,
            "events": events,
            "mix_pct": round(events / total * 100, 1),
            "input_tokens": agg["input_tokens"],
            "output_tokens": agg["output_tokens"],
            "tokens": agg["tokens"],
            "avg_ms": round(agg["ms_sum"] / events, 1),
            "spend": round(spend, 4),
            "saved": round(saved, 4),
            "mer": round(saved / spend, 2) if spend > 0 else 0.0,
            "health": "Healthy" if events > 0 else "No coverage data",
        })
    return result


def build_live_event_stream(rows: list[dict], limit: int = 30) -> list[dict]:
    sorted_rows = sorted(rows, key=lambda r: r["time_iso"], reverse=True)
    return [
        {
            "time": r["time_display"],
            "captured_at": r["time_iso"],
            "event_id": r.get("event_id") or "",
            "vendor": r["vendor"],
            "agent": r["agent"],
            "model": r["model"],
            "input_tokens": int(r.get("input_tokens") or 0),
            "output_tokens": int(r.get("output_tokens") or 0),
            "tokens": r["tokens"],
            "ms": round(r["ms"]),
            "cost": r["cost"],
            "saved": r["saved"],
            "status": r["status"],
        }
        for r in sorted_rows[:limit]
    ]


def latest_audit_chain(rows: list[dict]) -> dict[str, str]:
    """Most recent event in window — audit hash + previous link in chain."""
    if not rows:
        return {"audit_hash": "", "prev_event_hash": "", "event_id": ""}
    latest = max(rows, key=lambda r: r["time_iso"])
    return {
        "audit_hash": str(
            latest.get("audit_hash") or latest.get("payload_hash") or "",
        ),
        "prev_event_hash": str(latest.get("prev_event_hash") or ""),
        "event_id": str(latest.get("event_id") or ""),
    }


def latest_audit_hash(rows: list[dict]) -> str:
    return latest_audit_chain(rows).get("audit_hash") or ""
