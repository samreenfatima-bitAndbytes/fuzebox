"""AEOS GET /api/observation/events response builder."""

from __future__ import annotations

from typing import Any

from .event_aeos import (
    event_captured_at,
    event_passed_thresholds,
    event_token_counts,
    event_vendor_cost_usd,
    event_wall_ms,
)
from .observation_ecl import get_merged_canonical_events


def build_observation_events(
    days: int = 30,
    limit: int = 200,
) -> list[dict[str, Any]]:
    rows = get_merged_canonical_events(days=days, limit=limit)
    out: list[dict[str, Any]] = []
    for e in rows:
        input_tokens, output_tokens = event_token_counts(e)
        out.append(
            {
                "eventId": e["event_id"],
                "capturedAt": event_captured_at(e),
                "agentId": e.get("agent_id"),
                "hyperscaler": e.get("vendor") or "unknown",
                "model": e.get("model"),
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "totalTokens": input_tokens + output_tokens,
                "wallMs": int(round(event_wall_ms(e))),
                "passedThresholds": event_passed_thresholds(e),
                "vendorCostUsd": round(event_vendor_cost_usd(e), 6),
            }
        )
    return out
