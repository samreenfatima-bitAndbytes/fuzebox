"""Workflow Orchestrator — executes a saved ScenarioConfig step by step.

Responsibilities:
  - Reads a ScenarioConfig from the database.
  - For each pipeline step, locates the assigned agent (or falls back to triage).
  - Enqueues the task and waits for completion.
  - Records a WorkflowRecord and one TaskRecord per step so the dashboard
    shows real execution data.
"""

import sys
import uuid
import json
import hmac
import hashlib
import os
import queue
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests as _http

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.dashboard import db
from src.dashboard.models import (
    ScenarioConfig, PipelineStep, CostConfig,
    WorkflowRecord, TaskRecord, TaskResult,
)
from agents.input_validation import require_workflow_input_text
from agents.triage_agent import TriageAgent

_ECL_ENDPOINT  = os.environ.get("ECL_API_URL", "http://host.docker.internal:5000") + "/api/observation/ingest"
print(f"[Orchestrator] ECL endpoint set to: {_ECL_ENDPOINT}")
_ECL_SECRET    = os.environ.get("ECL_SECRET_KEY", "changeme-dev-secret")
_base_url = os.environ.get("ECL_API_URL", "http://host.docker.internal:5000")
AEOS_SERVER_URL = os.environ.get("AEOS_SERVER_URL", _base_url)


