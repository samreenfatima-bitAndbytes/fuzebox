"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/Modal";
import { defaultDeploymentHealthUrl, normalizeHealthUrl } from "@/lib/deployment-health";
import type { useDeploymentHealth } from "@/hooks/useDeploymentHealth";

type Health = ReturnType<typeof useDeploymentHealth>;

export function DeploymentHealthSheet({
  open,
  onClose,
  health,
}: {
  open: boolean;
  onClose: () => void;
  health: Health;
}) {
  const [draftUrl, setDraftUrl] = useState(defaultDeploymentHealthUrl());

  useEffect(() => {
    if (!open) return;
    setDraftUrl(health.endpointUrl ?? defaultDeploymentHealthUrl());
  }, [open, health.endpointUrl]);

  const displayCurrent =
    health.endpointUrl ??
    (normalizeHealthUrl(draftUrl) || defaultDeploymentHealthUrl());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const url = normalizeHealthUrl(draftUrl);
    if (!url) return;
    try {
      await health.startPolling(url);
    } catch {
      /* error shown on sheet */
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="drawer-right"
      labelledBy="deployment-health-title"
      describedBy="deployment-health-desc"
    >
      <ModalHeader
        titleId="deployment-health-title"
        title="Deployment Health Endpoint"
        description="Fuzebox will poll this URL every 30 seconds to check how many agents are live on your deployment server. It should be the /health endpoint of your webhook server."
        onClose={onClose}
      />
      <form onSubmit={onSubmit}>
        <ModalBody className="fb-modal-drawer-body space-y-5">
          <label className="block">
            <span className="fb-field-label">Health endpoint URL</span>
            <input
              type="url"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              placeholder={defaultDeploymentHealthUrl()}
              className="fb-input mt-1.5 w-full font-mono text-sm"
              required
            />
          </label>

          <p id="deployment-health-desc" className="text-sm text-brand-muted">
            Expected response:{" "}
            <code className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-xs">
              {"{ \"status\": \"ok\", \"active_agents\": 3 }"}
            </code>
          </p>

          <p className="text-sm text-brand-muted">
            <span className="font-medium text-brand-ink">Current:</span>{" "}
            <span className="break-all font-mono text-xs">{displayCurrent}</span>
          </p>

          {health.polling ? (
            <div className="rounded-[var(--radius-lg)] border border-brand-border bg-[var(--surface-muted)] px-3 py-2.5 text-sm">
              {health.result ? (
                <>
                  <p>
                    Status:{" "}
                    <span className="font-semibold text-[var(--alert-success-text)]">
                      {health.result.status}
                    </span>
                    {" · "}
                    <span className="font-semibold tabular-nums">
                      {health.result.active_agents}
                    </span>{" "}
                    active agents
                  </p>
                  {health.lastPolledAt ? (
                    <p className="mt-1 text-xs text-brand-muted">
                      Last poll · {health.lastPolledAt.toLocaleTimeString()}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-brand-muted">Polling… waiting for first response.</p>
              )}
              <p className="mt-2 text-xs text-brand-muted">
                Auto-refresh every 30 seconds while this panel is open.
              </p>
            </div>
          ) : null}

          {health.error ? (
            <p className="text-sm text-[var(--alert-error-text)]" role="alert">
              {health.error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="submit"
              className="fb-btn-primary w-full"
              disabled={health.saving}
              aria-busy={health.saving}
            >
              {health.saving ? "Saving…" : "Save & Start Polling"}
            </button>
            <button
              type="button"
              className="fb-btn w-full shadow-sm"
              onClick={async () => {
                try {
                  await health.clearEndpoint();
                  setDraftUrl(defaultDeploymentHealthUrl());
                } catch {
                  /* error shown on sheet */
                }
              }}
              disabled={(!health.endpointUrl && !health.polling) || health.saving}
            >
              Clear endpoint
            </button>
          </div>
        </ModalBody>
      </form>
    </Modal>
  );
}
