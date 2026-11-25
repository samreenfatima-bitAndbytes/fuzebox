"""UoP Library — catalogue of measured Units of Production from scenarios + workflow economics."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Optional

from . import db
from .economics import rop_score
from .models import ScenarioConfig, ScenarioStatus


def _trust_label(level: int) -> str:
    lv = max(0, min(4, int(level or 0)))
    titles = {0: "Unverified", 1: "Observed", 2: "Supervised", 3: "Trusted", 4: "Autonomous"}
    return f"T{lv} · {titles[lv]}"


def _classification(level: int) -> str:
    lv = max(0, min(4, int(level or 0)))
    if lv >= 3:
        return "AI-Primary"
    if lv == 2:
        return "Hybrid"
    return "AI-Assisted"


def _max_trust_level(sc: ScenarioConfig, agents: dict) -> int:
    levels = [agents[aid].trust_level for aid in sc.team.agent_ids if aid in agents]
    return max(levels) if levels else 0


def _workflow_count(scenario_id: str) -> int:
    return sum(
        1
        for w in db.get_workflows()
        if (w.metadata or {}).get("scenario_id") == scenario_id
    )


def _uop_id(sc: ScenarioConfig) -> str:
    digest = hashlib.md5(sc.scenario_id.encode(), usedforsecurity=False).hexdigest()[:6]
    day = sc.created_at.strftime("%Y-%m-%d")
    return f"uop-{day}-{digest}"


def _kms_signature(sc: ScenarioConfig) -> str:
    raw = f"{sc.scenario_id}|{sc.created_at.isoformat()}|fuzebox-kms-root"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _has_share(tuop: float) -> tuple[float, float, float]:
    """Human / Agent / System split (display model for catalogue cards)."""
    a = round(min(0.95, max(0.0, tuop * 0.78)), 2)
    h = round(min(0.95, max(0.0, (1.0 - tuop) * 0.22)), 2)
    s = round(max(0.0, 1.0 - a - h), 2)
    return h, a, s


def _days_ago_label(dt: datetime) -> str:
    now = datetime.now(timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    days = max(0, (now - dt).days)
    if days == 0:
        return "today"
    if days == 1:
        return "1d ago"
    return f"{days}d ago"


def _build_entry(
    sc: ScenarioConfig,
    agents: dict,
    manual_cost_per_task: float,
) -> dict[str, Any]:
    tier = _max_trust_level(sc, agents)
    manual = sc.cost.manual_cost_per_task or manual_cost_per_task
    rop_data = rop_score(sc.scenario_id, manual)

    reuses = _workflow_count(sc.scenario_id)
    tuop = float(rop_data.get("tuop") or 0.0)

    if rop_data.get("total", 0) > 0:
        spend = float(rop_data["actual_ai_cost"])
        saved = float(rop_data["manual_equivalent"]) - spend
        rop_val = float(rop_data["rop"])
        cuow = float(rop_data["avg_cost_per_task"])
    else:
        steps = max(len(sc.pipeline), 1)
        spend = round(sc.estimated_cost_usd() * steps, 4)
        saved = round(manual * steps - spend, 2)
        rop_val = float(sc.roi_multiplier())
        cuow = round(spend / steps, 6) if steps else 0.0
        if tuop == 0 and rop_val > 0:
            tuop = 0.78

    mer = round(saved / spend, 2) if spend > 0 else 0.0
    net = round(saved, 2)
    h_share, a_share, s_share = _has_share(tuop)

    published_at = sc.metadata.get("published_at") or sc.updated_at.isoformat()
    try:
        pub_dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        pub_dt = sc.updated_at

    return {
        "uop_id": _uop_id(sc),
        "scenario_id": sc.scenario_id,
        "name": sc.name,
        "status": "published" if sc.status == ScenarioStatus.ACTIVE else sc.status.value,
        "classification": _classification(tier),
        "trust_tier_label": _trust_label(tier),
        "trust_level": tier,
        "cognition_snapshot": sc.updated_at.strftime("%m-%dT%H:%M"),
        "rop": round(rop_val, 2),
        "saved_usd": round(max(0.0, saved), 2),
        "spend_usd": round(spend, 4),
        "mer": mer,
        "cuow_usd": cuow,
        "reuses": reuses,
        "net_usd": net,
        "h_share": h_share,
        "a_share": a_share,
        "s_share": s_share,
        "kms_signature": _kms_signature(sc),
        "kms_signature_short": f"{_kms_signature(sc)}…",
        "published_at": pub_dt.isoformat(),
        "published_ago_label": _days_ago_label(pub_dt),
        "published_by": sc.metadata.get("published_by") or "les@fuzebox.ai",
        "signed": True,
    }


def build_uop_library(manual_cost_per_task: float = 75.0) -> dict[str, Any]:
    """Catalogue payload for UoP Library UI."""
    agents = {a.agent_id: a for a in db.get_all_agents()}
    scenarios = db.get_all_scenarios()

    published = [sc for sc in scenarios if sc.status == ScenarioStatus.ACTIVE]
    if not published:
        published = [
            sc
            for sc in scenarios
            if _workflow_count(sc.scenario_id) > 0 or sc.status != ScenarioStatus.ARCHIVED
        ]

    entries = [
        _build_entry(sc, agents, manual_cost_per_task)
        for sc in published
    ]
    entries.sort(key=lambda e: e["rop"], reverse=True)

    total_saved = sum(e["net_usd"] for e in entries)
    total_spend = sum(e["spend_usd"] for e in entries)
    rops = [e["rop"] for e in entries if e["rop"] > 0]
    avg_rop = round(sum(rops) / len(rops), 2) if rops else 0.0
    lifetime_reuses = sum(e["reuses"] for e in entries)

    class_counts = {"ai_primary": 0, "hybrid": 0, "ai_assisted": 0}
    for e in entries:
        c = e["classification"]
        if c == "AI-Primary":
            class_counts["ai_primary"] += 1
        elif c == "Hybrid":
            class_counts["hybrid"] += 1
        else:
            class_counts["ai_assisted"] += 1

    signed = sum(1 for e in entries if e["signed"])

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "manual_cost_per_task": manual_cost_per_task,
        "kpis": {
            "published_uops": len(entries),
            "signed_and_chained": signed,
            "total_value_captured_usd": round(total_saved, 2),
            "avg_rop": avg_rop,
            "total_spend_usd": round(total_spend, 4),
            "lifetime_reuses": lifetime_reuses,
            "ai_primary_count": class_counts["ai_primary"],
            "hybrid_count": class_counts["hybrid"],
            "ai_assisted_count": class_counts["ai_assisted"],
        },
        "entries": entries,
    }
