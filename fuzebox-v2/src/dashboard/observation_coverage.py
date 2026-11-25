"""AEOS GET /api/observation/coverage — coverage_manifest + event telemetry merge."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from . import db
from .event_aeos import event_captured_at


def _telemetry_from_events(days: int) -> dict[tuple[str, str], dict[str, Any]]:
    """Latest capture time per hyperscaler/surface in the window."""
    now = datetime.utcnow()
    start = now - timedelta(days=max(1, days))
    events = db.get_canonical_events(start_date=start, end_date=now, limit=5000)

    telem: dict[tuple[str, str], dict[str, Any]] = {}
    for ev in events:
        hyperscaler = (ev.get("vendor") or "unknown").strip().lower() or "unknown"
        surface = (ev.get("source_event_type") or ev.get("source") or "capture").strip()
        key = (hyperscaler, surface)
        captured = event_captured_at(ev)
        cur = telem.get(key)
        if not cur or captured > str(cur.get("lastTelemetryAt") or ""):
            telem[key] = {
                "lastTelemetryAt": captured,
                "inWindow": True,
            }
    return telem


def _resolve_runtime_status(
    registered_status: str,
    last_telemetry: Optional[str],
    in_window: bool,
) -> str:
    reg = (registered_status or "covered").strip().lower()
    if reg == "gap":
        return "gap"
    if in_window:
        return "covered"
    if last_telemetry:
        return "degraded"
    return "gap"


def build_observation_coverage(days: int = 30) -> list[dict[str, Any]]:
    """
    Merge coverage_manifest registry with canonical_events telemetry.
    Surfaces with events in-window -> covered; stale telemetry -> degraded.
    """
    db.ensure_default_coverage_manifest()
    telem = _telemetry_from_events(days)
    manifest = db.list_coverage_manifest()
    manifest_keys = {(r["hyperscaler"], r["surface"]) for r in manifest}

    rows: list[dict[str, Any]] = []
    for entry in manifest:
        key = (entry["hyperscaler"], entry["surface"])
        live = telem.get(key)
        last_telemetry = (
            live["lastTelemetryAt"]
            if live
            else entry.get("lastTelemetryAt")
        )
        in_window = bool(live and live.get("inWindow"))
        status = _resolve_runtime_status(
            entry.get("status") or "covered",
            last_telemetry,
            in_window,
        )
        if live and last_telemetry:
            db.update_coverage_telemetry(
                entry["hyperscaler"],
                entry["surface"],
                str(last_telemetry),
            )
        rows.append(
            {
                "hyperscaler": entry["hyperscaler"],
                "surface": entry["surface"],
                "status": status,
                "activatedAt": entry.get("activatedAt"),
                "lastTelemetryAt": last_telemetry,
                "signedAt": entry.get("signedAt"),
                "signature": entry.get("signature"),
            }
        )

    for key, live in telem.items():
        if key in manifest_keys:
            continue
        hs, surface = key
        db.upsert_coverage_manifest(
            hs,
            surface,
            "covered",
            last_telemetry_at=live.get("lastTelemetryAt"),
        )
        rows.append(
            {
                "hyperscaler": hs,
                "surface": surface,
                "status": "covered",
                "activatedAt": live.get("lastTelemetryAt"),
                "lastTelemetryAt": live.get("lastTelemetryAt"),
                "signedAt": live.get("lastTelemetryAt"),
                "signature": db.coverage_manifest_signature(hs, surface),
            }
        )

    rows.sort(key=lambda r: (r["hyperscaler"], r["surface"]))
    return rows
