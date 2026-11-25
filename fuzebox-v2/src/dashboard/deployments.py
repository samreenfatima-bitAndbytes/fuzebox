"""Deploy Agent Code — parse, validate, UoP instructions (AEOS parity)."""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class ParsedDeployment:
    agent_kind: str
    manifest: dict[str, Any]
    validation_status: str
    validation_notes: str


def parse_agent_code(code_language: str, raw_code: str) -> ParsedDeployment:
    lang = (code_language or "").strip().lower()
    if not raw_code or not str(raw_code).strip():
        return ParsedDeployment(
            agent_kind="agent",
            manifest={},
            validation_status="errors",
            validation_notes="Empty payload",
        )

    notes: list[str] = []

    if lang == "json":
        try:
            obj = json.loads(raw_code)
            manifest: dict[str, Any] = {
                "agent_id": obj.get("agent_id") or obj.get("id"),
                "name": obj.get("name") or obj.get("agent_name"),
                "hyperscaler": obj.get("hyperscaler") or obj.get("provider") or "anthropic",
                "model": obj.get("model"),
                "workflow_id": obj.get("workflow_id") or obj.get("workflow"),
                "vendor": obj.get("vendor"),
                "skills": obj.get("skills") or obj.get("tools") or [],
                "triggers": obj.get("triggers") or [],
                "guardrails": obj.get("guardrails") or obj.get("policies") or [],
                "inputs": obj.get("inputs") or obj.get("input_schema"),
                "outputs": obj.get("outputs") or obj.get("output_schema"),
                "rop_target": obj.get("rop_target") or obj.get("ropTarget"),
                "recursive_depth": obj.get("recursive_depth") or obj.get("recursiveDepth"),
            }
            if not manifest["agent_id"]:
                notes.append("missing agent_id (will be auto-generated)")
            if not manifest["model"]:
                notes.append("no model specified — defaulting to claude-sonnet-4-6")
            kind = (
                obj.get("kind")
                or obj.get("agent_kind")
                or ("crew" if isinstance(obj.get("agents"), list) else None)
                or ("workflow" if isinstance(obj.get("tasks"), list) else None)
                or "agent"
            )
            return ParsedDeployment(
                agent_kind=str(kind),
                manifest=manifest,
                validation_status="warnings" if notes else "valid",
                validation_notes=" · ".join(notes) or "JSON manifest parsed cleanly.",
            )
        except json.JSONDecodeError as exc:
            return ParsedDeployment(
                agent_kind="agent",
                manifest={"_raw": raw_code[:800]},
                validation_status="errors",
                validation_notes=f"Invalid JSON: {exc}",
            )

    if lang == "crewai":
        agents = re.findall(r"Agent\s*\(([^)]*)\)", raw_code)
        tasks = re.findall(r"Task\s*\(([^)]*)\)", raw_code)
        crews = re.findall(r"Crew\s*\(([^)]*)\)", raw_code)
        tools = re.findall(r"tools\s*=\s*\[([^\]]*)\]", raw_code)
        role_m = re.search(r'role\s*=\s*["\']([^"\']+)["\']', raw_code)
        goal_m = re.search(r'goal\s*=\s*["\']([^"\']+)["\']', raw_code)
        back_m = re.search(r'backstory\s*=\s*["\']([^"\']+)["\']', raw_code)
        llm_m = re.search(r'llm\s*=\s*["\']([^"\']+)["\']', raw_code)
        llm = llm_m.group(1) if llm_m else None
        hyperscaler = "openai" if llm and "gpt" in llm else "anthropic"
        tool_list: list[str] = []
        for block in tools:
            tool_list.extend(
                [s.strip() for s in block.split(",") if s.strip()],
            )
        manifest = {
            "agent_id": None,
            "hyperscaler": hyperscaler,
            "model": llm,
            "role": role_m.group(1) if role_m else None,
            "goal": goal_m.group(1) if goal_m else None,
            "backstory": back_m.group(1) if back_m else None,
            "agentCount": len(agents),
            "taskCount": len(tasks),
            "crewCount": len(crews),
            "tools": tool_list[:30],
        }
        if not agents:
            notes.append("no Agent(...) constructor detected")
        if not tasks:
            notes.append("no Task(...) constructor detected")
        kind = (
            "crew"
            if crews
            else "workflow"
            if len(tasks) > 1
            else "agent"
        )
        return ParsedDeployment(
            agent_kind=kind,
            manifest=manifest,
            validation_status="warnings" if notes else "valid",
            validation_notes=" · ".join(notes)
            or f"Detected {len(agents)} agent(s), {len(tasks)} task(s), {len(crews)} crew(s).",
        )

    defs = re.findall(r"def\s+(\w+)\s*\(", raw_code)
    classes = re.findall(r"class\s+(\w+)\s*[\(:]", raw_code)
    imports = re.findall(r"(?:^|\n)\s*(?:from|import)\s+([\w.]+)", raw_code)[:20]
    manifest = {
        "agent_id": None,
        "hyperscaler": "anthropic",
        "classes": classes,
        "functions": defs,
        "imports": imports,
        "lineCount": len(raw_code.splitlines()),
    }
    if not defs and not classes:
        notes.append("no functions or classes detected")
    kind = "workflow" if len(classes) > 1 else "agent"
    return ParsedDeployment(
        agent_kind=kind,
        manifest=manifest,
        validation_status="warnings" if notes else "valid",
        validation_notes=" · ".join(notes)
        or f"Detected {len(classes)} class(es), {len(defs)} function(s), {len(imports)} import(s).",
    )


