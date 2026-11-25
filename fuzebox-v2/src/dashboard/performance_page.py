"""Performance page data layer (API)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

import numpy as np

from . import db, metrics
from .task_scorecards import date_range_from_days, days_to_time_range_label


def build_completion_rates(days: Optional[int] = 7) -> list[dict]:
    start, end = date_range_from_days(days)
    df = metrics.completion_rates(start, end)
    if df.empty:
        return []
    rows = df.sort_values("Completion Rate", ascending=True).tail(16)
    return [
        {
            "agent": str(r["Agent"]),
            "group": str(r["Group"]),
            "total_tasks": int(r["Total Tasks"]),
            "successful": int(r["Successful"]),
            "completion_rate": float(r["Completion Rate"]),
        }
        for _, r in rows.iterrows()
    ]


def build_latency_by_agent(days: Optional[int] = 7) -> list[dict]:
    start, end = date_range_from_days(days)
    df = metrics.latency_by_agent(start, end)
    if df.empty:
        return []
    return [
        {
            "agent": str(r["Agent"]),
            "mean_ms": float(r["Mean (ms)"]),
            "p50_ms": float(r["P50 (ms)"]),
            "p90_ms": float(r["P90 (ms)"]),
            "p99_ms": float(r["P99 (ms)"]),
            "tasks": int(r["Tasks"]),
        }
        for _, r in df.iterrows()
    ]


def build_latency_histogram(days: Optional[int] = 7, num_bins: int = 24) -> dict:
    start, end = date_range_from_days(days)
    tasks = db.get_tasks(start_date=start, end_date=end)
    latencies = [t.latency_ms for t in tasks if t.latency_ms is not None]
    if not latencies:
        return {"stats": {}, "bins": []}
    stats = metrics.latency_stats(start_date=start, end_date=end)
    arr = np.array(latencies)
    counts, edges = np.histogram(arr, bins=min(num_bins, max(8, len(arr) // 3)))
    bins = [
        {
            "start_ms": round(float(edges[i]), 1),
            "end_ms": round(float(edges[i + 1]), 1),
            "count": int(counts[i]),
        }
        for i in range(len(counts))
        if counts[i] > 0
    ]
    return {"stats": stats, "bins": bins}


def build_throughput(
    days: Optional[int] = 7,
    granularity: str = "day",
) -> list[dict]:
    start, end = date_range_from_days(days)
    g = granularity if granularity in ("day", "hour", "week") else "day"
    df = metrics.throughput_time_series(start_date=start, end_date=end, granularity=g)
    if df.empty:
        return []
    points = []
    for _, r in df.iterrows():
        dt = r["date"]
        if hasattr(dt, "isoformat"):
            label = dt.isoformat()
        else:
            label = str(dt)
        points.append({
            "date": label,
            "task_count": int(r["task_count"]),
            "success_rate": float(r["success_rate"]),
            "avg_latency_ms": round(float(r.get("avg_latency", 0) or 0), 1),
        })
    return points


def build_leaderboard(days: Optional[int] = 7) -> list[dict]:
    start, end = date_range_from_days(days)
    df = metrics.agent_leaderboard(start, end)
    if df.empty:
        return []
    rows = []
    for rank, (_, r) in enumerate(df.iterrows(), start=1):
        rows.append({
            "rank": rank,
            "agent": str(r["Agent"]),
            "group": str(r["Group"]),
            "model": str(r["Model"]),
            "tasks": int(r["Tasks"]),
            "success_rate": float(r["Success Rate"]),
            "avg_quality": float(r["Avg Quality"]),
            "avg_latency_ms": float(r["Avg Latency (ms)"]),
            "total_cost_usd": float(r["Total Cost ($)"]),
            "score": float(r["Score"]),
        })
    return rows
