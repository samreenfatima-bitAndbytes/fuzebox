"use client";

import { useEffect, useId, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { useShell } from "@/components/ShellProvider";
import { FormField, FormTextarea } from "@/components/ui/FormField";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ApiError, createQualityTask, submitWebhookRequest } from "@/lib/api";

const AGENT_NAMES = [
  "ATS & Candidate Data Quality Agent",
  "Interview Assessment & Rubric Agent",
  "Talent Acquisition Orchestrator",
  "Careers Site & Integrations Agent",
  "Hiring Compliance & Privacy Agent",
  "Recruiting Slack Agent",
  "Job Description & Offer Letter Agent",
  "Hiring Process Improvement Agent",
  "Resume & Application Review Agent",
  "Salesforce Recruiting (Agentforce) Agent",
  "Time-to-Hire & Pipeline Analytics Agent",
] as const;

const TEMPLATES = [
  {
    id: "slack-reminder",
    name: "Interview reminder",
    platform: "SLACK" as const,
    desc: "Post same-day interview reminder to hiring channel",
    channel: "#hiring",
    message:
      "Reminder: interview today at {{time}} for {{candidate}} — {{role}}. Loop links in thread.",
  },
  {
    id: "slack-status",
    name: "Candidate status update",
    platform: "SLACK" as const,
    desc: "Short pipeline update for recruiters + hiring managers",
    channel: "#hiring",
    message:
      "Pipeline update — {{role}}: {{advanced}} advanced, {{declined}} declined, {{pending}} pending review.",
  },
  {
    id: "slack-ops",
    name: "TA ops note",
    platform: "SLACK" as const,
    desc: "Lightweight note to talent team (intake/scheduling)",
    channel: "#ta-ops",
    message:
      "Heads up: scheduling capacity tight Thursday — please pre-book with HMs by EOD Tuesday.",
  },
  {
    id: "af-screen",
    name: "Screen applicants",
    platform: "AGENTFORCE" as const,
    desc: "Compare applicants against must-haves",
  },
  {
    id: "af-schedule",
    name: "Interview brief",
    platform: "AGENTFORCE" as const,
    desc: "Draft schedule constraints/outline",
  },
  {
    id: "af-outreach",
    name: "Candidate outreach draft",
    platform: "AGENTFORCE" as const,
    desc: "Polite first outreach for passive candidate",
  },
] as const;

type Template = (typeof TEMPLATES)[number];

function buildWebhookText(params: {
  agent: string;
  capability: string;
  channel: string;
  message: string;
  userId: string;
  teamId: string;
}): string {
  const lines = [
    `Operator task for ${params.agent}`,
    `Capability: ${params.capability}`,
    `User: ${params.userId} · Team: ${params.teamId}`,
  ];
  if (params.channel.trim()) lines.push(`Channel: ${params.channel.trim()}`);
  if (params.message.trim()) {
    lines.push("", params.message.trim());
  }
  return lines.join("\n");
}