def build_uop_instructions(
    *,
    name: str,
    classification: str,
    trust_tier: str,
    rop_target: float,
    recursive_depth: int,
    parsed: ParsedDeployment,
    reuse_from: Optional[dict[str, Any]] = None,
) -> str:
    tt_human = trust_tier.replace("_", " · ")
    if reuse_from:
        reuse_line = (
            f"Inherits economic profile from UoP **{reuse_from.get('name')}** "
            f"({reuse_from.get('uop_id')}) · prior RoP {float(reuse_from.get('rop', 0)):.2f}×."
        )
    else:
        reuse_line = "No prior UoP inheritance — this is a greenfield deployment."

    return "\n".join(
        [
            f"# UoP Instructions — {name}",
            "",
            "## 1. Identity & Classification",
            f"- **Agent Kind:** {parsed.agent_kind}",
            f"- **Classification:** {classification}",
            f"- **Trust Tier:** {tt_human}",
            f"- **RoP Target:** {rop_target:.2f}×",
            f"- **Recursive Depth:** {recursive_depth}",
            f"- **Reuse:** {reuse_line}",
            "",
            "## 2. Parsed Manifest Summary",
            "```json",
            json.dumps(parsed.manifest, indent=2, default=str)[:4000],
            "```",
            "",
            "## 3. Governance Constraints",
            f"- Cannot exceed RoP target {rop_target:.2f}× without operator attestation.",
            "- Must register on Coverage Manifest under its hyperscaler · surface combination.",
            "- Off-policy outputs are logged-only at T0 / T1, blocked at T2+.",
            "",
            "## 4. Bootstrapping",
            "- Register in agent registry at selected trust tier.",
            "- Shadow execution against recent ledger rows before live routing.",
            "- Publish to UoP Library after 50 ledger-closed events.",
            "",
            "_Generated at deploy time. Re-renders on each retrain cycle._",
        ]
    )


def trust_tier_to_level(trust_tier: str) -> int:
    t = (trust_tier or "").upper()
    if t.startswith("T4"):
        return 4
    if t.startswith("T3"):
        return 3
    if t.startswith("T2"):
        return 2
    if t.startswith("T1"):
        return 1
    return 0


def new_deployment_id() -> str:
    return f"dep-{uuid.uuid4().hex[:10]}"


def deployment_signature(deployment_id: str, raw_code: str) -> str:
    digest = hashlib.sha256(raw_code.encode()).hexdigest()[:16]
    return f"sig_{deployment_id}_{digest}"


def resolve_agent_id(manifest: dict[str, Any], name: str, deployment_id: str) -> str:
    if manifest.get("agent_id"):
        return str(manifest["agent_id"])
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "agent").lower()).strip("-")[:40]
    return slug or deployment_id


SAMPLE_CODE: dict[str, str] = {
    "json": json.dumps(
        {
            "agent_id": "agt_pricing_optimizer",
            "name": "Pricing Optimizer",
            "hyperscaler": "anthropic",
            "model": "claude-sonnet-4-6",
            "workflow_id": "wf_pricing_q3",
            "skills": ["pull_competitor_pricing", "compute_elasticity", "post_to_pos"],
            "triggers": ["cron:0 */6 * * *"],
            "guardrails": ["max_change_pct:0.08"],
            "rop_target": 4.5,
            "recursive_depth": 3,
        },
        indent=2,
    ),
    "crewai": """from crewai import Agent, Task, Crew

researcher = Agent(
  role="Edge Researcher",
  goal="Surface advantageous lines across NFL books",
  backstory="Quant who reads four sportsbooks at once.",
  llm="anthropic/claude-sonnet-4-6",
)

writer = Agent(
  role="Recommendation Writer",
  goal="Compose customer-facing edge note",
  backstory="Senior content producer with compliance training.",
  llm="anthropic/claude-opus-4-6",
)

scan = Task(description="Pull and normalize lines", agent=researcher)
write = Task(description="Write the edge note", agent=writer)
crew = Crew(agents=[researcher, writer], tasks=[scan, write])
""",
    "python": """# Customer Response Triage agent
class CustomerResponseTriage:
    model = "gpt-4-mini"
    trust_tier = "T0_unverified"

    def run(self, msg):
        intent = self.classify(msg)
        if intent.confidence < 0.7:
            return self.escalate_to_human(msg, intent)
        return self.route(intent)
""",
}
