"""Observation agent registry for Quality tab (ECL-compatible shape)."""

from __future__ import annotations

import os
from collections import defaultdict
from typing import Any

import requests

from . import db
from .governance import TRUST_TIER_LABELS
from .quality import build_quality_task_rows


def _ecl_base_url() -> str:
    return (os.getenv("ECL_API_URL") or "").strip().rstrip("/")


def _ecl_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    key = (os.getenv("ECL_API_KEY") or "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _trust_tier_label(trust_level: int) -> str:
    idx = min(max(int(trust_level or 0), 0), len(TRUST_TIER_LABELS) - 1)
    return TRUST_TIER_LABELS[idx]


def _agent_status_label(status: Any) -> str:
    raw = getattr(status, "value", status)
    return str(raw).lower()


def build_observation_registry(days: int = 30) -> list[dict[str, Any]]:
    """Derive registry rows from agents + task aggregates."""
    agents = db.get_all_agents()
    task_rows = build_quality_task_rows(days)
    stats: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"total": 0, "completed": 0, "saved_m": 0}
    )
    for row in task_rows:
        aid = str(row.get("agent") or "")
        if not aid:
            continue
        stats[aid]["total"] += 1
        if row.get("status") == "Completed":
            stats[aid]["completed"] += 1
        stats[aid]["saved_m"] += int(row.get("time_saved_m") or 0)

    result: list[dict[str, Any]] = []
    for agent in agents:
        aid = agent.agent_id
        agg = stats.get(aid, {"total": 0, "completed": 0, "saved_m": 0})
        total = int(agg["total"])
        completed = int(agg["completed"])
        success_rate = (completed / total) if total else 0.0
        hours_saved = round(float(agg["saved_m"]) / 60.0, 1)
        result.append(
            {
                "agentId": aid,
                "name": agent.name,
                "model": agent.model_name or "—",
                "trustTier": _trust_tier_label(agent.trust_level),
                "status": _agent_status_label(agent.status),
                "totalRuns": total,
                "successRate": round(success_rate, 4),
                "hoursSaved": hours_saved,
            }
        )

    result.sort(key=lambda r: (-r["totalRuns"], r["name"]))
    return result


def fetch_observation_registry_remote(timeout: float = 5.0) -> list[dict[str, Any]] | None:
    base = _ecl_base_url()
    if not base:
        return None
    try:
        resp = requests.get(
            f"{base}/api/observation/registry",
            headers=_ecl_headers() or None,
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


def get_observation_registry(days: int = 30, prefer_remote: bool = True) -> list[dict[str, Any]]:
    if prefer_remote:
        remote = fetch_observation_registry_remote()
        if remote is not None:
            return remote
    return build_observation_registry(days)
