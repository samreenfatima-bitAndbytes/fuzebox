"""Agent registry extras (matrices, violations) for API."""

from __future__ import annotations

from typing import Optional

from . import db, evaluators


def _matrix_payload(df, label_col: str = "agent") -> dict:
    if df.empty:
        return {"columns": [], "rows": []}
    id_col = "agent_id"
    columns = [c for c in df.columns if c not in (label_col, id_col)]
    rows = []
    for _, row in df.iterrows():
        rows.append({
            "agent": str(row[label_col]),
            "agent_id": str(row[id_col]),
            "cells": {col: bool(row[col]) for col in columns},
        })
    return {"columns": columns, "rows": rows}


def build_skills_matrix(agent_ids: Optional[list[str]] = None) -> dict:
    return _matrix_payload(evaluators.get_skills_matrix(agent_ids))


def build_permissions_matrix(agent_ids: Optional[list[str]] = None) -> dict:
    return _matrix_payload(evaluators.get_permissions_matrix(agent_ids))


def build_agent_violations() -> list[dict]:
    rows: list[dict] = []
    for agent in db.get_all_agents():
        for violation in evaluators.check_permission_violations(agent.agent_id):
            rows.append({
                "agent": agent.name,
                "agent_id": agent.agent_id,
                "task_id": violation["task_id"],
                "task_type": violation["task_type"],
                "result": violation["result"],
                "missing_permissions": violation["missing_permissions"],
                "missing_skills": violation["missing_skills"],
            })
    return rows
