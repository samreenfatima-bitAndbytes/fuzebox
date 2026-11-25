"""
Fuzebox Agent Runner

Loads all active agents from the database, starts their queues,
then accepts requests — either from the built-in sample set or by
running a saved scenario through the WorkflowOrchestrator.

Usage:
    # Run sample requests through dynamic triage
    python run_agents.py

    # Run a saved scenario by ID
    python run_agents.py --scenario <scenario_id> --input "Customer request text"
"""

import sys
import time
import uuid
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from src.dashboard import db
from src.dashboard.models import Agent
from src.dashboard.tracing import init_tracing
from agents.base_agent import BaseAgent
from agents.triage_agent import TriageAgent
from agents.orchestrator import OrchestratorAgent


# ── Sample requests for standalone testing ─────────────────────────────────────

SAMPLE_REQUESTS = [
    "I was charged twice for my subscription this month. Please help.",
    "I cannot log into my account. I have forgotten my password.",
    "Your API keeps returning a 503 error on every request I make.",
    "Where is my order #4821? It was supposed to arrive 3 days ago.",
    "I would like to request a full refund for my last invoice.",
    "How do I upgrade my plan from Basic to Pro?",
    "The dashboard is not loading. I just see a blank white screen.",
    "My API key stopped working after I rotated it yesterday.",
    "I was charged $99 but I am on the $29 plan. Please explain.",
    "Can I add a second user to my account?",
]


# ── Agent factory ──────────────────────────────────────────────────────────────

def _build_system_prompt(agent: Agent) -> str:
    """Generate a system prompt from the agent's DB record."""
    skills_str = ", ".join(agent.skills) if agent.skills else "general support"
    perms_str  = ", ".join(agent.permissions) if agent.permissions else "standard access"

    if agent.group in ("drafters", "senior"):
        return (
            f"You are {agent.name}, a Response Drafter specialising in: {skills_str}.\n\n"
            f"You receive a JSON block from the Triage Scorer containing a classified "
            f"and prioritised customer service request. Your job is to draft the FIRST "
            f"reply to send to the customer.\n\n"
            f"Rules:\n"
            f"- Do NOT attempt to solve or resolve the issue — draft only the opening response\n"
            f"- Acknowledge the customer's concern warmly and professionally\n"
            f"- State that the right team is reviewing it and will follow up shortly\n"
            f"- Keep the draft under 80 words\n\n"
            f"Output ONLY a valid JSON object — no explanation, no markdown, no extra text.\n\n"
            f"JSON schema:\n"
            f'{{"draft_response": "<first reply to send>", "sentiment_flag": "<positive|neutral|negative>"}}\n\n'
            f"sentiment_flag: positive = calm/polite, neutral = factual, negative = frustrated/angry/threatening"
        )

    return (
        f"You are {agent.name}, a specialist in: {skills_str}. "
        f"Your available permissions are: {perms_str}. "
        f"Respond professionally and concisely. "
        f"If the request is outside your expertise, say so clearly."
    )


def load_agents_from_db() -> dict[str, BaseAgent]:
    """
    Instantiate a BaseAgent for every active agent in the database.
    Returns a dict of agent_id → BaseAgent.
    """
    db_agents = db.get_all_agents()
    active    = [a for a in db_agents if a.status.value == "active"]

    if not active:
        print("  ⚠  No active agents found in database.")
        print("     Open the dashboard → Scenario Builder → Agents tab to create some.")
        return {}

    pool: dict[str, BaseAgent] = {}
    for agent in active:
        instance = BaseAgent(
            agent_id      = agent.agent_id,
            name          = agent.name,
            system_prompt = _build_system_prompt(agent),
            task_types    = agent.skills,
        )
        pool[agent.agent_id] = instance
        print(f"  ✓  {agent.name}  [{agent.group}]  —  skills: {', '.join(agent.skills)}")

    return pool


# ── Runners ────────────────────────────────────────────────────────────────────

def run_sample_requests(pool: dict[str, BaseAgent]) -> None:
    """Route sample requests through dynamic triage."""
    triage = TriageAgent()

    print(f"\n  Sending {len(SAMPLE_REQUESTS)} sample requests through triage...")
    print("-" * 60)

    for i, text in enumerate(SAMPLE_REQUESTS, 1):
        request_id = str(uuid.uuid4())[:8]
        print(f"\n[{i}/{len(SAMPLE_REQUESTS)}] \"{text[:70]}\"")

        task_type, agent = triage.route(text, pool)

        if agent is None:
            print("  ✗ No agent available — skipping.")
            continue

        print(f"  → Triage: {task_type} → {agent.name}")

        queue_size = agent.task_queue.qsize()
        if queue_size > 0:
            print(f"  ⏳ {agent.name} busy — queued ({queue_size} waiting)")
        else:
            print(f"  ✓ {agent.name} free — assigning now")

        agent.enqueue({
            "request_id": request_id,
            "task_type":  task_type,
            "customer":   f"Customer-{request_id}",
            "text":       text,
        })

        # Respect API rate limits — 5 s between enqueues
        time.sleep(5)

    print("\n" + "-" * 60)
    print("  All requests queued. Waiting for agents to finish...")
    for instance in pool.values():
        instance.task_queue.join()


def run_scenario(scenario_id: str, input_text: str, pool: dict[str, BaseAgent]) -> None:
    """Execute a saved scenario through the WorkflowOrchestrator."""
    from agents.input_validation import EmptyInputTextError

    orchestrator = OrchestratorAgent(pool)
    try:
        workflow = orchestrator.run_scenario(scenario_id, input_text)
    except EmptyInputTextError as exc:
        print(f"\n  {exc}")
        return
    if workflow:
        print(f"\n  Workflow complete: {workflow.result.value}  |  cost: ${workflow.total_cost_usd:.4f}")
    else:
        print("\n  Scenario execution failed — check logs above.")


# ── Entry point ────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Fuzebox Agent Runner")
    parser.add_argument("--scenario", metavar="ID",  help="Scenario ID to execute")
    parser.add_argument("--input",    metavar="TEXT", help="Input text for scenario execution",
                        default="Process this customer request.")
    args = parser.parse_args()

    print("=" * 60)
    print("  Fuzebox Agent Runner")
    print("=" * 60)

    db.init_db()
    init_tracing()

    print("\n  Loading agents from database...")
    pool = load_agents_from_db()

    if not pool:
        sys.exit(1)

    print(f"\n  {len(pool)} agent(s) ready.\n")

    if args.scenario:
        print(f"  Mode: Scenario  →  {args.scenario}")
        run_scenario(args.scenario, args.input, pool)
    else:
        print("  Mode: Sample requests via triage")
        run_sample_requests(pool)

    print("\n" + "=" * 60)
    print("  Done. Open the dashboard to see results.")
    print("  cd frontend && npm run dev   # http://localhost:3000")
    print("=" * 60)


if __name__ == "__main__":
    main()
