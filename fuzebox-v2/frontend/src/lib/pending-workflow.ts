const KEY_ID = "fb_pending_workflow_request_id";
const KEY_T0 = "fb_pending_workflow_t0";

export const PENDING_WORKFLOW_EVENT = "fuzebox:pending-workflow";
export const PENDING_WORKFLOW_TIMEOUT_MS = 180_000;
export const PENDING_WORKFLOW_POLL_MS = 5000;

function notifyPendingWorkflow(requestId: string | null): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PENDING_WORKFLOW_EVENT, { detail: requestId }),
  );
}

export function setPendingWorkflow(requestId: string): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(KEY_ID, requestId);
  sessionStorage.setItem(KEY_T0, String(Date.now()));
  notifyPendingWorkflow(requestId);
}

export function clearPendingWorkflow(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(KEY_ID);
  sessionStorage.removeItem(KEY_T0);
  notifyPendingWorkflow(null);
}

export function readPendingWorkflow(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  const requestId = sessionStorage.getItem(KEY_ID);
  if (!requestId) return null;
  const t0 = Number(sessionStorage.getItem(KEY_T0) || Date.now());
  if (Date.now() - t0 > PENDING_WORKFLOW_TIMEOUT_MS) {
    clearPendingWorkflow();
    return null;
  }
  return requestId;
}
