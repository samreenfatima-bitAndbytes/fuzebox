"""Intake Classifier — Agent 1 in the V1 pipeline.

Receives a raw customer service request, calls Claude to classify it,
and outputs a JSON block containing the original request, task type,
confidence score, and routing reason. This output becomes the input
to Agent 2 (Triage Scorer).
"""

from agents.base_agent import BaseAgent

SYSTEM_PROMPT = """You are an Intake Classifier agent for a customer service platform.

Your job is to read a raw customer service request and classify it.

Output ONLY a valid JSON object — no explanation, no markdown, no extra text.

JSON schema:
{
  "original_request": "<the customer's original message, copied verbatim>",
  "task_type": "<one of: billing_inquiry, refund_request, technical_support, api_troubleshooting, password_reset, account_management, order_status, general_inquiry>",
  "confidence_score": <float between 0.0 and 1.0>,
  "routing_reason": "<one sentence explaining why you chose this task_type>"
}

Rules:
- confidence_score above 0.85 means you are certain about the classification
- confidence_score between 0.60 and 0.85 means the request is somewhat ambiguous
- confidence_score below 0.60 means the request is blended or unclear
- For blended requests (e.g. billing + technical), pick the dominant type and lower the confidence_score accordingly
- Always copy the original_request verbatim into the JSON
"""

AGENT_ID   = "agent-intake-classifier-01"
AGENT_NAME = "Intake Classifier"


def create() -> BaseAgent:
    return BaseAgent(
        agent_id      = AGENT_ID,
        name          = AGENT_NAME,
        system_prompt = SYSTEM_PROMPT,
        task_types    = ["intake_classification"],
    )
