import { formatAgentStatusLabel } from "@/lib/agent-labels";

function PassFailIcon({ kind }: { kind: "pass" | "fail" }) {
  if (kind === "pass") {
    return (
      <svg
        className="h-3.5 w-3.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <span
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[11px] font-bold leading-none"
      aria-hidden
    >
      X
    </span>
  );
}

export function PassFailBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const pass = s === "PASS";
  const fail = s === "FAIL";
  const label = pass ? "PASS" : fail ? "FAIL" : "N/A";
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium",
        pass
          ? "bg-emerald-600 text-white"
          : fail
            ? "bg-red-600 text-white"
            : "fb-badge-muted",
      ].join(" ")}
    >
      {pass ? <PassFailIcon kind="pass" /> : null}
      {fail ? <PassFailIcon kind="fail" /> : null}
      <span>{label}</span>
    </span>
  );
}

export function AgentStatusBadge({ status }: { status: string }) {
  const active = status === "active";
  return (
    <span
      className={[
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
        active ? "fb-badge-success" : "fb-badge-muted",
      ].join(" ")}
    >
      {formatAgentStatusLabel(status)}
    </span>
  );
}
