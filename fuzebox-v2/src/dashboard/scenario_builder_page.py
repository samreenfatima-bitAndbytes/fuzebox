"""Scenario Builder data layer (API)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from . import db
from .models import (
    CostConfig,
    PipelineStep,
    ScenarioConfig,
    ScenarioStatus,
    TeamConfig,
)


def _inherited_permissions(agent_ids: list[str]) -> list[str]:
    agents = {a.agent_id: a for a in db.get_all_agents()}
    perms: set[str] = set()
    for aid in agent_ids:
        if aid in agents:
            perms.update(agents[aid].permissions)
    return sorted(perms)


def build_team_config(agent_ids: list[str], extra_permissions: list[str]) -> TeamConfig:
    inherited = _inherited_permissions(agent_ids)
    all_p = inherited + [p for p in extra_permissions if p not in inherited]
    agents = {a.agent_id: a for a in db.get_all_agents()}
    roles = sorted({agents[aid].group for aid in agent_ids if aid in agents})
    return TeamConfig(agent_ids=agent_ids, roles=roles, permissions=all_p)


def extra_permissions_from_team(agent_ids: list[str], team_permissions: list[str]) -> list[str]:
    inherited = set(_inherited_permissions(agent_ids))
    return [p for p in team_permissions if p not in inherited]


def scenario_summary(sc: ScenarioConfig) -> dict:
    return {
        "scenario_id": sc.scenario_id,
        "name": sc.name,
        "description": sc.description,
        "status": sc.status.value,
        "step_count": len(sc.pipeline),
        "agent_count": len(sc.team.agent_ids),
        "estimated_cost_usd": sc.estimated_cost_usd(),
        "roi_multiplier": sc.roi_multiplier(),
        "updated_at": sc.updated_at.isoformat(),
        "updated_label": sc.updated_at.strftime("%Y-%m-%d %H:%M"),
    }


def scenario_detail(sc: ScenarioConfig) -> dict:
    return {
        **scenario_summary(sc),
        "team": {
            "agent_ids": sc.team.agent_ids,
            "roles": sc.team.roles,
            "permissions": sc.team.permissions,
            "extra_permissions": extra_permissions_from_team(
                sc.team.agent_ids, sc.team.permissions
            ),
        },
        "pipeline": [s.model_dump() for s in sc.pipeline],
        "cost": sc.cost.model_dump(),
        "metadata": sc.metadata or {},
        "created_at": sc.created_at.isoformat(),
    }


def build_scenario_library() -> list[dict]:
    return [scenario_summary(sc) for sc in db.get_all_scenarios()]


def build_scenario_detail(scenario_id: str) -> Optional[dict]:
    sc = db.get_scenario(scenario_id)
    if not sc:
        return None
    return scenario_detail(sc)


def scenario_from_write_body(
    body: dict,
    scenario_id: Optional[str] = None,
) -> ScenarioConfig:
    """Build ScenarioConfig from API write payload."""
    name = (body.get("name") or "").strip()
    if not name:
        raise ValueError("Scenario name is required.")

    agent_ids = body.get("team", {}).get("agent_ids") or []
    extra_perms = body.get("team", {}).get("extra_permissions") or []
    team = build_team_config(agent_ids, extra_perms)

    pipeline = [
        PipelineStep(**step) for step in (body.get("pipeline") or [])
    ]

    cost_raw = body.get("cost") or {}
    cost = CostConfig(**cost_raw)

    try:
        status = ScenarioStatus((body.get("status") or "draft").lower())
    except ValueError as exc:
        raise ValueError(f"Invalid status: {body.get('status')}") from exc

    sid = scenario_id or body.get("scenario_id") or str(uuid.uuid4())[:12]
    existing = db.get_scenario(sid)
    created = existing.created_at if existing else datetime.utcnow()

    return ScenarioConfig(
        scenario_id=sid,
        name=name,
        description=(body.get("description") or "").strip(),
        status=status,
        team=team,
        pipeline=pipeline,
        cost=cost,
        created_at=created,
        updated_at=datetime.utcnow(),
        metadata=existing.metadata if existing else {},
    )


def patch_scenario_cost(scenario_id: str, cost_patch: dict) -> Optional[dict]:
    sc = db.get_scenario(scenario_id)
    if not sc:
        return None
    updated = sc.model_copy(
        update={
            "cost": CostConfig(
                price_per_1k_input=float(
                    cost_patch.get("price_per_1k_input", sc.cost.price_per_1k_input)
                ),
                price_per_1k_output=float(
                    cost_patch.get("price_per_1k_output", sc.cost.price_per_1k_output)
                ),
                human_baseline_minutes=float(
                    cost_patch.get("human_baseline_minutes", sc.cost.human_baseline_minutes)
                ),
                manual_hourly_cost_usd=float(
                    cost_patch.get(
                        "manual_hourly_cost_usd", sc.cost.manual_hourly_cost_usd
                    )
                ),
                cost_center=(cost_patch.get("cost_center") or sc.cost.cost_center).strip(),
                ledger_account=(
                    cost_patch.get("ledger_account") or sc.cost.ledger_account
                ).strip(),
            ),
            "updated_at": datetime.utcnow(),
        }
    )
    db.upsert_scenario(updated)
    return scenario_detail(updated)
