"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AppShellToolbar } from "./AppShellToolbar";
import { AuthGuard } from "./AuthGuard";
import { GenerateRequestModal } from "./GenerateRequestModal";
import { LiveDataBadge, type DataMode } from "./LiveDataBadge";
import { PendingWorkflowBanner } from "./PendingWorkflowBanner";
import { ShellOperatorActions } from "./shell/ShellOperatorActions";
import { IconMenu } from "./shell/icons";
import { useShell } from "./ShellProvider";
import { readDataMode } from "@/lib/data-mode";
import { getSession } from "@/lib/auth";
import {
  OPEN_GENERATE_REQUEST_EVENT,
  pathShowsGenerateRequest,
} from "@/lib/generate-request";
import {
  clearPendingWorkflow,
  PENDING_WORKFLOW_EVENT,
  readPendingWorkflow,
  setPendingWorkflow,
} from "@/lib/pending-workflow";

export function AppShell({
  title,
  subtitle,
  titleAdornment,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Renders inline after the page title (e.g. info tooltip). */
  titleAdornment?: ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const session = getSession();
  const canWrite = session?.role !== "readonly";
  const showGenerateRequest = pathShowsGenerateRequest(pathname);
  const { mobileNavOpen, setMobileNavOpen, triggerRefresh } = useShell();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [dataMode, setDataMode] = useState<DataMode>("live");

  useEffect(() => {
    const stored = readPendingWorkflow();
    if (stored) setPendingRequestId(stored);
    setDataMode(readDataMode());

    const onPendingWorkflow = (event: Event) => {
      const id = (event as CustomEvent<string | null>).detail;
      setPendingRequestId(id ?? readPendingWorkflow());
    };
    window.addEventListener(PENDING_WORKFLOW_EVENT, onPendingWorkflow);
    return () =>
      window.removeEventListener(PENDING_WORKFLOW_EVENT, onPendingWorkflow);
  }, []);

  useEffect(() => {
    const onOpenGenerate = () => setGenerateOpen(true);
    window.addEventListener(OPEN_GENERATE_REQUEST_EVENT, onOpenGenerate);
    return () =>
      window.removeEventListener(OPEN_GENERATE_REQUEST_EVENT, onOpenGenerate);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const handleWorkflowSubmitted = useCallback((requestId: string) => {
    setPendingWorkflow(requestId);
    setPendingRequestId(requestId);
  }, []);

  return (
    <AuthGuard>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0">
            <div className="fb-shell-topbar">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  className="fb-topbar-menu-btn lg:hidden"
                  aria-label="Open navigation menu"
                  aria-expanded={mobileNavOpen}
                  aria-controls="app-sidebar"
                  onClick={() => setMobileNavOpen(true)}
                >
                  <IconMenu />
                </button>
                <div className="fb-topbar-brand">
                  <span className="fb-topbar-brand-mark" aria-hidden>
                    F
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-[var(--page-title-color)]">
                      Fuzebox
                    </span>
                    <span className="block text-xs text-brand-muted">
                      Agent Performance
                    </span>
                  </span>
                </div>
                <LiveDataBadge mode={dataMode} />
              </div>
              <AppShellToolbar />
            </div>

            <div className="fb-shell-pagehead">
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="fb-text-display text-xl sm:text-2xl">{title}</h1>
                  {titleAdornment}
                </div>
                {subtitle ? (
                  <p className="fb-text-subtitle mt-1.5 max-w-3xl">{subtitle}</p>
                ) : null}
              </div>
              <ShellOperatorActions
                canWrite={canWrite}
                showGenerateRequest={showGenerateRequest}
                onGenerateRequest={() => setGenerateOpen(true)}
              />
            </div>
          </header>

          <div className="fb-shell-content min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
            {pendingRequestId && (
              <PendingWorkflowBanner
                requestId={pendingRequestId}
                onPipelineComplete={triggerRefresh}
                onDismiss={() => {
                  clearPendingWorkflow();
                  setPendingRequestId(null);
                }}
              />
            )}
            <div className="fb-shell-x fb-shell-y">{children}</div>
          </div>
      </main>
      <GenerateRequestModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        canWrite={canWrite}
        onSubmitted={handleWorkflowSubmitted}
      />
    </AuthGuard>
  );
}
