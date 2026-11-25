"use client";

export function ShellOperatorActions({
  canWrite,
  showGenerateRequest = true,
  onGenerateRequest,
}: {
  canWrite: boolean;
  showGenerateRequest?: boolean;
  onGenerateRequest: () => void;
}) {
  if (!canWrite || !showGenerateRequest) return null;

  return (
    <div
      className="fb-shell-operator-group fb-shell-operator-group--solo"
      role="group"
      aria-label="Pipeline actions"
    >
      <button
        type="button"
        onClick={onGenerateRequest}
        className="fb-btn-toolbar-primary"
      >
        Generate request
      </button>
    </div>
  );
}
