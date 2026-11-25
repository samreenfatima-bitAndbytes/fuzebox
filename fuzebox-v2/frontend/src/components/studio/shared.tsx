"use client";

import { useState } from "react";
import type { TaskStepRow } from "@/lib/types";

export const TONE_OPTIONS = ["formal", "empathetic", "direct", "concise"] as const;
export const PRECISION_OPTIONS = ["standard", "strict", "relaxed"] as const;

export function runOutcomeColor(
  result: string,
  escalated: boolean,
): string {
  if (escalated) return "#DC2626";
  if (result === "success") return "#2DA44E";
  return "#F59E0B";
}

export function stepPill(step: TaskStepRow) {
  const esc = step.escalation_flag;
  const color = esc ? "#DC2626" : step.result === "success" ? "#2DA44E" : "#F59E0B";
  const label = esc ? "ESCALATED" : step.result.toUpperCase();
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={{ color, borderColor: color }}
    >
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function StepExpander({ step, label }: { step: TaskStepRow; label: string }) {
  const [open, setOpen] = useState(false);
  let output: React.ReactNode = null;
  if (step.agent_output) {
    try {
      const parsed =
        typeof step.agent_output === "string"
          ? JSON.parse(step.agent_output)
          : step.agent_output;
      output = (
        <pre className="mt-2 max-h-48 overflow-auto fb-code">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      output = (
        <pre className="mt-2 max-h-48 overflow-auto fb-code">
          {String(step.agent_output)}
        </pre>
      );
    }
  }

  return (
    <div className="rounded-md border border-brand-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium fb-hover"
      >
        {label}
        <span className="text-brand-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-brand-border px-3 py-3">
          {stepPill(step)}
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-xs text-brand-muted">Latency</div>
              <div>{step.latency_ms}ms</div>
            </div>
            <div>
              <div className="text-xs text-brand-muted">Tokens</div>
              <div>{step.total_tokens}</div>
            </div>
            <div>
              <div className="text-xs text-brand-muted">Cost</div>
              <div>${step.cost_usd.toFixed(5)}</div>
            </div>
            <div>
              <div className="text-xs text-brand-muted">AUoP</div>
              <div>
                {step.auop_score != null ? Number(step.auop_score).toFixed(3) : "—"}
              </div>
            </div>
          </div>
          {output}
        </div>
      )}
    </div>
  );
}

export function HandlerBar({ label, escalated }: { label: string; escalated: boolean }) {
  const agentPct = escalated ? 0 : 100;
  const humanPct = 100 - agentPct;
  return (
    <div className="mb-2">
      <div className="mb-1 text-xs font-medium text-brand-muted">{label}</div>
      <div className="flex h-8 overflow-hidden rounded-lg border border-brand-border">
        <div
          className="flex items-center justify-center text-xs font-bold text-white"
          style={{
            width: `${agentPct}%`,
            backgroundColor: escalated ? "#6B7280" : "#2DA44E",
          }}
        >
          {agentPct > 15 ? `🤖 ${agentPct}%` : ""}
        </div>
        <div
          className="flex items-center justify-center text-xs font-bold text-brand-muted"
          style={{
            width: `${humanPct}%`,
            backgroundColor: escalated ? "#DC2626" : "#E5E7EB",
          }}
        >
          {humanPct > 15 ? `🧑 ${humanPct}%` : ""}
        </div>
      </div>
    </div>
  );
}
