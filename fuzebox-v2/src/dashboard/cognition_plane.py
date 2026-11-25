"""Cognition Plane — correlation engine from task telemetry (Patent Family insights)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import numpy as np

from . import db
from .models import TaskResult
from .task_scorecards import date_range_from_days, days_to_time_range_label

_STRONG_R = 0.80
_LATENCY_BREACH_MS = 3396.0
_PEAK_HOURS = {14, 15, 16}  # 2–4 PM local wall-clock on started_at


def _pearson_r(xs: list[float], ys: list[float]) -> float:
    if len(xs) < 3:
        return 0.0
    x = np.array(xs, dtype=float)
    y = np.array(ys, dtype=float)
    if float(np.std(x)) < 1e-9 or float(np.std(y)) < 1e-9:
        return 0.0
    return float(np.corrcoef(x, y)[0, 1])


def _strength(r: float) -> str:
    return "strong" if abs(r) >= _STRONG_R else "weak"


def _direction(r: float) -> str:
    if r > 0.05:
        return "positive"
    if r < -0.05:
        return "negative"
    return "neutral"


def _confidence_value(task) -> Optional[float]:
    meta = task.metadata or {}
    raw = meta.get("confidence_score")
    if raw is None:
        raw = task.quality_score
    if raw is None:
        return None
    v = float(raw)
    return v / 100.0 if v > 1.0 else v


def _correlation_tokens_success(tasks: list) -> dict[str, Any]:
    pairs = [
        (float(t.total_tokens), 1.0 if t.result == TaskResult.SUCCESS else 0.0)
        for t in tasks
        if t.total_tokens is not None
    ]
    n = len(pairs)
    r = _pearson_r([p[0] for p in pairs], [p[1] for p in pairs]) if n >= 3 else 0.0
    sign = "+" if r >= 0 else ""
    if abs(r) < 0.15:
        insight = (
            "Token volume shows little linear association with pass-rate in this window. "
            "Re-run when n≥50 for stable estimates."
        )
    elif r > 0:
        insight = (
            "Higher token volume is associated with higher pass-rate. Complex tasks may be "
            "benefiting from more context; watch spend and latency."
        )
    else:
        insight = (
            "Higher token volume is associated with lower pass-rate. Review prompt bloat "
            "and truncation policies."
        )
    return {
        "correlation_id": "COR-001",
        "title": "Token volume correlates with success rate",
        "category": "Task analysis",
        "pattern_label": "Auto-discovered Patterns",
        "r": round(r, 2),
        "strength": _strength(r),
        "direction": _direction(r),
        "sample_size": n,
        "effect_summary": f"r = {sign}{r:.2f} · n={n}",
        "insight": insight,
        "recommendation_template_id": "COR-001",
    }


def _correlation_confidence_pass(tasks: list) -> dict[str, Any]:
    pairs: list[tuple[float, float]] = []
    for t in tasks:
        conf = _confidence_value(t)
        if conf is None:
            continue
        pairs.append((conf, 1.0 if t.result == TaskResult.SUCCESS else 0.0))
    n = len(pairs)
    r = _pearson_r([p[0] for p in pairs], [p[1] for p in pairs]) if n >= 3 else 0.0
    sign = "+" if r >= 0 else ""
    insight = (
        "Confidence is weakly aligned with pass-rate. Revisit the confidence calibration "
        "and add post-hoc evaluation signals."
        if abs(r) < 0.35
        else "Confidence tracks pass-rate in this window — threshold tuning may be effective."
    )
    return {
        "correlation_id": "COR-002",
        "title": "Confidence correlates with pass-rate",
        "category": "Quality",
        "pattern_label": "Auto-discovered Patterns",
        "r": round(r, 2),
        "strength": _strength(r),
        "direction": _direction(r),
        "sample_size": n,
        "effect_summary": f"r = {sign}{r:.2f} · n={n}",
        "insight": insight,
        "recommendation_template_id": "COR-002",
    }


def _correlation_peak_latency(tasks: list) -> dict[str, Any]:
    latencies = [t for t in tasks if t.latency_ms is not None and t.started_at]
    n = len(latencies)
    r = 0.0
    peak_breach_pct = 0.0
    off_breach_pct = 0.0
    if n >= 3:
        peak_flags: list[float] = []
        lats: list[float] = []
        peak_breaches: list[bool] = []
        off_breaches: list[bool] = []
        for t in latencies:
            is_peak = t.started_at.hour in _PEAK_HOURS
            peak_flags.append(1.0 if is_peak else 0.0)
            lats.append(float(t.latency_ms))
            breached = float(t.latency_ms) >= _LATENCY_BREACH_MS
            if is_peak:
                peak_breaches.append(breached)
            else:
                off_breaches.append(breached)
        r = _pearson_r(peak_flags, lats)
        peak_breach_pct = (
            100.0 * (sum(peak_breaches) / len(peak_breaches)) if peak_breaches else 0.0
        )
        off_breach_pct = (
            100.0 * (sum(off_breaches) / len(off_breaches)) if off_breaches else 0.0
        )

    sign = "+" if r >= 0 else ""
    if abs(r) < 0.15 and abs(peak_breach_pct - off_breach_pct) < 5:
        insight = (
            "No strong peak-hour latency signature detected in the latest telemetry. "
            "Keep monitoring as volume grows."
        )
    else:
        insight = (
            f"Peak window (2–4 PM) breach rate {peak_breach_pct:.0f}% vs off-peak {off_breach_pct:.0f}%. "
            "Consider autoscaling or queue shaping during peak hours."
        )
    return {
        "correlation_id": "COR-003",
        "title": "Latency shifts by hour-of-day (peak window 2–4 PM)",
        "category": "Temporal",
        "pattern_label": "Auto-discovered Patterns",
        "r": round(r, 2),
        "strength": _strength(r),
        "direction": _direction(r),
        "sample_size": n,
        "effect_summary": (
            f"breach≥{int(_LATENCY_BREACH_MS)}ms · peak {peak_breach_pct:.0f}% vs off {off_breach_pct:.0f}%"
        ),
        "insight": insight,
        "recommendation_template_id": "COR-003",
    }


def build_cognition_plane_summary(days: Optional[int] = 7) -> dict[str, Any]:
    """Correlation engine payload for Cognition Plane UI."""
    d = max(1, min(int(days or 7), 90))
    start, end = date_range_from_days(d)
    tasks = db.get_tasks(start_date=start, end_date=end)
    event_count = len(tasks)

    correlations = [
        _correlation_peak_latency(tasks),
        _correlation_tokens_success(tasks),
        _correlation_confidence_pass(tasks),
    ]
    strong = sum(1 for c in correlations if c["strength"] == "strong")

    return {
        "days": d,
        "time_range_label": days_to_time_range_label(d),
        "event_count": event_count,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "kpis": {
            "total_correlations": len(correlations),
            "strong_correlations": strong,
            "actionable_insights": len(correlations),
        },
        "correlations": correlations,
    }
