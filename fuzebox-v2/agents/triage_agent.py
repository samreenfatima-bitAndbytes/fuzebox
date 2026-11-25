"""Triage agent — classifies incoming requests and routes to the right agent.

Routing is fully dynamic: agents and their skills are read from the database,
so no code change is needed when agents are added or removed via the UI.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.dashboard import db
from src.dashboard.models import Agent

# ── Keyword classifier ─────────────────────────────────────────────────────────
# Maps task_type → keywords that signal it.  First match wins.
# This list can grow without touching routing logic.

KEYWORD_RULES: list[tuple[str, list[str]]] = [
    ("refund_request",      ["refund", "money back", "reimburs"]),
    ("billing_inquiry",     ["charged", "charge", "invoice", "billing", "payment",
                             "bill", "cost", "price", "fee", "paid"]),
    ("api_troubleshooting", ["api", "endpoint", "rate limit", "429", "503",
                             "sdk", "integration", "http", "request"]),
    ("technical_support",   ["error", "bug", "crash", "not working", "broken",
                             "issue", "problem", "blank", "loading", "slow"]),
    ("password_reset",      ["password", "forgot", "can't log", "cannot log",
                             "login", "sign in", "locked out"]),
    ("account_management",  ["account", "subscription", "cancel", "upgrade",
                             "downgrade", "plan", "user", "profile"]),
    ("order_status",        ["order", "delivery", "shipping", "arrive",
                             "package", "track"]),
]


class TriageAgent:
    """Classifies requests and routes them to the best available agent."""

    def __init__(self) -> None:
        self.name = "Triage Agent"

    # ── Classification ─────────────────────────────────────────────────────────

    def classify(self, text: str) -> str:
        """Return the task_type that best matches the request text."""
        lower = text.lower()
        for task_type, keywords in KEYWORD_RULES:
            if any(kw in lower for kw in keywords):
                return task_type
        return "general_inquiry"

    # ── Routing ────────────────────────────────────────────────────────────────

    def find_agent(
        self,
        task_type: str,
        agent_pool: dict[str, "BaseAgent"],  # agent_id → BaseAgent instance
    ) -> "BaseAgent | None":
        """
        Return the best agent for the given task_type.

        Priority:
          1. Active agent whose skills include the exact task_type.
          2. Active agent whose skills include a partial match.
          3. Any agent in the pool (fallback).
        """
        db_agents: dict[str, Agent] = {
            a.agent_id: a for a in db.get_all_agents()
        }

        # Filter pool to only registered, active agents
        candidates = [
            (agent_id, instance)
            for agent_id, instance in agent_pool.items()
            if agent_id in db_agents
        ]

        if not candidates:
            return None

        # 1. Exact skill match
        for agent_id, instance in candidates:
            if task_type in db_agents[agent_id].skills:
                return instance

        # 2. Partial skill match (e.g. task_type="billing_inquiry", skill="billing_support")
        task_prefix = task_type.split("_")[0]
        for agent_id, instance in candidates:
            if any(task_prefix in skill for skill in db_agents[agent_id].skills):
                return instance

        # 3. Fallback — return the first agent in the pool
        return candidates[0][1]

    def route(
        self,
        text: str,
        agent_pool: dict[str, "BaseAgent"],
    ) -> tuple[str, "BaseAgent | None"]:
        """Classify text and return (task_type, agent_instance)."""
        task_type = self.classify(text)
        agent     = self.find_agent(task_type, agent_pool)
        return task_type, agent