class OrchestratorAgent:
    """
    Manages execution of a ScenarioConfig against a live agent pool.

    Each pipeline step is sent to the correct agent.  Steps execute
    sequentially so that output from one step can inform the next.
    """

    def __init__(self, agent_pool: dict[str, "BaseAgent"]) -> None:
        """
        Args:
            agent_pool: mapping of agent_id → BaseAgent instance.
                        Must contain all agents that scenarios may reference.
        """
        self.name        = "Workflow Orchestrator"
        self.agent_pool  = agent_pool
        self.triage      = TriageAgent()

    # ── Public API ─────────────────────────────────────────────────────────────

    def run_scenario(
        self,
        scenario_id:    str,
        input_text:     str,
        request_id:     str = None,
        extra_metadata: dict = None,
        ecl_api_key:    str = "",
    ) -> Optional[WorkflowRecord]:
        """
        Execute a saved scenario end to end.

        Returns the completed WorkflowRecord, or None if the scenario
        could not be found.
        """
        scenario = db.get_scenario(scenario_id)
        if not scenario:
            print(f"[Orchestrator] Scenario not found: {scenario_id}")
            return None

        input_text = require_workflow_input_text(input_text)

        print(f"\n[Orchestrator] Running scenario: '{scenario.name}' ({len(scenario.pipeline)} steps)")
        return self._execute(
            scenario, input_text,
            request_id=request_id,
            extra_metadata=extra_metadata,
            ecl_api_key=ecl_api_key,
        )

    # ── Internal ───────────────────────────────────────────────────────────────

    def _execute(
        self,
        scenario:       ScenarioConfig,
        input_text:     str,
        request_id:     str = None,
        extra_metadata: dict = None,
        ecl_api_key:    str = "",
    ) -> WorkflowRecord:
        workflow_id    = str(uuid.uuid4())[:12]
        started_at     = datetime.utcnow()
        task_ids: list[str]        = []
        agent_ids: set[str]        = set()
        total_cost                 = 0.0
        step_results: list[TaskResult] = []
        base_metadata: dict        = {
            "scenario_id":  scenario.scenario_id,
            "request_id":   request_id,
            "input_text":   input_text,
        }
        if extra_metadata:
            base_metadata.update(extra_metadata)
        extra_metadata = base_metadata

        current_text    = input_text  # passed through the pipeline step by step
        prev_event_hash: Optional[str] = None  # ECL audit hash chain baton

        for step in scenario.pipeline:
            task_id, result, cost, agent_id, current_text, prev_event_hash = self._run_step(
                step            = step,
                workflow_id     = workflow_id,
                text            = current_text,
                scenario        = scenario,
                prev_event_hash = prev_event_hash,
                ecl_api_key     = ecl_api_key,
            )
            task_ids.append(task_id)
            agent_ids.add(agent_id)
            step_results.append(result)
            total_cost += cost

            if result == TaskResult.FAILURE:
                print(f"  [Orchestrator] Step '{step.name}' failed — aborting workflow.")
                break

            if result == TaskResult.ESCALATED:
                print(f"  [Orchestrator] Step '{step.name}' escalated — stopping pipeline.")
                break

            # ── Escalation gate after step 1 (Intake Classifier) ───────────────
            # If the classifier's confidence_score is below 0.70, the request is
            # too ambiguous for automated handling — escalate to a human and stop.
            if step.step_number == 1:
                try:
                    _ct = current_text.strip()
                    if _ct.startswith("```"):
                        _ct = _ct.split("\n", 1)[-1]
                    if _ct.endswith("```"):
                        _ct = _ct.rsplit("```", 1)[0]
                    classification = json.loads(_ct.strip())
                    confidence = float(classification.get("confidence_score", 1.0))
                    _ap = (scenario.metadata or {}).get("agent_params", {})
                    _p1 = _ap.get("agent-intake-classifier-01", {})
                    conf_threshold = float(
                        _p1.get("confidence_threshold",
                        (scenario.metadata or {}).get("confidence_threshold", 0.70))
                    )
                    if confidence < conf_threshold:
                        print(
                            f"  [Orchestrator] Confidence {confidence:.2f} < {conf_threshold:.2f} — "
                            f"escalating to human, stopping pipeline."
                        )
                        extra_metadata["escalated"] = True
                        extra_metadata["escalation_reason"] = (
                            f"Intake classifier confidence {confidence:.2f} below threshold {conf_threshold:.2f}"
                        )
                        extra_metadata["escalation_step"] = 1
                        # Patch step 1 task with escalation_flag = True
                        if task_ids:
                            db.update_task_metadata(task_ids[-1], {
                                "escalation_flag": True,
                                "completion_status": "escalated",
                            })
                        step_results.append(TaskResult.ESCALATED)
                        break
                except (json.JSONDecodeError, ValueError, TypeError):
                    pass  # non-JSON output from classifier — let pipeline continue

        # Determine overall workflow result
        if TaskResult.ESCALATED in step_results:
            wf_result = TaskResult.ESCALATED
        elif all(r == TaskResult.SUCCESS for r in step_results):
            wf_result = TaskResult.SUCCESS
        elif any(r == TaskResult.FAILURE for r in step_results):
            wf_result = TaskResult.FAILURE
        else:
            wf_result = TaskResult.PARTIAL

        workflow = WorkflowRecord(
            workflow_id   = workflow_id,
            name          = scenario.name,
            description   = scenario.description,
            agent_ids     = list(agent_ids),
            task_ids      = task_ids,
            started_at    = started_at,
            completed_at  = datetime.utcnow(),
            result        = wf_result,
            total_cost_usd = round(total_cost, 6),
            metadata      = extra_metadata,
        )
        db.insert_workflow(workflow)

        print(
            f"[Orchestrator] Workflow {workflow_id} complete — "
            f"{wf_result.value}, ${total_cost:.4f}"
        )
        return workflow

    def _run_step(
        self,
        step:            PipelineStep,
        workflow_id:     str,
        text:            str,
        scenario:        "ScenarioConfig" = None,
        prev_event_hash: Optional[str] = None,
        ecl_api_key:     str = "",
    ) -> tuple[str, TaskResult, float, str, str, Optional[str]]:
        """
        Execute one pipeline step.

        Returns (task_id, result, cost_usd, agent_id, output_text, audit_hash).
        audit_hash is the HMAC-SHA256 hash of this step's ECL event, used as
        prevEventHash for the next step in the chain.
        """
        print(f"  → Step {step.step_number}: '{step.name}' [{step.task_type}]")

        # Resolve which agent handles this step
        agent_instance = self._resolve_agent(step, text)
        if agent_instance is None:
            print(f"  ✗ No agent available for step '{step.name}'")
            task_id = str(uuid.uuid4())[:12]
            self._log_task(task_id, "unknown", workflow_id, step, TaskResult.FAILURE, 0, 0, 0.0, 0.0,
                           quality_score=0.0, extra_meta={"escalation_flag": False, "auop_score": 0.0})
            return task_id, TaskResult.FAILURE, 0.0, "unknown", text, prev_event_hash

        # ── AEOS Governance Gate ───────────────────────────────────────────────
        is_blocked = False
        try:
            aeos_resp = _http.get(
                f"{AEOS_SERVER_URL}/api/governance/rules/check",
                params={"task_type": step.task_type},
                headers={"Authorization": f"Bearer {ecl_api_key}"},
                timeout=5,
            )
            aeos_resp.raise_for_status()
            is_blocked = aeos_resp.json().get("is_blocked", False)
        except Exception as exc:
            print(f"  [AEOS] Governance check unavailable — defaulting to allow: {exc}")

        if is_blocked:
            print(f"  [AEOS] Step '{step.name}' blocked by Governance Gate.")
            task_id = str(uuid.uuid4())[:12]
            self._log_task(
                task_id, agent_instance.agent_id, workflow_id, step,
                TaskResult.ESCALATED, 0, 0, 0.0, 0.0,
                quality_score=0.0,
                extra_meta={"escalation_flag": True, "auop_score": 0.0,
                            "reason": "Blocked by AEOS Governance Gate"},
            )
            cost_cfg   = scenario.cost if scenario else CostConfig()
            db_agent   = db.get_agent(agent_instance.agent_id)
            model_name = db_agent.model_name if db_agent else "unknown"
            prev_event_hash = self._push_ecl_event(
                ecl_api_key            = ecl_api_key,
                decision_id            = task_id,
                agent_id               = agent_instance.agent_id,
                workflow_id            = workflow_id,
                skill                  = step.task_type,
                model                  = model_name,
                input_tokens           = 0,
                output_tokens          = 0,
                wall_ms                = 0.0,
                vendor_cost_usd        = 0.0,
                human_baseline_minutes = cost_cfg.human_baseline_minutes,
                manual_hourly_cost_usd = cost_cfg.manual_hourly_cost_usd,
                cost_center            = cost_cfg.cost_center,
                ledger_account         = cost_cfg.ledger_account,
                prev_event_hash        = prev_event_hash,
                policy_outcome         = "blocked",
                human_review           = "queued",
            )
            return task_id, TaskResult.ESCALATED, 0.0, agent_instance.agent_id, \
                "Halted by Governance Compliance Gate", prev_event_hash

        # V2 enhancements: inject customer context (step 2) and build prompt overrides
        is_v2 = scenario and scenario.scenario_id == "v2-tuned-pipeline"
        if is_v2:
            _ap = (scenario.metadata or {}).get("agent_params", {})
            _p2 = _ap.get("agent-triage-scorer-01", {})
            data_prefetch = bool(
                _p2.get("data_prefetch",
                (scenario.metadata or {}).get("data_prefetch", True))
            )
        else:
            data_prefetch = False
        if is_v2 and step.step_number == 2 and data_prefetch:
            text = self._inject_customer_context(text)
        v2_prompt = self._build_v2_prompt(step, scenario, agent_instance) if is_v2 else None

        # Build a result container so the queue callback can write back
        result_box: dict = {}
        done_event = threading.Event()

        request = {
            "request_id":             str(uuid.uuid4())[:8],
            "task_type":              step.task_type,
            "customer":               "orchestrator",
            "text":                   text,
            "_callback":              lambda r: (result_box.update(r), done_event.set()),
            "_system_prompt_override": v2_prompt,
        }

        agent_instance.enqueue(request)
        done_event.wait(timeout=120)  # wait up to 2 minutes per step

        if not result_box:
            # Timed out
            task_id = str(uuid.uuid4())[:12]
            self._log_task(task_id, agent_instance.agent_id, workflow_id,
                           step, TaskResult.TIMEOUT, 0, 0, 0.0, 0.0,
                           quality_score=0.0, extra_meta={"escalation_flag": False, "auop_score": 0.0})
            return task_id, TaskResult.TIMEOUT, 0.0, agent_instance.agent_id, text, prev_event_hash

        task_result   = TaskResult(result_box.get("result", "failure"))
        input_tokens  = result_box.get("input_tokens", 0)
        output_tokens = result_box.get("output_tokens", 0)
        latency_ms    = result_box.get("latency_ms", 0.0)
        output_text   = result_box.get("answer", text)
        quality       = result_box.get("quality", 0.90)

        # ── Extract structured fields from agent output ────────────────────────
        step_meta = {
            "agent_output":     output_text,   # raw answer — used as V2 input reference
            "confidence_score": result_box.get("confidence_score"),
            "priority":         result_box.get("priority"),
            "sentiment_flag":   result_box.get("sentiment_flag"),
            "routing_reason":   result_box.get("routing_reason"),
            "rationale":        result_box.get("rationale"),
            "escalation_flag":  False,
        }

        # ── AUoP score: quality per second — higher = more efficient ──────────
        auop_score = round(quality / (latency_ms / 1000), 4) if latency_ms > 0 else 0.0
        step_meta["auop_score"] = auop_score

        # Calculate cost using agent's registered rates
        db_agent = db.get_agent(agent_instance.agent_id)
        if db_agent:
            cost = (input_tokens / 1000 * db_agent.cost_per_1k_input +
                    output_tokens / 1000 * db_agent.cost_per_1k_output)
        else:
            cost = (input_tokens / 1000 * step.input_tokens / 1000 *
                    0.0008 + output_tokens / 1000 * 0.004)
        cost = round(cost, 6)

        task_id = str(uuid.uuid4())[:12]
        self._log_task(task_id, agent_instance.agent_id, workflow_id,
                       step, task_result, input_tokens, output_tokens,
                       latency_ms, cost, quality, step_meta)

        model_name = db_agent.model_name if db_agent else "unknown"
        cost_cfg   = scenario.cost if scenario else CostConfig()

        # Predicted cost: estimated tokens × price (known before AI call)
        predicted_cost_usd = (
            step.input_tokens  / 1000.0 * cost_cfg.price_per_1k_input +
            step.output_tokens / 1000.0 * cost_cfg.price_per_1k_output
        )
        # Predicted outcome: what a human would have cost for this task
        predicted_outcome_usd = cost_cfg.manual_cost_per_task
        # Labor saved: credit full manual cost on success, zero otherwise
        labor_value_saved_usd = (
            cost_cfg.manual_cost_per_task if task_result == TaskResult.SUCCESS else 0.0
        )

        new_event_hash = self._push_ecl_event(
            ecl_api_key            = ecl_api_key,
            decision_id            = task_id,
            agent_id               = agent_instance.agent_id,
            workflow_id            = workflow_id,
            skill                  = step.task_type,
            model                  = model_name,
            input_tokens           = input_tokens,
            output_tokens          = output_tokens,
            wall_ms                = latency_ms,
            vendor_cost_usd        = cost,
            human_baseline_minutes = cost_cfg.human_baseline_minutes,
            manual_hourly_cost_usd = cost_cfg.manual_hourly_cost_usd,
            cost_center            = cost_cfg.cost_center,
            ledger_account         = cost_cfg.ledger_account,
            prev_event_hash        = prev_event_hash,
            predicted_cost_usd     = predicted_cost_usd,
            predicted_outcome_usd  = predicted_outcome_usd,
            labor_value_saved_usd  = labor_value_saved_usd,
        )

        return task_id, task_result, cost, agent_instance.agent_id, output_text, new_event_hash

    # ── V2 prompt building ─────────────────────────────────────────────────────

    def _build_v2_prompt(
        self,
        step: PipelineStep,
        scenario: "ScenarioConfig",
        agent_instance: "BaseAgent",
    ) -> Optional[str]:
        """
        Build an enhanced system prompt for V2 runs.
        Applies tuning dial values from scenario.metadata on top of the base prompt.
        Returns None if no enhancement applies (falls through to default prompt).
        """
        meta = scenario.metadata or {}
        base = agent_instance._system_prompt

        # Per-agent params: read from nested agent_params, fall back to flat keys
        # for backward compatibility with any scenarios saved before this change.
        _ap = meta.get("agent_params", {})

        if step.step_number == 1:
            _p1       = _ap.get("agent-intake-classifier-01", {})
            precision = _p1.get("prompt_precision",
                        meta.get("prompt_precision", "standard"))
            strict_note = (
                "\nEnsure your JSON is strictly valid — no extra keys, no markdown.\n"
                if precision == "strict" else ""
            )
            return (
                base
                + "\n\nV2 ENHANCEMENT — BLENDED REQUEST DETECTION:\n"
                "If this message contains more than one distinct issue "
                "(e.g. a billing problem AND a technical problem), classify both.\n"
                "Add to your JSON output:\n"
                '  "secondary_task_type": <label or null>\n'
                '  "is_blended": <true|false>\n'
                + strict_note
            )

        if step.step_number == 2:
            _p2 = _ap.get("agent-triage-scorer-01", {})
            sw  = float(_p2.get("sentiment_weight",
                        meta.get("sentiment_weight", 0.50)))
            return (
                base
                + f"\n\nV2 ENHANCEMENT — SENTIMENT-WEIGHTED PRIORITY (weight={sw:.2f}):\n"
                "Customer context has been pre-fetched and prepended to the input.\n"
                "Factor in historical request volume for this task type when scoring.\n"
                + (
                    "If sentiment is negative AND sentiment_weight > 0.6, "
                    "raise priority by at least 1 level.\n"
                    if sw > 0.6 else ""
                )
            )

        if step.step_number == 3:
            tone_instructions = {
                "formal":     "Maintain a professional, formal tone throughout.",
                "empathetic": "Lead with empathy — acknowledge the customer's frustration first.",
                "direct":     "Be direct and concise. No filler phrases. Get to the point.",
                "concise":    "Keep the response under 50 words. Every word must count.",
            }
            _p3  = _ap.get("response_drafter", {})
            tone = _p3.get("tone_variant",
                   meta.get("tone_variant", "formal"))
            tone_instr = tone_instructions.get(tone, tone_instructions["formal"])
            return (
                base
                + f"\n\nV2 ENHANCEMENT — TONE & SELF-REVIEW:\n"
                f"TONE: {tone_instr}\n"
                "EDIT LOOP: After your initial draft, review it once:\n"
                "  - Does it match the required tone?\n"
                "  - Is it under 80 words?\n"
                "  - Does it address the customer's specific issue?\n"
                "If any answer is no, rewrite it. Output only the final version in the same JSON schema.\n"
            )

        return None

    def _inject_customer_context(self, text: str) -> str:
        """
        Pre-fetch customer context and prepend it to the Triage Scorer input.
        Looks up historical task counts + avg priority for this task type from DB.
        """
        try:
            _ct = text.strip()
            if _ct.startswith("```"):
                _ct = _ct.split("\n", 1)[-1]
            if _ct.endswith("```"):
                _ct = _ct.rsplit("```", 1)[0]
            parsed    = json.loads(_ct.strip())
            task_type = parsed.get("task_type", "general_inquiry")

            prev_tasks = db.get_tasks(task_type=task_type)
            n_prev     = len(prev_tasks)
            priorities = [
                int(t.metadata.get("priority", 0))
                for t in prev_tasks[:20]
                if t.metadata.get("priority")
            ]
            avg_priority = round(sum(priorities) / len(priorities), 1) if priorities else 3.0

            context = (
                f"[CUSTOMER CONTEXT — PRE-FETCHED]\n"
                f"Task type '{task_type}': {n_prev} historical request(s) on record.\n"
                f"Average historical priority for this type: {avg_priority}/5\n"
                f"Account tier: standard\n"
                f"[END CONTEXT]\n\n"
            )
            return context + text
        except Exception:
            return text

    def _resolve_agent(self, step: PipelineStep, input_text: str = None) -> Optional["BaseAgent"]:
        """Find the agent instance for a pipeline step."""
        # 1. Step has a specific agent assigned — use it directly
        if step.agent_id and step.agent_id in self.agent_pool:
            return self.agent_pool[step.agent_id]

        # 2. For steps without a fixed agent (e.g. response drafter), parse the
        #    task_type from the pipeline input JSON — this carries the classification
        #    from Step 1 forward so the right specialist is always selected.
        routed_task_type = None
        if input_text:
            try:
                _ct = input_text.strip()
                if _ct.startswith("```"):
                    _ct = _ct.split("\n", 1)[-1]
                if _ct.endswith("```"):
                    _ct = _ct.rsplit("```", 1)[0]
                routed_task_type = json.loads(_ct.strip()).get("task_type")
            except (json.JSONDecodeError, ValueError, TypeError):
                pass

        task_type = routed_task_type or step.task_type
        agent = self.triage.find_agent(task_type, self.agent_pool)
        if agent is None:
            # Last resort fallback
            _, agent = self.triage.route(step.task_type, self.agent_pool)
        return agent

    # ── ECL telemetry ──────────────────────────────────────────────────────────

    @staticmethod
    def _compute_audit_hash(prev_hash: Optional[str], payload_json: str) -> str:
        message = (prev_hash or "null") + payload_json
        return hmac.new(_ECL_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()

    def _push_ecl_event(
        self,
        ecl_api_key:            str,
        decision_id:            str,
        agent_id:               str,
        workflow_id:            str,
        skill:                  str,
        model:                  str,
        input_tokens:           int,
        output_tokens:          int,
        wall_ms:                float,
        vendor_cost_usd:        float,
        human_baseline_minutes: float,
        manual_hourly_cost_usd: float,
        cost_center:            str,
        ledger_account:         str,
        prev_event_hash:        Optional[str],
        predicted_cost_usd:     float = 0.0,
        predicted_outcome_usd:  float = 0.0,
        labor_value_saved_usd:  float = 0.0,
        policy_outcome:         Optional[str] = None,
        human_review:           Optional[str] = None,
    ) -> Optional[str]:
        """
        Build a Canonical Event v1, compute the HMAC audit hash, POST to the ECL,
        and return the new auditHash to be used as prevEventHash in the next step.
        Returns None on any error so the pipeline is never blocked by ECL failures.
        """
        payload = {
            "hyperscaler": "anthropic",
            "raw": {
                "id":    f"evt-{str(uuid.uuid4())[:8]}",
                "model": model,
                "usage": {
                    "input_tokens":  input_tokens,
                    "output_tokens": output_tokens,
                },
            },
            "ctx": {
                "agentId":               agent_id,
                "workflowId":            workflow_id,
                "skill":                 skill,
                "trigger":               "orchestrator",
                "capturedVia":           "fuzebox_python_v2",
                "costCenter":            cost_center,
                "ledgerAccount":         ledger_account,
                "humanBaselineMinutes":  human_baseline_minutes,
                "manualHourlyCostUsd":   manual_hourly_cost_usd,
                # Predicted columns (filled before AI returns)
                "predictedCostUsd":      round(predicted_cost_usd, 6),
                "predictedOutcomeUsd":   round(predicted_outcome_usd, 4),
                # Actual columns (filled after AI returns token usage)
                "vendorCostUsd":         round(vendor_cost_usd, 6),
                "laborValueSavedUsd":    round(labor_value_saved_usd, 4),
                "policyOutcome":         policy_outcome,
                "humanReview":           human_review,
            },
            "qualityConfidence": None,
            "reworkMinutes":     0,
        }
        payload_json  = json.dumps(payload, sort_keys=True)
        audit_hash    = self._compute_audit_hash(prev_event_hash, payload_json)
        payload["auditHash"]      = audit_hash
        payload["prevEventHash"]  = prev_event_hash

        try:
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {ecl_api_key}",
            }
            resp = _http.post(_ECL_ENDPOINT, json=payload, headers=headers, timeout=5)
            resp.raise_for_status()
        except Exception as exc:
            print(f"  [ECL] Push failed for decision {decision_id}: {exc}")
            return None

        return audit_hash

    def _log_task(
        self,
        task_id: str,
        agent_id: str,
        workflow_id: str,
        step: PipelineStep,
        result: TaskResult,
        input_tokens: int,
        output_tokens: int,
        latency_ms: float,
        cost_usd: float,
        quality_score: float = 0.90,
        extra_meta: dict = None,
    ) -> None:
        now = datetime.utcnow()
        metadata = {
            "step_number":      step.step_number,
            "step_name":        step.name,
            "timestamp":        now.isoformat(),
            "completion_status": result.value,
            "escalation_flag":  False,
            "auop_score":       None,
        }
        if extra_meta:
            metadata.update(extra_meta)

        task = TaskRecord(
            task_id       = task_id,
            agent_id      = agent_id,
            workflow_id   = workflow_id,
            task_type     = step.task_type,
            description   = step.name,
            result        = result,
            started_at    = now,
            completed_at  = now,
            latency_ms    = latency_ms,
            input_tokens  = input_tokens,
            output_tokens = output_tokens,
            total_tokens  = input_tokens + output_tokens,
            cost_usd      = cost_usd,
            quality_score = quality_score if result == TaskResult.SUCCESS else 0.0,
            metadata      = metadata,
        )
        db.insert_task(task)
