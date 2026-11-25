"""Base agent — shared Claude connection, tracing, and queue logic."""

import sys
import json
import queue
import threading
from pathlib import Path
from datetime import datetime

import os
from dotenv import load_dotenv
import anthropic

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.dashboard.tracing import trace_agent_task

load_dotenv()

CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
MODEL = "claude-haiku-4-5-20251001"

if not CLAUDE_API_KEY:
    raise ValueError("CLAUDE_API_KEY not found in .env file")

_client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)


class BaseAgent:
    """
    All worker agents inherit from this.
    Handles Gemini calls, result logging, and queue processing.
    """

    def __init__(self, agent_id: str, name: str, system_prompt: str,
                 task_types: list[str]):
        self.agent_id    = agent_id
        self.name        = name
        self.system_prompt = system_prompt
        self.task_types  = task_types
        self.task_queue  = queue.Queue()
        self.busy           = False
        self._system_prompt = system_prompt
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    # ── Public interface ───────────────────────────────────────────────────────

    def enqueue(self, request: dict):
        """Put a request into this agent's queue."""
        self.task_queue.put(request)

    def is_free(self) -> bool:
        return not self.busy and self.task_queue.empty()

    # ── Internal loop ──────────────────────────────────────────────────────────

    def _run_loop(self):
        """Continuously pull requests from queue and handle them."""
        while True:
            request = self.task_queue.get()   # blocks until a request arrives
            self.busy = True
            try:
                self._handle(request)
            except Exception as e:
                print(f"  [{self.name}] ERROR: {e}")
            finally:
                self.busy = False
                self.task_queue.task_done()

    def _handle(self, request: dict):
        task_type   = request["task_type"]
        customer    = request["customer"]
        text        = request["text"]
        request_id  = request["request_id"]
        callback        = request.get("_callback")            # optional — used by orchestrator
        prompt_override = request.get("_system_prompt_override")  # optional V2 per-call prompt

        print(f"  → [{self.name}] handling: \"{text[:60]}\"")

        started       = datetime.utcnow()
        active_prompt = prompt_override if prompt_override else self._system_prompt

        with trace_agent_task(self.agent_id, task_type) as ctx:
            try:
                response = _client.messages.create(
                    model=MODEL,
                    max_tokens=512,
                    system=active_prompt,
                    messages=[{"role": "user", "content": text}],
                )
                answer = response.content[0].text.strip()

                input_tokens  = response.usage.input_tokens
                output_tokens = response.usage.output_tokens
                elapsed_ms    = (datetime.utcnow() - started).total_seconds() * 1000

                # ── Parse structured output ────────────────────────────────
                # Strip markdown code fences Claude sometimes wraps JSON in
                def _clean_json(text: str) -> str:
                    text = text.strip()
                    if text.startswith("```"):
                        text = text.split("\n", 1)[-1]
                    if text.endswith("```"):
                        text = text.rsplit("```", 1)[0]
                    return text.strip()

                extracted = {}
                try:
                    extracted = json.loads(_clean_json(answer))
                except (json.JSONDecodeError, ValueError):
                    pass

                # Quality score — use confidence_score if Agent 1 provided it,
                # otherwise default to 0.90
                quality = float(extracted.get("confidence_score", 0.90))
                quality = max(0.0, min(1.0, quality))

                ctx.set_tokens(input_tokens=input_tokens, output_tokens=output_tokens)
                ctx.set_result("success")
                ctx.set_quality(quality)
                ctx.metadata = {
                    "customer":        customer,
                    "request_id":      request_id,
                    "confidence_score": extracted.get("confidence_score"),
                    "priority":         extracted.get("priority"),
                    "sentiment_flag":   extracted.get("sentiment_flag"),
                    "routing_reason":   extracted.get("routing_reason"),
                    "rationale":        extracted.get("rationale"),
                }

                print(f"  ✓ [{self.name}] done ({elapsed_ms/1000:.1f}s) — {answer[:80]}")

                if callback:
                    callback({
                        "result":           "success",
                        "answer":           answer,
                        "input_tokens":     input_tokens,
                        "output_tokens":    output_tokens,
                        "latency_ms":       elapsed_ms,
                        "quality":          quality,
                        "confidence_score": extracted.get("confidence_score"),
                        "priority":         extracted.get("priority"),
                        "sentiment_flag":   extracted.get("sentiment_flag"),
                        "routing_reason":   extracted.get("routing_reason"),
                        "rationale":        extracted.get("rationale"),
                    })

            except Exception as e:
                elapsed_ms = (datetime.utcnow() - started).total_seconds() * 1000
                ctx.set_result("failure")
                ctx.set_quality(0.0)
                print(f"  ✗ [{self.name}] failed ({elapsed_ms/1000:.1f}s) — {e}")

                if callback:
                    callback({
                        "result":        "failure",
                        "answer":        "",
                        "input_tokens":  0,
                        "output_tokens": 0,
                        "latency_ms":    elapsed_ms,
                    })
