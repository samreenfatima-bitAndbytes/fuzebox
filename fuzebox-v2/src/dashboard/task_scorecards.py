"""Task scorecards data layer (API)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from . import db, evaluators, metrics


def date_range_from_days(days: Optional[int]) -> tuple[Optional[datetime], datetime]:
    now = datetime.utcnow()
    if days is None or days <= 0:
        return None, now
    return now - timedelta(days=days), now


def days_to_time_range_label(days: Optional[int]) -> str:
    if days is None or days <= 0:
        return "All time"
    if days == 7:
        return "Last 7 days"
    if days == 14:
        return "Last 14 days"
    if days == 30:
        return "Last 30 days"
    return f"Last {days} days"


def list_agent_groups() -> list[str]:
    agents = db.get_all_agents()
    return sorted(set(a.group for a in agents))


def build_scorecard_rows(
    days: Optional[int] = 7,
    group: Optional[str] = None,
) -> list[dict]:
    start_date, end_date = date_range_from_days(days)
    df = evaluators.get_agent_scorecard_df(start_date, end_date)
    if df.empty:
        return []
    rows = []
    for _, r in df.iterrows():
        if group and group != "All" and r["Group"] != group:
            continue
        rows.append({
            "agent": str(r["Agent"]),
            "group": str(r["Group"]),
            "tasks": int(r["Tasks"]),
            "success_count": int(r["Success"]),
            "fail_count": int(r["Fail"]),
            "success_rate": float(r["Success Rate"]),
            "failure_rate": float(r["Failure Rate"]),
            "avg_quality": float(r["Avg Quality"]),
            "status": str(r["Status"]),
            "issues": str(r["Issues"] or ""),
        })
    return rows


def build_group_eval(
    group: str,
    days: Optional[int] = 7,
) -> Optional[dict]:
    if not group or group == "All":
        return None
    start_date, end_date = date_range_from_days(days)
    ev = evaluators.evaluate_group_completion(group, start_date, end_date)
    if ev.get("agents", 0) == 0:
        return None
    return {
        "group": ev["group"],
        "agents": ev["agents"],
        "group_success_rate": ev["group_success_rate"],
        "agents_passing": ev["agents_passing"],
        "passed": bool(ev.get("pass")),
    }


def build_accuracy_by_type(days: Optional[int] = 7) -> list[dict]:
    start_date, end_date = date_range_from_days(days)
    df = metrics.accuracy_by_type(start_date=start_date, end_date=end_date)
    if df.empty:
        return []
    return [
        {
            "task_type": str(r["Task Type"]),
            "total": int(r["Total"]),
            "success": int(r["Success"]),
            "success_rate": float(r["Success Rate"]),
        }
        for _, r in df.iterrows()
    ]
