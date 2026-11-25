"""Dashboard overview data layer (API)."""

from __future__ import annotations

from typing import Optional

from . import metrics
from .economics_page import build_cost_time_series
from .performance_page import build_leaderboard, build_throughput
from .task_scorecards import date_range_from_days, days_to_time_range_label


def build_overview_summary(days: Optional[int] = 7) -> dict:
    start, end = date_range_from_days(days)
    summary = metrics.performance_summary(start, end)
    if not summary.get("total_tasks"):
        return {
            "days": days,
            "time_range_label": days_to_time_range_label(days),
            "kpis": {
                "total_tasks": 0,
                "successful_tasks": 0,
                "success_rate": 0,
                "total_cost": 0,
                "avg_cost_per_task": 0,
                "avg_latency_ms": 0,
                "p90_latency_ms": 0,
                "avg_quality": 0,
                "total_workflows": 0,
                "workflow_success_rate": 0,
                "active_agents": 0,
            },
            "cost_time_series": [],
            "throughput": [],
            "leaderboard": [],
        }
    return {
        "days": days,
        "time_range_label": days_to_time_range_label(days),
        "kpis": summary,
        "cost_time_series": build_cost_time_series(days),
        "throughput": build_throughput(days, "day"),
        "leaderboard": build_leaderboard(days),
    }