function PlatformPill({ platform }: { platform: Template["platform"] }) {
  const className =
    platform === "SLACK" ? "fb-badge-warn" : "fb-badge-muted text-brand-primary";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${className}`}>
      {platform}
    </span>
  );
}

export function CreateTaskModal({
  open,
  onClose,
  canWrite = true,
  onPipelineStarted,
  onTaskQueued,
}: {
  open: boolean;
  onClose: () => void;
  canWrite?: boolean;
  onPipelineStarted?: (requestId: string) => void;
  onTaskQueued?: () => void;
}) {
  const titleId = useId();
  const { showToast } = useShell();
  const [showTemplates, setShowTemplates] = useState(true);
  const [selected, setSelected] = useState<Template | null>(null);
  const [agent, setAgent] = useState("");
  const [capability, setCapability] = useState("");
  const [channel, setChannel] = useState("#hiring");
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("user-001");
  const [teamId, setTeamId] = useState("team-001");
  const [autoExecute, setAutoExecute] = useState(true);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);

  const isSlack = selected?.platform === "SLACK";
  const isAF = selected?.platform === "AGENTFORCE";
  const required =
    !!agent && !!capability && (!isSlack || (!!channel.trim() && !!message.trim()));

  useEffect(() => {
    if (open) return;
    setShowTemplates(true);
    setSelected(null);
    setAgent("");
    setCapability("");
    setChannel("#hiring");
    setMessage("");
    setUserId("user-001");
    setTeamId("team-001");
    setAutoExecute(true);
    setLoading(false);
    setFeedback(null);
  }, [open]);

  function pickTemplate(t: Template) {
    setSelected(t);
    if (t.platform === "SLACK") {
      setAgent("Recruiting Slack Agent");
      setCapability("send_slack_message");
      setChannel(t.channel ?? "#hiring");
      setMessage(t.message ?? "");
    } else {
      setAgent("Salesforce Recruiting (Agentforce) Agent");
      setCapability("agentforce_invoke");
      setMessage("");
    }
  }

  async function handleCreate() {
    if (!required || !canWrite || loading) return;
    setLoading(true);
    setFeedback(null);
    const platform = selected?.platform ?? "";
    const payload = {
      agent_name: agent,
      capability,
      message,
      channel: isSlack ? channel : "",
      user_id: userId,
      team_id: teamId,
      platform,
    };
    try {
      if (autoExecute) {
        const res = await submitWebhookRequest(
          buildWebhookText({ agent, capability, channel, message, userId, teamId }),
          "quality-create-task",
          {
            ...payload,
            operator_task: true,
            auto_execute: true,
          },
          userId,
        );
        if (res.request_id) onPipelineStarted?.(res.request_id);
        showToast("Task dispatched.");
        onClose();
        return;
      }
      const res = await createQualityTask(payload);
      showToast(res.message || "Task queued.");
      onTaskQueued?.();
      onClose();
    } catch (err) {
      setFeedback({
        variant: "error",
        message:
          err instanceof ApiError ? err.message : "Failed to create task",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" labelledBy={titleId}>
      <ModalHeader
        titleId={titleId}
        title="Create task"
        description={
          autoExecute
            ? "Dispatches to the selected agent and capability when possible, otherwise the best skill match in the fleet."
            : "Queues a Running row in the task log — use Run on that row to dispatch later."
        }
        onClose={onClose}
      />
      <ModalBody className="space-y-4">
        {!canWrite ? (
          <Alert variant="warn">
            Read-only session — task creation requires operator access.
          </Alert>
        ) : null}
        {feedback ? <Alert variant={feedback.variant}>{feedback.message}</Alert> : null}
        <div className="overflow-hidden rounded-lg border border-brand-border">
          <button
            type="button"
            onClick={() => setShowTemplates((s) => !s)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-brand-ink fb-hover"
            data-testid="toggle-templates"
          >
            <span>Recruiting templates</span>
            <svg
              className={[
                "h-4 w-4 shrink-0 text-brand-muted transition-transform",
                showTemplates ? "rotate-180" : "",
              ].join(" ")}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          {showTemplates ? (
            <div className="grid grid-cols-1 gap-2 border-t border-brand-border p-3 md:grid-cols-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className={[
                    "rounded-md border border-brand-border p-2.5 text-left transition-colors fb-hover",
                    selected?.id === t.id ? "ring-2 ring-brand-primary border-brand-primary" : "",
                  ].join(" ")}
                  data-testid={`template-${t.id}`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-brand-ink">{t.name}</div>
                    <PlatformPill platform={t.platform} />
                  </div>
                  <div className="line-clamp-2 text-xs text-brand-muted">{t.desc}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="create-task-agent" className="fb-field-label">
              Agent <span className="text-[var(--alert-error-text)]">*</span>
            </label>
            <Select
              id="create-task-agent"
              value={agent}
              onChange={setAgent}
              placeholder="Choose agent"
              options={AGENT_NAMES.map((a) => ({ value: a, label: a }))}
              aria-label="Agent"
            />
          </div>

          <FormField
            id="create-task-capability"
            label="Capability *"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
            placeholder="e.g., send_slack_message"
          />

          {isSlack ? (
            <>
              <FormField
                id="create-task-channel"
                label="Channel *"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                placeholder="#hiring"
              />
              <FormTextarea
                id="create-task-message"
                label="Message *"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type the Slack message…"
                rows={4}
              />
            </>
          ) : null}

          {isAF ? (
            <FormTextarea
              id="create-task-brief"
              label="Brief / instruction"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe the goal — e.g., compare 12 applicants against must-have skills for Senior PM"
              rows={4}
            />
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="create-task-user" className="fb-field-label">
                User ID
              </label>
              <Select
                id="create-task-user"
                value={userId}
                onChange={setUserId}
                options={[
                  { value: "user-001", label: "user-001" },
                  { value: "user-002", label: "user-002" },
                  { value: "user-003", label: "user-003" },
                ]}
                aria-label="User ID"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="create-task-team" className="fb-field-label">
                Team ID
              </label>
              <Select
                id="create-task-team"
                value={teamId}
                onChange={setTeamId}
                options={[
                  { value: "team-001", label: "team-001" },
                  { value: "team-002", label: "team-002" },
                ]}
                aria-label="Team ID"
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm text-brand-ink">
            <input
              type="checkbox"
              checked={autoExecute}
              onChange={(e) => setAutoExecute(e.target.checked)}
              className="h-4 w-4 rounded border-brand-border"
            />
            <span>Auto-execute after create</span>
          </label>
        </div>
      </ModalBody>
      <ModalFooter className="justify-end">
        <button type="button" onClick={onClose} className="fb-btn" data-testid="button-task-cancel">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!required || !canWrite || loading}
          className="fb-btn-primary disabled:opacity-50"
          data-testid="button-task-create"
        >
          {loading
            ? "Submitting…"
            : autoExecute
              ? "Create & run"
              : "Queue task"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
