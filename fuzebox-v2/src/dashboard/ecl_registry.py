"""Push agent registry rows from v2 to AEOS/ECL (best-effort)."""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING, Any

import requests

if TYPE_CHECKING:
    from .models import Agent

logger = logging.getLogger(__name__)

AEOS_TRUST_TIERS = (
    "T0_unverified",
    "T1_observed",
    "T2_supervised",
    "T3_trusted",
    "T4_autonomous",
)


def _ecl_base_url() -> str:
    return (os.getenv("ECL_API_URL") or "").strip().rstrip("/")


def _ecl_api_key() -> str:
    return (os.getenv("ECL_API_KEY") or "").strip()


def _ecl_headers() -> dict[str, str]:
    headers: dict[str, str] = {"Content-Type": "application/json"}
    key = _ecl_api_key()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def trust_level_to_aeos_tier(level: int) -> str:
    idx = min(max(int(level or 0), 0), len(AEOS_TRUST_TIERS) - 1)
    return AEOS_TRUST_TIERS[idx]


def v2_status_to_aeos(status: Any) -> str:
    raw = getattr(status, "value", status)
    s = str(raw).lower()
    if s == "error":
        return "red"
    if s == "inactive":
        return "amber"
    return "green"


def sync_agent_to_ecl(agent: "Agent", *, is_new: bool) -> bool:
    """Register or update an agent in AEOS agent_registry. Returns True on success."""
    base = _ecl_base_url()
    api_key = _ecl_api_key()
    if not base:
        logger.warning("AEOS sync skipped for %s: ECL_API_URL not set", agent.agent_id)
        return False
    if not api_key:
        logger.warning("AEOS sync skipped for %s: ECL_API_KEY not set", agent.agent_id)
        return False

    vendor = (agent.vendor or "anthropic").strip().lower() or "anthropic"
    body: dict[str, Any] = {
        "agentId": agent.agent_id,
        "name": agent.name,
        "hyperscaler": vendor,
        "model": agent.model_name,
        "vendor": vendor,
        "status": v2_status_to_aeos(agent.status),
        "trustTier": trust_level_to_aeos_tier(agent.trust_level),
        "createdAt": agent.registered_at.isoformat(),
    }

    try:
        resp = requests.post(
            f"{base}/api/agents",
            json=body,
            headers=_ecl_headers(),
            timeout=8,
        )
        if resp.status_code in (200, 201):
            action = "registered" if is_new else "updated"
            print(f"  [AEOS] Agent {agent.agent_id} {action} at {base}")
            return True
        print(
            f"  [AEOS] Sync failed for {agent.agent_id}: HTTP {resp.status_code} — "
            f"{(resp.text or '')[:200]}"
        )
        return False
    except requests.RequestException as exc:
        print(f"  [AEOS] Sync unreachable for {agent.agent_id} at {base}: {exc}")
        return False


def delete_agent_from_ecl(agent_id: str) -> bool:
    """Remove an agent from AEOS agent_registry. Returns True on success."""
    base = _ecl_base_url()
    api_key = _ecl_api_key()
    if not base or not api_key:
        return False

    try:
        resp = requests.delete(
            f"{base}/api/agents/{agent_id}",
            headers=_ecl_headers(),
            timeout=8,
        )
        if resp.status_code in (200, 204):
            print(f"  [AEOS] Agent {agent_id} deleted at {base}")
            return True
        if resp.status_code == 404:
            print(f"  [AEOS] Agent {agent_id} not in registry (already removed)")
            return True
        print(
            f"  [AEOS] Delete failed for {agent_id}: HTTP {resp.status_code} — "
            f"{(resp.text or '')[:200]}"
        )
        return False
    except requests.RequestException as exc:
        print(f"  [AEOS] Delete unreachable for {agent_id} at {base}: {exc}")
        return False


def sync_all_agents_to_ecl(agents: list["Agent"]) -> int:
    """Push every v2 agent to AEOS. Returns count synced successfully."""
    ok = 0
    for agent in agents:
        if sync_agent_to_ecl(agent, is_new=False):
            ok += 1
    return ok
