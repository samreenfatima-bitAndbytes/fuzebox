"""Enriched agent rows (AEOS GET /api/agents shape)."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional

from . import db
from .governance import TRUST_TIER_LABELS
from .task_scorecards import date_range_from_days


def _trust_tier_label(level: int) -> str:
    idx = min(max(int(level or 0), 0), len(TRUST_TIER_LABELS) - 1)
    return TRUST_TIER_LABELS[idx]


def _p95(values: list[float]) -> float:
    if not values:
        return 0.0
    sorted_v = sorted(values)
    idx = int(round(0.95 * (len(sorted_v) - 1)))
    return sorted_v[max(0, min(idx, len(sorted_v) - 1))]


def build_enriched_agents(days: Optional[int] = 30) -> list[dict[str, Any]]:
    """Aggregate registry + events + tasks + ledger + equation snapshots."""
    start, end = date_range_from_days(days)
    agents = db.get_all_agents()
    events = db.get_canonical_events(start_date=start, end_date=end, limit=5000)
    tasks = db.get_tasks(start_date=start, end_date=end)
    ledger = db.list_ledger_rows(limit=5000)
    snapshots = db.list_equation_snapshots_by_agent()

    ledger_by_agent: dict[str, list[float]] = defaultdict(list)
    for row in ledger:
        aid = str(row.get("agent_id") or "")
        sigma = row.get("tech_variance_sigma")
        if aid and sigma is not None:
            ledger_by_agent[aid].append(float(sigma))

    snap_by_agent: dict[str, dict] = {}
    for snap in snapshots:
        aid = str(snap.get("agent_id") or "")
        if aid:
            snap_by_agent[aid] = snap

    event_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"runs": 0, "wall_ms": [], "passed": 0},
    )
    for ev in events:
        aid = str(ev.get("agent_id") or "")
        if not aid:
            continue
        event_stats[aid]["runs"] += 1
        event_stats[aid]["wall_ms"].append(float(ev.get("wall_ms") or 0))
        if ev.get("passed_thresholds", True):
            event_stats[aid]["passed"] += 1

    task_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"total": 0, "success": 0, "cost": 0.0, "latency": []},
    )
    for task in tasks:
        aid = task.agent_id or ""
        if not aid:
            continue
        task_stats[aid]["total"] += 1
        if task.result.value == "success":
            task_stats[aid]["success"] += 1
        task_stats[aid]["cost"] += float(task.cost_usd or 0)
        if task.latency_ms:
            task_stats[aid]["latency"].append(float(task.latency_ms))

    rows: list[dict[str, Any]] = []
    for agent in agents:
        aid = agent.agent_id
        ev = event_stats.get(aid, {"runs": 0, "wall_ms": [], "passed": 0})
        ts = task_stats.get(aid, {"total": 0, "success": 0, "cost": 0.0, "latency": []})
        snap = snap_by_agent.get(aid, {})
        sigmas = ledger_by_agent.get(aid, [])

        runs = max(int(ev["runs"]), int(ts["total"]))
        wall_samples = [w for w in ev["wall_ms"] if w > 0] or ts["latency"]
        avg_wall = sum(wall_samples) / len(wall_samples) if wall_samples else 0.0
        p95 = _p95(wall_samples) if wall_samples else 400.0

        success_rate = 0.0
        if ev["runs"] > 0:
            success_rate = ev["passed"] / ev["runs"]
        elif ts["total"] > 0:
            success_rate = ts["success"] / ts["total"]

        cuow = snap.get("cuow")
        if cuow is None and ts["total"] > 0:
            cuow = ts["cost"] / ts["total"]
        mer = snap.get("mer")
        if mer is None and cuow and success_rate > 0:
            mer = round(success_rate / float(cuow), 2)
        sigma = max(sigmas) if sigmas else round(success_rate * 4.1, 2)

        rows.append(
            {
                "id": aid,
                "agentId": aid,
                "name": agent.name,
                "model": agent.model_name or "unknown",
                "hyperscaler": agent.vendor or "anthropic",
                "trustTier": _trust_tier_label(agent.trust_level),
                "status": str(getattr(agent.status, "value", agent.status)),
                "vendor": agent.vendor or "anthropic",
                "createdAt": agent.registered_at.isoformat()
                if hasattr(agent.registered_at, "isoformat")
                else str(agent.registered_at),
                "runs": runs,
                "avgWallMs": round(avg_wall, 1),
                "sigma": sigma,
                "cuow": float(cuow) if cuow is not None else None,
                "mer": float(mer) if mer is not None else None,
                "abt": snap.get("abt"),
                "ctr": snap.get("ctr"),
                "tv": snap.get("tv"),
                "costPerRun": float(cuow) if cuow is not None else 0.0,
                "success": round(success_rate * 100, 1),
                "p95Latency": round(p95, 1),
                "trust_level": int(agent.trust_level or 0),
            }
        )

    return rows
