"use client";

import { useMemo, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/Modal";
import type { DeploymentRow } from "@/lib/types";

export type WorkflowExecution = {
  deploymentId: string;
  title: string;
  trustTier: string;
  classification: string;
  recursiveDepth: number;
  agentKind: string;
  codeLanguage: string;
  manifestJson: string;
};

export function deploymentToWorkflowExec(d: DeploymentRow): WorkflowExecution {
  return {
    deploymentId: d.deploymentId,
    title: d.name,
    trustTier: d.trustTier,
    classification: d.classification,
    recursiveDepth: d.recursiveDepth,
    agentKind: d.agentKind,
    codeLanguage: d.codeLanguage,
    manifestJson: d.manifestJson,
  };
}

type NodeKind = "start" | "agent" | "policy" | "human" | "end";
type NodeDef = {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

const KIND_STYLES: Record<
  NodeKind,
  { tag: string; ring: string; barBg: string }
> = {
  start: { tag: "ENTRY", ring: "hsl(170 70% 45%)", barBg: "hsl(170 70% 45%)" },
  agent: { tag: "AGENT TASK", ring: "hsl(263 60% 56%)", barBg: "hsl(142 70% 42%)" },
  policy: { tag: "POLICY CHECK", ring: "hsl(0 72% 56%)", barBg: "hsl(25 95% 55%)" },
  human: { tag: "HUMAN TASK", ring: "hsl(220 60% 56%)", barBg: "hsl(220 30% 60%)" },
  end: { tag: "", ring: "hsl(220 10% 60%)", barBg: "" },
};

function buildWorkflowNodes(exec: WorkflowExecution): {
  nodes: NodeDef[];
  edges: { from: string; to: string }[];
} {
  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(exec.manifestJson || "{}") as Record<string, unknown>;
  } catch {
    /* keep empty */
  }

  const NODE_W = 200;
  const NODE_H = 96;
  const GAP_Y = 32;
  const START_X = 300;
  const nodes: NodeDef[] = [];
  const edges: { from: string; to: string }[] = [];

  nodes.push({
    id: "start",
    kind: "start",
    label: exec.title,
    x: START_X,
    y: 16,
    w: NODE_W,
    h: 64,
  });

  let y = 16 + 64 + GAP_Y;

  const skills: string[] = Array.isArray(manifest.skills)
    ? (manifest.skills as string[])
    : Array.isArray(manifest.tasks)
      ? (manifest.tasks as unknown[]).map((t) =>
          typeof t === "string"
            ? t
            : String(
                (t as { description?: string; name?: string }).description ??
                  (t as { name?: string }).name ??
                  "Task",
              ),
        )
      : [];

  const mainIds: string[] = ["start"];

  if (skills.length === 0) {
    const id = "agent_0";
    nodes.push({
      id,
      kind: "agent",
      label: exec.title,
      sub: exec.agentKind,
      x: START_X,
      y,
      w: NODE_W,
      h: NODE_H,
    });
    mainIds.push(id);
    y += NODE_H + GAP_Y;
  } else {
    skills.forEach((s, i) => {
      const id = `step_${i}`;
      const label = String(s)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      nodes.push({
        id,
        kind: "agent",
        label,
        sub: exec.agentKind,
        x: START_X,
        y,
        w: NODE_W,
        h: NODE_H,
      });
      mainIds.push(id);
      y += NODE_H + GAP_Y;
    });
  }

  const guardrails: string[] = Array.isArray(manifest.guardrails)
    ? (manifest.guardrails as string[])
    : [];
  if (guardrails.length > 0) {
    let gy = 16 + 64 + GAP_Y;
    guardrails.forEach((g, i) => {
      const id = `guard_${i}`;
      const label = String(g)
        .replace(/_/g, " ")
        .replace(/:/g, ": ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      nodes.push({
        id,
        kind: "policy",
        label,
        x: START_X + NODE_W + 80,
        y: gy,
        w: NODE_W,
        h: NODE_H,
      });
      const fromId = mainIds[i + 1] ?? mainIds[mainIds.length - 1];
      edges.push({ from: fromId, to: id });
      gy += NODE_H + GAP_Y;
    });
  }

  const triggers: string[] = Array.isArray(manifest.triggers)
    ? (manifest.triggers as string[])
    : [];
  const humanTriggers = triggers.filter((t) => /human|gate|review/i.test(String(t)));
  if (humanTriggers.length > 0) {
    humanTriggers.forEach((t, i) => {
      const id = `human_${i}`;
      const label = String(t)
        .replace(/_/g, " ")
        .replace(/:/g, ": ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      nodes.push({
        id,
        kind: "human",
        label,
        x: START_X - NODE_W - 80,
        y: 16 + 64 + GAP_Y + i * (NODE_H + GAP_Y),
        w: NODE_W,
        h: NODE_H,
      });
      edges.push({ from: "start", to: id });
    });
  }

  const endId = "end";
  nodes.push({
    id: endId,
    kind: "end",
    label: "Process Complete",
    x: START_X,
    y,
    w: NODE_W,
    h: 56,
  });
  mainIds.push(endId);

  for (let i = 0; i < mainIds.length - 1; i++) {
    edges.push({ from: mainIds[i], to: mainIds[i + 1] });
  }

  return { nodes, edges };
}

