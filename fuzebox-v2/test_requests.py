"""10 real-world sample requests for V1 (and later V2) pipeline testing.

Sends each request to the webhook and prints the response.
These same 10 inputs are used for both V1 and V2 so the results are comparable.

Usage:
    python test_requests.py --token <JWT_TOKEN> --scenario v1-baseline-pipeline
    python test_requests.py --token <JWT_TOKEN> --scenario v1-baseline-pipeline --url http://localhost:8000
"""

import sys
import time
import argparse
import json
from pathlib import Path

try:
    import requests as http
except ImportError:
    print("Run: pip install requests")
    sys.exit(1)


# ── 10 Sample Requests ─────────────────────────────────────────────────────────
#
# Designed to cover:
#   - All major task types
#   - Clean / high-confidence cases (requests 1, 2, 3, 4, 7, 8, 9)
#   - Blended / ambiguous cases that stress-test the classifier (requests 5, 6)
#   - High-emotion / escalation-trigger cases (requests 6, 10)
#
# These same inputs are reused for V2 to produce a clean before/after comparison.

SAMPLE_REQUESTS = [

    # ── 3 Clear Requests ───────────────────────────────────────────────────────
    # Purpose: establish baseline token cost and latency.
    # Expected: confidence ≥ 0.85, priority 2–3, neutral sentiment.

    {
        "id": 1,
        "label": "CLEAR — Password reset",
        "customer_id": "cust-001",
        "text": "I need to reset my password. I'm not receiving the reset email.",
    },
    {
        "id": 2,
        "label": "CLEAR — Invoice question",
        "customer_id": "cust-002",
        "text": "Can you send me a copy of my invoice for last month? I need it for my accounts.",
    },
    {
        "id": 3,
        "label": "CLEAR — Order status",
        "customer_id": "cust-003",
        "text": "Where is my order #ORD-55123? It was supposed to arrive yesterday.",
    },

    # ── 3 Blended / Vague Requests ────────────────────────────────────────────
    # Purpose: test Agent 1 secondary classification and confidence threshold.
    # Expected: confidence 0.60–0.80, some may approach escalation boundary.

    {
        "id": 4,
        "label": "BLENDED — 404 error on checkout page",
        "customer_id": "cust-004",
        "text": (
            "I'm getting a 404 error on the checkout page but only when I try to "
            "upgrade my plan. My colleague on the same account has no issue. "
            "Not sure if this is a billing problem or a technical one."
        ),
    },
    {
        "id": 5,
        "label": "BLENDED — Charged after cancelling but still locked out",
        "customer_id": "cust-005",
        "text": (
            "I cancelled two weeks ago but I was charged again this month and now "
            "my account says it's suspended. I don't know if I should contact billing "
            "or technical support."
        ),
    },
    {
        "id": 6,
        "label": "VAGUE — Something is broken",
        "customer_id": "cust-006",
        "text": (
            "Hi, things aren't working properly on my end. "
            "I've tried a few things but nothing helps. Can someone look into this?"
        ),
    },

    # ── 2 High-Urgency Requests ───────────────────────────────────────────────
    # Purpose: trigger Agent 2 Priority 4–5 scoring and Agent 3 negative sentiment flag.
    # Expected: confidence ≥ 0.80, priority 4–5, negative sentiment, no escalation.

    {
        "id": 7,
        "label": "HIGH URGENCY — Account hacked, losing money",
        "customer_id": "cust-007",
        "text": (
            "My account has been compromised. Someone changed my email and payment method "
            "and I can see unauthorised charges going through right now. I need this "
            "account locked immediately. Every minute is costing me money."
        ),
    },
    {
        "id": 8,
        "label": "HIGH URGENCY — Production API down, clients affected",
        "customer_id": "cust-008",
        "text": (
            "Our production environment is completely down because your API is returning "
            "500 errors on every single call. We have 3,000 end users who cannot use our "
            "product right now. We are losing revenue. This is a P0 incident on our side "
            "and I need an engineer on this immediately."
        ),
    },

    # ── 2 Edge Cases designed to fail confidence check → human escalation ─────
    # Purpose: intentionally trigger the < 0.70 confidence gate in Agent 1.
    # Expected: escalated = True, pipeline stops after step 1.

    {
        "id": 9,
        "label": "EDGE CASE — Completely ambiguous complaint",
        "customer_id": "cust-009",
        "text": (
            "I'm not happy. This has been going on for a while and nobody has helped. "
            "I've contacted you before about this same situation. Please just fix it."
        ),
    },
    {
        "id": 10,
        "label": "EDGE CASE — Hostile / incoherent",
        "customer_id": "cust-010",
        "text": (
            "YOUR SYSTEM IS A JOKE!!! first it was the thing with the other thing and "
            "now THIS?? I want EVERYTHING fixed AND a refund AND compensation AND "
            "I want someone fired. This is going on social media."
        ),
    },

]


# ── Runner ─────────────────────────────────────────────────────────────────────

def run(base_url: str, token: str, scenario_id: str) -> None:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type":  "application/json",
    }

    print(f"\nRunning {len(SAMPLE_REQUESTS)} requests through scenario: {scenario_id}")
    print(f"Endpoint: {base_url}/webhook")
    print("=" * 70)

    for req in SAMPLE_REQUESTS:
        print(f"\n[{req['id']:02d}] {req['label']}")
        print(f"     {req['text'][:80]}...")

        payload = {
            "text":        req["text"],
            "source":      "sample_test",
            "customer_id": req["customer_id"],
            "metadata":    {"sample_id": req["id"], "label": req["label"]},
        }
        if scenario_id:
            payload["scenario_id"] = scenario_id

        try:
            resp = http.post(f"{base_url}/webhook", headers=headers, json=payload, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            print(f"     ✓ accepted  |  request_id: {data.get('request_id', 'n/a')}")
        except Exception as e:
            print(f"     ✗ failed: {e}")

        time.sleep(2)   # avoid hammering the API

    print("\n" + "=" * 70)
    print("All requests submitted. Check the dashboard for results.")
    print("  dashboard: http://localhost:3000")


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Send 10 sample requests through a Fuzebox pipeline")
    parser.add_argument("--token",    required=True,  help="JWT bearer token from POST /auth/token")
    parser.add_argument("--scenario", default=None,   help="Scenario ID (optional — defaults to v1-baseline-pipeline)")
    parser.add_argument("--url",      default="http://localhost:8000", help="Webhook base URL")
    args = parser.parse_args()

    run(base_url=args.url, token=args.token, scenario_id=args.scenario)


if __name__ == "__main__":
    main()
