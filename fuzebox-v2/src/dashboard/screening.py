"""AI screening aggregates for Quality tab (ECL-compatible shape)."""

from __future__ import annotations

import os
from collections import Counter
from typing import Any

import requests

from .quality import build_quality_task_rows

# Score bands match client ECL `/api/observation/screening`.
SCREENING_BINS: list[tuple[int, int, str]] = [
    (0, 10, "0–10"),
    (10, 20, "10–20"),
    (20, 30, "20–30"),
    (30, 40, "30–40"),
    (40, 50, "40–50"),
    (50, 60, "50–60"),
    (60, 70, "60–70"),
    (70, 80, "70–80"),
    (80, 90, "80–90"),
    (90, 100, "90–100"),
]

ADVANCE_MIN = 70
HITL_LO = 60
HITL_HI = 70


def _score_percent(row: dict) -> float:
    return float(row.get("quality_score") or 0) * 100.0


def _in_bin(score: float, lo: int, hi: int) -> bool:
    if hi >= 100:
        return lo <= score <= 100
    return lo <= score < hi


def build_screening_summary(rows: list[dict]) -> dict[str, Any]:
    """Derive screening payload from quality task rows."""
    candidates = [r for r in rows if float(r.get("quality_score") or 0) > 0]
    if not candidates:
        candidates = list(rows)

    histogram = [
        {
            "bin": label,
            "count": sum(
                1 for r in candidates if _in_bin(_score_percent(r), lo, hi)
            ),
        }
        for lo, hi, label in SCREENING_BINS
    ]

    total = len(candidates)
    hitl_awaiting = sum(
        1
        for r in candidates
        if HITL_LO <= _score_percent(r) < HITL_HI and r.get("status") == "Running"
    )

    completed = sum(1 for r in candidates if r.get("status") == "Completed")
    failed = sum(1 for r in candidates if r.get("status") == "Failed")
    decided = completed + failed
    reviewer_alignment = (completed / decided) if decided else 0.0

    qualified = [r for r in candidates if _score_percent(r) >= ADVANCE_MIN]
    skill_counter: Counter[str] = Counter()
    for r in qualified:
        skill = str(r.get("task_type") or "").strip()
        if skill:
            skill_counter[skill] += 1

    skills = [
        {"skill": skill, "count": count}
        for skill, count in skill_counter.most_common(12)
    ]

    return {
        "histogram": histogram,
        "totalCandidates": total,
        "hitlAwaiting": hitl_awaiting,
        "reviewerAlignment": reviewer_alignment,
        "skills": skills,
    }


def fetch_ecl_screening(timeout: float = 5.0) -> dict[str, Any] | None:
    """Pull screening from ECL when configured; None if unavailable."""
    base = (os.getenv("ECL_API_URL") or "").strip().rstrip("/")
    if not base:
        return None
    url = f"{base}/api/observation/screening"
    headers: dict[str, str] = {}
    key = (os.getenv("ECL_API_KEY") or "").strip()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    try:
        resp = requests.get(url, headers=headers or None, timeout=timeout)
        if resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, dict) or "histogram" not in data:
            return None
        return data
    except Exception:
        return None


def get_screening_summary(days: int = 30, prefer_ecl: bool = True) -> dict[str, Any]:
    """ECL when reachable; otherwise local task-derived screening."""
    if prefer_ecl:
        remote = fetch_ecl_screening()
        if remote is not None:
            return remote
    rows = build_quality_task_rows(days)
    return build_screening_summary(rows)
