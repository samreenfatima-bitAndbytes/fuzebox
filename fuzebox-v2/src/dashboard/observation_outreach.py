"""Outreach QA for Quality tab (ECL-compatible shape)."""

from __future__ import annotations

import json
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from . import db
from .quality import build_quality_task_rows

OUTREACH_SKILL = "response_draft"
DEFAULT_CHANNELS = ("LinkedIn", "Email", "Slack")


def _ecl_base_url() -> str:
    return (os.getenv("ECL_API_URL") or "").strip().rstrip("/")


def _ecl_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    key = (os.getenv("ECL_API_KEY") or "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def _iso_dt(value: Any) -> str:
    if isinstance(value, datetime):
        dt = value
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value or "")


def _parse_captured_at(value: str) -> datetime | None:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _candidate_label(event_id: str, ctx: dict) -> str:
    name = ctx.get("candidateName") or ctx.get("candidate_name")
    if name:
        return str(name)
    suffix = (event_id or "0000")[-4:].upper()
    return f"Candidate {suffix}"


def _personalization_score(payload: dict, event: dict) -> float:
    score = payload.get("personalizationScore") or payload.get("qualityConfidence")
    if score is None:
        score = event.get("quality_score")
    if score is None:
        return 0.0
    score = float(score)
    if score > 1.0:
        score = score / 100.0
    return max(0.0, min(1.0, score))


def event_to_draft(event: dict) -> dict[str, Any] | None:
    payload = event.get("raw_payload") or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = {}
    ctx = payload.get("ctx") or {}
    skill = str(ctx.get("skill") or event.get("source_event_type") or "")
    if skill != OUTREACH_SKILL and OUTREACH_SKILL not in str(event.get("source_event_type", "")):
        return None

    event_id = str(event.get("event_id") or "")
    human_review = str(ctx.get("humanReview") or payload.get("humanReview") or "auto")
    return {
        "id": event_id,
        "candidateName": _candidate_label(event_id, ctx),
        "channel": str(ctx.get("channel") or "LinkedIn"),
        "messageText": str(
            ctx.get("messageText")
            or ctx.get("message")
            or f"AI-composed outreach via {OUTREACH_SKILL} — generated with personalization scoring applied."
        ),
        "personalizationScore": _personalization_score(payload, event),
        "status": str(ctx.get("status") or payload.get("status") or "Sent"),
        "capturedAt": _iso_dt(event.get("received_at")),
        "humanReview": human_review,
    }


def task_row_to_draft(row: dict) -> dict[str, Any] | None:
    if str(row.get("task_type") or "") != OUTREACH_SKILL:
        return None
    agent = str(row.get("agent") or "unknown")
    ts = row.get("timestamp_dt") or row.get("timestamp")
    captured = _iso_dt(ts)
    draft_id = f"local-{agent}-{captured[:19]}"
    return {
        "id": draft_id,
        "candidateName": f"Candidate {agent[-4:].upper()}",
        "channel": "LinkedIn",
        "messageText": (
            f"AI-composed outreach via {OUTREACH_SKILL} — "
            f"{row.get('task') or 'generated with personalization scoring applied.'}"
        ),
        "personalizationScore": max(0.0, min(1.0, float(row.get("quality_score") or 0.85))),
        "status": "Sent" if row.get("status") == "Completed" else str(row.get("status") or "Draft"),
        "capturedAt": captured,
        "humanReview": "auto",
    }


def build_outreach_kpis(drafts: list[dict[str, Any]]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    week_start = now - timedelta(days=7)
    week_count = 0
    for d in drafts:
        captured = _parse_captured_at(str(d.get("capturedAt") or ""))
        if captured and captured >= week_start:
            week_count += 1

    scores = [float(d.get("personalizationScore") or 0) for d in drafts]
    avg_score = (sum(scores) / len(scores)) if scores else 0.0

    flagged = sum(
        1
        for d in drafts
        if str(d.get("humanReview", "")).lower() in ("queued", "pending", "rejected")
    )

    channel_counts: Counter[str] = Counter(
        str(d.get("channel") or "LinkedIn") for d in drafts
    )
    total = len(drafts) or 1
    channel_mix = {ch: 0.0 for ch in DEFAULT_CHANNELS}
    for channel, count in channel_counts.items():
        channel_mix[channel] = round(count / total * 100, 1)
    if not drafts:
        channel_mix = {ch: 0.0 for ch in DEFAULT_CHANNELS}

    approved = sum(
        1
        for d in drafts
        if str(d.get("humanReview", "")).lower() in ("verified", "auto")
    )
    sent_without_edit = round(approved / len(drafts) * 100, 1) if drafts else 0.0
    reply_rate = round(avg_score * 0.244, 4) if avg_score else 0.0

    return {
        "draftsThisWeek": week_count,
        "avgPersonalization": avg_score,
        "flaggedForReview": flagged,
        "channelMix": channel_mix,
        "replyRate": reply_rate,
        "sentWithoutEdit": sent_without_edit,
    }


def enrich_outreach_kpis(kpis_raw: dict[str, Any], drafts: list[dict[str, Any]]) -> dict[str, Any]:
    """Merge ECL KPIs with locally computed fallbacks."""
    base = build_outreach_kpis(drafts)
    if kpis_raw:
        base.update({k: v for k, v in kpis_raw.items() if k != "channelMix"})
        mix = kpis_raw.get("channelMix")
        if isinstance(mix, dict):
            base["channelMix"] = {ch: float(mix.get(ch, 0)) for ch in DEFAULT_CHANNELS}
    return base


def build_outreach_summary(days: int = 30) -> dict[str, Any]:
    now = datetime.utcnow()
    start = now - timedelta(days=max(1, days))
    events = db.get_canonical_events(start_date=start, end_date=now, limit=2000)

    drafts: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for event in events:
        draft = event_to_draft(event)
        if draft and draft["id"] not in seen_ids:
            seen_ids.add(draft["id"])
            drafts.append(draft)

    if not drafts:
        for row in build_quality_task_rows(days):
            draft = task_row_to_draft(row)
            if draft and draft["id"] not in seen_ids:
                seen_ids.add(draft["id"])
                drafts.append(draft)

    drafts.sort(key=lambda d: d.get("capturedAt") or "", reverse=True)
    return {"drafts": drafts, "kpis": build_outreach_kpis(drafts)}


def fetch_outreach_remote(timeout: float = 5.0) -> dict[str, Any] | None:
    base = _ecl_base_url()
    if not base:
        return None
    try:
        resp = requests.get(
            f"{base}/api/observation/outreach",
            headers=_ecl_headers() or None,
            timeout=timeout,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, dict) or "drafts" not in data:
            return None
        return data
    except Exception:
        return None


def get_outreach_summary(days: int = 30, prefer_remote: bool = True) -> dict[str, Any]:
    local = build_outreach_summary(days)
    if prefer_remote:
        remote = fetch_outreach_remote()
        if remote is not None:
            remote_drafts = remote.get("drafts") or []
            if remote_drafts:
                kpis = enrich_outreach_kpis(remote.get("kpis") or {}, remote_drafts)
                return {"drafts": remote_drafts, "kpis": kpis}
    return local
