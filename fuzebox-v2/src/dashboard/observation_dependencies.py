"""AEOS-style dependency chains from canonical_events audit hash walk."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from . import db
from .agent_dependencies import _short_process_id, _sigma_label, _sigma_tone
from .event_aeos import (
    event_audit_hash,
    event_captured_at,
    event_prev_hash,
    event_workflow_id,
    is_chain_root_prev,
    workflow_bucket_id,
)


def _captured_ms(iso: str) -> float:
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000
    except Exception:
        return 0.0


def _order_nodes_by_audit_chain(
    process_id: str,
    bucket_nodes: list[dict[str, Any]],
    tenant_events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    wf_events = [
        e
        for e in tenant_events
        if workflow_bucket_id(event_workflow_id(e)) == process_id
    ]
    if not wf_events:
        return list(bucket_nodes)

    audit_hashes = {event_audit_hash(e) for e in wf_events}
    roots = [
        e
        for e in wf_events
        if is_chain_root_prev(event_prev_hash(e))
        or event_prev_hash(e) not in audit_hashes
    ]
    roots.sort(key=lambda e: _captured_ms(event_captured_at(e)))

    ordered_agent_ids: list[str] = []
    seen_agents: set[str] = set()
    visited_audit: set[str] = set()

    def walk_from(start: dict[str, Any]) -> None:
        cur: dict[str, Any] | None = start
        while cur is not None:
            ah = event_audit_hash(cur)
            if ah in visited_audit:
                return
            visited_audit.add(ah)
            aid = str(cur.get("agent_id") or "")
            if aid and aid not in seen_agents:
                seen_agents.add(aid)
                ordered_agent_ids.append(aid)
            nexts = [
                e
                for e in wf_events
                if event_prev_hash(e) == ah
            ]
            if not nexts:
                cur = None
            else:
                nexts.sort(key=lambda e: _captured_ms(event_captured_at(e)))
                cur = nexts[0]

    for root in roots:
        walk_from(root)

    node_by_id = {n["agent_id"]: n for n in bucket_nodes}
    head = [node_by_id[aid] for aid in ordered_agent_ids if aid in node_by_id]
    tail = [n for n in bucket_nodes if n["agent_id"] not in seen_agents]
    tail.sort(
        key=lambda n: min(
            (
                _captured_ms(event_captured_at(e))
                for e in wf_events
                if e.get("agent_id") == n["agent_id"]
            ),
            default=float("inf"),
        )
    )
    return head + tail


def build_observation_dependency_chains(days: int = 30, limit: int = 5000) -> list[dict[str, Any]]:
    """
    Process chains grouped by workflowId with hash-chain node ordering (AEOS parity).
    """
    now = datetime.utcnow()
    start = now - timedelta(days=max(1, days))
    events = db.get_canonical_events(start_date=start, end_date=now, limit=limit)
    agents = {a.agent_id: a for a in db.get_all_agents()}
    ledger = {
        str(r.get("agent_id")): r for r in db.list_ledger_rows(limit=limit)
    }

    event_counts: dict[str, int] = {}
    for e in events:
        aid = str(e.get("agent_id") or "")
        if aid:
            event_counts[aid] = event_counts.get(aid, 0) + 1

    buckets: dict[str, list[dict[str, Any]]] = {}
    for agent in agents.values():
        aid = agent.agent_id
        lb = ledger.get(aid, {})
        sigma = float(lb.get("tech_variance_sigma") or 0)
        if sigma <= 0:
            sigma = 3.0
        success = min(1.0, sigma / 4.1) if sigma else 0.0
        closed = int(lb.get("actual_cost_usd") is not None and 1 or 0)
        if lb:
            closed = max(1, event_counts.get(aid, 0))
        node = {
            "agent_id": aid,
            "name": agent.name,
            "model": agent.model_name or "unknown",
            "sigma": round(sigma, 1),
            "sigma_label": _sigma_label(success),
            "sigma_tone": _sigma_tone(sigma),
            "closed_runs": closed or event_counts.get(aid, 0),
        }
        pid = workflow_bucket_id(
            next(
                (event_workflow_id(e) for e in events if e.get("agent_id") == aid),
                "unassigned",
            )
        )
        buckets.setdefault(pid, []).append(node)

    audit_rows = [
        {
            "agent_id": e.get("agent_id"),
            "workflow_id": event_workflow_id(e),
            "audit_hash": event_audit_hash(e),
            "prev_event_hash": event_prev_hash(e),
            "captured_at": event_captured_at(e),
        }
        for e in events
    ]

    chains: list[dict[str, Any]] = []
    for process_id, nodes in buckets.items():
        ordered = _order_nodes_by_audit_chain(process_id, nodes, audit_rows)
        sigmas = [n["sigma"] for n in ordered]
        avg = sum(sigmas) / len(sigmas) if sigmas else 0.0
        name = "Unassigned" if process_id == "unassigned" else process_id
        chains.append(
            {
                "process_id": process_id,
                "process_label": _short_process_id(process_id),
                "title": name,
                "avg_sigma": round(avg, 1),
                "avg_sigma_label": f"{avg:.1f}σ avg",
                "nodes": ordered,
                "chain_source": "events",
            }
        )

    chains.sort(
        key=lambda c: (
            1 if c["process_id"] == "unassigned" else 0,
            -len(c["nodes"]),
            c["process_id"],
        )
    )
    return chains
