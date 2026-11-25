"""Economics page data layer (API)."""

from __future__ import annotations

from typing import Optional

import pandas as pd

from . import economics
from .task_scorecards import date_range_from_days, days_to_time_range_label


def _df_records(df: pd.DataFrame) -> list[dict]:
    if df is None or df.empty:
        return []
    return df.to_dict(orient="records")


def build_cost_by_agent(days: Optional[int] = 7) -> list[dict]:
    start, end = date_range_from_days(days)
    df = economics.cost_per_agent(start, end)
    rows = []
    for r in _df_records(df):
        rows.append({
            "agent": str(r.get("Agent", "")),
            "tasks": int(r.get("Tasks", 0)),
            "total_cost_usd": float(r.get("Total Cost ($)", 0)),
            "avg_cost_per_task_usd": float(r.get("Avg Cost/Task ($)", 0)),
            "input_tokens": int(r.get("Input Tokens", 0)),
            "output_tokens": int(r.get("Output Tokens", 0)),
        })
    return rows


def build_cost_by_task_type(days: Optional[int] = 7) -> list[dict]:
    start, end = date_range_from_days(days)
    df = economics.cost_per_task_type(start, end)
    rows = []
    for r in _df_records(df):
        rows.append({
            "task_type": str(r.get("Task Type", "")),
            "count": int(r.get("Count", 0)),
            "total_cost_usd": float(r.get("Total Cost ($)", 0)),
            "avg_cost_usd": float(r.get("Avg Cost ($)", 0)),
            "avg_tokens": int(r.get("Avg Tokens", 0)),
            "avg_latency_ms": float(r.get("Avg Latency (ms)", 0)),
        })
    return rows


def build_cost_time_series(days: Optional[int] = 7) -> list[dict]:
    start, end = date_range_from_days(days)
    df = economics.cost_time_series(start, end)
    rows = []
    for r in _df_records(df):
        dt = r.get("date")
        label = dt.isoformat() if hasattr(dt, "isoformat") else str(dt)
        rows.append({
            "date": label,
            "total_cost_usd": float(r.get("total_cost", 0)),
            "cumulative_cost_usd": float(r.get("cumulative_cost", 0)),
            "total_tokens": int(r.get("total_tokens", 0)),
            "task_count": int(r.get("task_count", 0)),
        })
    return rows


def build_workflow_economics(days: Optional[int] = 7) -> list[dict]:
    start, end = date_range_from_days(days)
    df = economics.workflow_economics(start, end)
    rows = []
    for r in _df_records(df):
        rows.append({
            "workflow": str(r.get("Workflow", "")),
            "agents": int(r.get("Agents", 0)),
            "tasks": int(r.get("Tasks", 0)),
            "result": str(r.get("Result", "")),
            "cost_usd": float(r.get("Cost ($)", 0)),
            "duration_s": float(r.get("Duration (s)", 0)),
            "date": str(r.get("Date", "")),
        })
    return rows


def build_economics_summary(
    days: Optional[int] = 7,
    manual_cost_per_task: float = 50.0,
) -> dict:
    start, end = date_range_from_days(days)
    manual = max(10.0, min(manual_cost_per_task, 200.0))
    roi = economics.calculate_roi(manual, start, end)
    tokens = economics.token_usage_summary(start, end)
    return {
        "days": days,
        "time_range_label": days_to_time_range_label(days),
        "manual_cost_per_task": manual,
        "roi": roi if roi else {"total_tasks": 0, "roi_pct": 0},
        "cost_by_agent": build_cost_by_agent(days),
        "cost_by_task_type": build_cost_by_task_type(days),
        "cost_time_series": build_cost_time_series(days),
        "token_usage": tokens,
        "workflow_economics": build_workflow_economics(days),
    }