function WorkflowCanvas({ exec }: { exec: WorkflowExecution }) {
  const { nodes, edges } = useMemo(() => buildWorkflowNodes(exec), [exec]);
  const [canvasTab, setCanvasTab] = useState<"workflow" | "manifest">("workflow");

  const nodeMap: Record<string, NodeDef> = Object.fromEntries(
    nodes.map((n) => [n.id, n]),
  );

  function pathFor(fromId: string, toId: string): string {
    const a = nodeMap[fromId];
    const b = nodeMap[toId];
    if (!a || !b) return "";
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h;
    const bx = b.x + b.w / 2;
    const by = b.y;
    if (Math.abs(ax - bx) < 4) return `M ${ax} ${ay} L ${bx} ${by}`;
    const midY = ay + (by - ay) / 2;
    return `M ${ax} ${ay} L ${ax} ${midY} L ${bx} ${midY} L ${bx} ${by}`;
  }

  const maxX = Math.max(...nodes.map((n) => n.x + n.w)) + 40;
  const maxY = Math.max(...nodes.map((n) => n.y + n.h)) + 40;

  let manifest: Record<string, unknown> = {};
  try {
    manifest = JSON.parse(exec.manifestJson || "{}") as Record<string, unknown>;
  } catch {
    /* keep empty */
  }

  const taskLabels = nodes
    .filter((n) => n.kind !== "start" && n.kind !== "end")
    .map((n) => n.label);

  return (
    <div className="flex min-h-0 flex-col overflow-hidden md:max-h-[70vh] md:min-h-[420px] md:flex-row">
      <div className="flex min-h-[min(52vh,360px)] min-w-0 flex-1 flex-col overflow-hidden md:min-h-0">
        <div className="flex shrink-0 items-center gap-1 border-b border-brand-border bg-[var(--surface-muted)] px-4 py-2">
          <button
            type="button"
            onClick={() => setCanvasTab("workflow")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              canvasTab === "workflow"
                ? "bg-brand-primary/10 text-brand-primary"
                : "text-brand-muted hover:bg-[var(--surface-muted)]"
            }`}
          >
            Workflow
          </button>
          <button
            type="button"
            onClick={() => setCanvasTab("manifest")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              canvasTab === "manifest"
                ? "bg-brand-primary/10 text-brand-primary"
                : "text-brand-muted hover:bg-[var(--surface-muted)]"
            }`}
          >
            Manifest
          </button>
        </div>

        {canvasTab === "manifest" ? (
          <div className="flex-1 overflow-auto p-3 sm:p-4">
            <pre className="whitespace-pre-wrap break-all rounded-lg border border-brand-border bg-[var(--surface-muted)] p-3 font-mono text-[11px] leading-relaxed sm:p-4">
              {JSON.stringify(manifest, null, 2) || exec.manifestJson}
            </pre>
          </div>
        ) : (
          <div
            className="relative min-h-0 flex-1 overflow-auto"
            style={{ background: "hsl(220 14% 98%)" }}
          >
            <div
              className="relative p-3 sm:p-5"
              style={{ width: Math.max(maxX, 600), height: Math.max(maxY, 400) }}
            >
              <svg
                className="pointer-events-none absolute inset-0"
                width={Math.max(maxX, 600)}
                height={Math.max(maxY, 400)}
              >
                <defs>
                  <marker
                    id="wf-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="4"
                    orient="auto"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 Z" fill="hsl(213 84% 56%)" />
                  </marker>
                </defs>
                {edges.map((e, i) => (
                  <path
                    key={i}
                    d={pathFor(e.from, e.to)}
                    fill="none"
                    stroke="hsl(213 84% 56%)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    markerEnd="url(#wf-arrow)"
                  />
                ))}
              </svg>

              {nodes.map((n) => {
                const styles = KIND_STYLES[n.kind];
                return (
                  <div
                    key={n.id}
                    className="absolute"
                    style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                  >
                    {n.kind === "start" ? (
                      <div
                        className="flex h-full w-full items-center justify-center rounded-xl px-3 text-center text-sm font-semibold text-white"
                        style={{
                          background:
                            "linear-gradient(135deg, hsl(170 70% 45%), hsl(190 65% 40%))",
                        }}
                      >
                        <span className="truncate">{n.label}</span>
                      </div>
                    ) : n.kind === "end" ? (
                      <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-brand-border bg-[var(--surface-card)] text-sm font-medium text-brand-ink">
                        {n.label}
                      </div>
                    ) : (
                      <div
                        className="relative flex h-full w-full flex-col rounded-xl border-2 bg-[var(--surface-card)] p-3"
                        style={{ borderColor: `${styles.ring}33` }}
                      >
                        <div
                          className="mb-1 self-start rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide leading-none"
                          style={{ color: styles.ring }}
                        >
                          {styles.tag}
                        </div>
                        <div className="text-xs font-semibold leading-snug break-words">
                          {n.label}
                        </div>
                        {n.sub ? (
                          <div className="mt-1 text-[11px] leading-snug text-brand-muted">
                            {n.sub}
                          </div>
                        ) : null}
                        <div
                          className="mt-auto h-1 w-10 self-end rounded-full"
                          style={{ background: `${styles.barBg}55` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="max-h-[min(38vh,280px)] w-full shrink-0 overflow-y-auto border-t border-brand-border bg-[var(--surface-card)] px-3 py-4 md:max-h-none md:w-56 md:border-l md:border-t-0">
        <p className="text-xs font-semibold text-brand-ink">Agent info</p>
        <dl className="mt-2 space-y-1 text-[11px]">
          <div className="flex justify-between gap-2">
            <dt className="text-brand-muted">Kind</dt>
            <dd className="font-medium">{exec.agentKind}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-brand-muted">Language</dt>
            <dd className="font-medium">{exec.codeLanguage}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-brand-muted">Trust</dt>
            <dd className="truncate font-medium">{exec.trustTier.replace(/_/g, " ")}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-brand-muted">Depth</dt>
            <dd className="font-medium">{exec.recursiveDepth}</dd>
          </div>
        </dl>

        <p className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
          Steps ({taskLabels.length})
        </p>
        <ul className="space-y-1.5 text-[11px]">
          {taskLabels.map((t, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-muted/40" />
              <span className="min-w-0 flex-1 leading-snug break-words">{t}</span>
            </li>
          ))}
        </ul>

        {typeof manifest.model === "string" ? (
          <>
            <p className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-wide text-brand-muted">
              Model
            </p>
            <p className="truncate font-mono text-[11px]">{manifest.model}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function DeployWorkflowModal({
  exec,
  onClose,
}: {
  exec: WorkflowExecution | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!exec}
      onClose={onClose}
      align="sheet"
      size="lg"
      labelledBy="workflow-modal-title"
    >
      {exec ? (
        <>
          <ModalHeader
            titleId="workflow-modal-title"
            title={exec.title}
            description={`${exec.deploymentId} · ${exec.classification} · depth ${exec.recursiveDepth}`}
            onClose={onClose}
          />
          <ModalBody className="min-w-0 p-0">
            <WorkflowCanvas exec={exec} />
          </ModalBody>
        </>
      ) : null}
    </Modal>
  );
}
