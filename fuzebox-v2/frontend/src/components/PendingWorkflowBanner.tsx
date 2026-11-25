"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchPipelineStatus } from "@/lib/api";
import {
  clearPendingWorkflow,
  PENDING_WORKFLOW_POLL_MS,
  PENDING_WORKFLOW_TIMEOUT_MS,
} from "@/lib/pending-workflow";

function BannerShell({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "pending" | "success" | "warn";
}) {
  const className =
    variant === "pending"
      ? "fb-pending-banner"
      : variant === "success"
        ? "fb-alert-success flex flex-wrap items-center justify-between gap-3"
        : "fb-alert-warn flex flex-wrap items-center justify-between gap-3";

  return (
    <div className="fb-shell-x mt-4">
      <div className={className} role="status">
        {children}
      </div>
    </div>
  );
}

export function PendingWorkflowBanner({
  requestId,
  onDismiss,
  onPipelineComplete,
}: {
  requestId: string;
  onDismiss: () => void;
  onPipelineComplete?: () => void;
}) {
  const [timedOut, setTimedOut] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const startedAt = Date.now();
    let cancelled = false;

    const tick = async () => {
      if (cancelled || done) return;
      if (Date.now() - startedAt > PENDING_WORKFLOW_TIMEOUT_MS) {
        setTimedOut(true);
        clearPendingWorkflow();
        return;
      }
      try {
        const data = await fetchPipelineStatus(requestId);
        if (cancelled) return;
        if (data.status !== "pending") {
          setDone(true);
          clearPendingWorkflow();
          onPipelineComplete?.();
        }
      } catch {
        /* keep polling */
      }
    };

    tick();
    const id = window.setInterval(tick, PENDING_WORKFLOW_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [requestId, done]);

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(onDismiss, 25000);
    return () => window.clearTimeout(t);
  }, [done, onDismiss]);

  if (done) {
    return (
      <BannerShell variant="success">
        <span className="min-w-0 flex-1 text-sm">
          Pipeline finished (
          <code className="font-mono text-xs">{requestId}</code>). New tasks are
          in the Task Log, Run Review, and Traces.
        </span>
        <div className="flex flex-wrap gap-2">
          <Link href="/quality?tab=task" className="fb-btn-sm">
            Task Log
          </Link>
          <Link href="/run-review" className="fb-btn-sm">
            Run Review
          </Link>
          <Link href="/traces" className="fb-btn-sm">
            Traces
          </Link>
          <button
            type="button"
            onClick={onDismiss}
            className="fb-btn-sm"
          >
            Dismiss
          </button>
        </div>
      </BannerShell>
    );
  }

  if (timedOut) {
    return (
      <BannerShell variant="warn">
        <span className="text-sm">
          Pipeline is taking longer than expected. Check Run Review in a moment.
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="fb-btn-sm"
        >
          Dismiss
        </button>
      </BannerShell>
    );
  }

  return (
    <BannerShell variant="pending">
      <span
        className="mt-1.5 h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-brand-primary"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-brand-ink">Recording run…</p>
        <p className="mt-0.5 text-brand-muted">
          Waiting for the pipeline to finish (
          <code className="font-mono text-xs">{requestId}</code>). The Task Log
          refreshes automatically when the run completes.
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="fb-btn-sm shrink-0"
      >
        Dismiss
      </button>
    </BannerShell>
  );
}
