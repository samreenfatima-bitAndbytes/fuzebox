"""Agent dependencies, data-flow processes, shared resources, and cascade risks."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Any

from . import db
from .task_scorecards import date_range_from_days

# Catalog entries use name fragments matched against registry agent names.
_SHARED_RESOURCES: list[dict[str, Any]] = [
    {
        "resource_id": "odds-feed-api",
        "name": "Odds Feed API",
        "status": "stale",
        "detail": "14-min latency on player props — exceeds SLA of 5 min",
        "agent_fragments": ["intake", "classifier", "triage", "scorer"],
    },
    {
        "resource_id": "vehicle-telematics",
        "name": "Vehicle Telematics API",
        "status": "healthy",
        "detail": "Live FNOL evidence stream — 99.4% uptime last 30 days",
        "agent_fragments": ["tech", "api"],
    },
    {
        "resource_id": "kyb-vendor",
        "name": "KYB Vendor Score",
        "status": "healthy",
        "detail": "Used during onboarding and quarterly re-screen",
        "agent_fragments": ["customer", "success", "account"],
    },
    {
        "resource_id": "parts-pricing",
        "name": "Parts Pricing Feed",
        "status": "stale",
        "detail": "Vendor feed 9 days behind — drives FMEA-104 / FMEA-108",
        "agent_fragments": ["pricing", "billing", "refund"],
    },
    {
        "resource_id": "predictive-ledger",
        "name": "Predictive Ledger",
        "status": "healthy",
        "detail": "Authoritative truth store for downstream reconciliation",
        "agent_fragments": [
            "intake",
            "triage",
            "tech",
            "api",
            "customer",
            "pricing",
            "general",
            "billing",
        ],
    },
]

_DEPENDENCY_RISKS: list[dict[str, Any]] = [
    {
        "risk_id": "DR-01",
        "severity": "high",
        "title": "Recommendation Writer cascade — failure drops 2.9σ exposure across all SBA outbound",
        "blast_radius": "Blast radius: $2,400 / week leakage potential",
        "agent_fragments": ["recommendation", "writer", "outreach"],
    },
    {
        "risk_id": "DR-02",
        "severity": "high",
        "title": "Stale Parts Pricing Feed — single point of failure for two agents (FMEA-104, FMEA-108)",
        "blast_radius": "Blast radius: Estimate variance > $400 / claim",
        "agent_fragments": ["damage", "estimate", "parts"],
    },
    {
        "risk_id": "DR-03",
        "severity": "medium",
        "title": "Sanctions Match dependency on KYB Vendor — vendor outage blocks AML auto-clear",
        "blast_radius": "Blast radius: Onboarding queue grows 45% / outage hour",
        "agent_fragments": ["aml", "sanction", "kyb", "underwriter"],
    },
    {
        "risk_id": "DR-04",
        "severity": "low",
        "title": "Folio Reconciler relies on POS webhook — replay required at peak (suite checkout)",
        "blast_radius": "Blast radius: Comp leakage $250 / event",
        "agent_fragments": ["folio", "reconcil", "pos"],
    },
]


def _short_process_id(seed: str) -> str:
    digest = hashlib.md5(seed.encode()).hexdigest()
    return f"{digest[:8]} {digest[8:11]}"


def _sigma_label(success_rate: float) -> str:
    rate = success_rate if success_rate <= 1 else success_rate / 100
    rate = max(0.0, min(1.0, rate))
    return f"{rate * 4.1:.1f}σ"


def _sigma_tone(sigma: float) -> str:
    if sigma >= 4.0:
        return "healthy"
    if sigma >= 3.0:
        return "watch"
    return "at-risk"


def _match_agents_by_fragments(
    agents: list[Any],
    fragments: list[str],
) -> list[dict[str, str]]:
    matched: list[dict[str, str]] = []
    for agent in agents:
        hay = f"{agent.name} {agent.agent_id}".lower()
        if any(frag in hay for frag in fragments):
            matched.append({"agent_id": agent.agent_id, "name": agent.name})
    return matched


def _agent_task_stats(days: int) -> dict[str, dict[str, float | int]]:
    start, end = date_range_from_days(days)
    tasks = db.get_tasks(start_date=start, end_date=end)
    stats: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"total": 0, "completed": 0}
    )
    for task in tasks:
        aid = task.agent_id or ""
        if not aid:
            continue
        stats[aid]["total"] += 1
        if task.result.value == "success":
            stats[aid]["completed"] += 1
    return stats


def _build_process_chains(
    agents: list[Any],
    stats: dict[str, dict[str, float | int]],
    scenarios: list[Any],
) -> list[dict[str, Any]]:
    """One data-flow card per registered agent; multi-step scenario pipelines as extra chains."""
    chains: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for sc in scenarios:
        if not sc.pipeline:
            continue
        steps = [s for s in sc.pipeline if s.agent_id]
        if len(steps) < 2:
            continue
        key = f"scenario:{sc.scenario_id}"
        if key in seen_keys:
            continue
        seen_keys.add(key)
        nodes = []
        sigmas: list[float] = []
        for step in steps:
            aid = step.agent_id
            agent = next((a for a in agents if a.agent_id == aid), None)
            if not agent:
                continue
            agg = stats.get(aid, {"total": 0, "completed": 0})
            total = int(agg["total"])
            completed = int(agg["completed"])
            success = (completed / total) if total else 0.0
            sigma = success * 4.1
            sigmas.append(sigma)
            nodes.append(
                {
                    "agent_id": aid,
                    "name": agent.name,
                    "model": agent.model_name or "unknown",
                    "sigma": round(sigma, 1),
                    "sigma_label": _sigma_label(success),
                    "sigma_tone": _sigma_tone(sigma),
                    "closed_runs": completed,
                }
            )
        if not nodes:
            continue
        avg = sum(sigmas) / len(sigmas) if sigmas else 0.0
        chains.append(
            {
                "process_id": sc.scenario_id,
                "process_label": _short_process_id(sc.scenario_id),
                "title": sc.name,
                "avg_sigma": round(avg, 1),
                "avg_sigma_label": f"{avg:.1f}σ avg",
                "nodes": nodes,
                "chain_source": "scenario",
            }
        )

    for agent in sorted(agents, key=lambda a: a.name.lower()):
        key = f"agent:{agent.agent_id}"
        if key in seen_keys:
            continue
        seen_keys.add(key)
        agg = stats.get(agent.agent_id, {"total": 0, "completed": 0})
        total = int(agg["total"])
        if total <= 0:
            continue
        completed = int(agg["completed"])
        success = (completed / total) if total else 0.0
        sigma = success * 4.1
        chains.append(
            {
                "process_id": agent.agent_id,
                "process_label": _short_process_id(agent.agent_id),
                "title": agent.name,
                "avg_sigma": round(sigma, 1),
                "avg_sigma_label": f"{sigma:.1f}σ avg",
                "nodes": [
                    {
                        "agent_id": agent.agent_id,
                        "name": agent.name,
                        "model": agent.model_name or "unknown",
                        "sigma": round(sigma, 1),
                        "sigma_label": _sigma_label(success),
                        "sigma_tone": _sigma_tone(sigma),
                        "closed_runs": completed,
                    }
                ],
                "chain_source": "tasks",
            }
        )

    return chains


def build_agent_dependencies(days: int = 30) -> dict[str, Any]:
    agents = db.get_all_agents()
    scenarios = db.get_all_scenarios(status="active")
    stats = _agent_task_stats(days)

    process_chains = _build_process_chains(agents, stats, scenarios)

    wired_ids: set[str] = set()
    for sc in scenarios:
        wired_ids.update(sc.team.agent_ids)
    for chain in process_chains:
        for node in chain["nodes"]:
            wired_ids.add(node["agent_id"])
    if not wired_ids:
        wired_ids = {a.agent_id for a in agents}

    resources: list[dict[str, Any]] = []
    for row in _SHARED_RESOURCES:
        linked = _match_agents_by_fragments(agents, row["agent_fragments"])
        if not linked and row["resource_id"] == "predictive-ledger":
            linked = [{"agent_id": a.agent_id, "name": a.name} for a in agents[:4]]
        resources.append(
            {
                "resource_id": row["resource_id"],
                "name": row["name"],
                "status": row["status"],
                "detail": row["detail"],
                "agents": linked,
            }
        )

    risks: list[dict[str, Any]] = []
    for row in _DEPENDENCY_RISKS:
        linked = _match_agents_by_fragments(agents, row["agent_fragments"])
        risks.append(
            {
                "risk_id": row["risk_id"],
                "severity": row["severity"],
                "title": row["title"],
                "blast_radius": row["blast_radius"],
                "agents": linked,
            }
        )

    high_impact = sum(1 for r in risks if r["severity"] == "high")

    return {
        "days": days,
        "kpis": {
            "process_chains": len(process_chains),
            "agents_wired": len(wired_ids) if wired_ids else len(agents),
            "shared_resources": len(resources),
            "high_impact_risks": high_impact,
        },
        "process_chains": process_chains,
        "shared_resources": resources,
        "risks": risks,
    }
