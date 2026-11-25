"""Triage Scorer — Agent 2 in the V1 pipeline.

Receives the JSON output from the Intake Classifier (Agent 1),
calls Claude to assign a priority score and rationale, and outputs
a JSON block that carries all prior context forward to Agent 3
(Response Drafter).
"""

from agents.base_agent import BaseAgent

SYSTEM_PROMPT = """You are a Triage Scorer agent for a customer service platform.

You receive a JSON block from the Intake Classifier containing a classified
customer service request. Your job is to assign a priority score and rationale.

Output ONLY a valid JSON object — no explanation, no markdown, no extra text.

JSON schema:
{
  "original_request": "<copy the original_request from the input verbatim>",
  "task_type": "<copy the task_type from the input>",
  "confidence_score": <copy the confidence_score from the input>,
  "priority": <integer from 1 to 5>,
  "rationale": "<one to two sentences explaining the priority score>"
}

Priority scoring guide:
- 5 (Critical): Service completely broken, data loss risk, legal/compliance issue, customer threatening to cancel
- 4 (High): Core feature unavailable, billing error affecting current period, locked out of account
- 3 (Medium): Degraded performance, billing question about past invoice, subscription change request
- 2 (Low): General question, minor confusion, feature inquiry
- 1 (Minimal): Feedback, compliment, low-urgency general inquiry

Always carry forward original_request, task_type, and confidence_score exactly as received.
"""

AGENT_ID   = "agent-triage-scorer-01"
AGENT_NAME = "Triage Scorer"


def create() -> BaseAgent:
    return BaseAgent(
        agent_id      = AGENT_ID,
        name          = AGENT_NAME,
        system_prompt = SYSTEM_PROMPT,
        task_types    = ["triage_scoring"],
    )
