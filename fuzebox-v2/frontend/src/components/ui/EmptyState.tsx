"use client";

import type { ReactNode } from "react";

export function EmptyState({
  title,
  message,
  action,
  size = "md",
  className = "",
}: {
  title?: string;
  message: string;
  action?: ReactNode;
  size?: "sm" | "md" | "chart";
  className?: string;
}) {
  const height =
    size === "chart" ? "min-h-[14rem]" : size === "sm" ? "min-h-[8rem]" : "min-h-[10rem]";

  return (
    <div
      className={[
        "fb-empty-state flex flex-col items-center justify-center text-center",
        height,
        className,
      ].join(" ")}
      role="status"
    >
      <div className="fb-empty-state-icon mb-3" aria-hidden>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 7h16M4 12h10M4 17h6" strokeLinecap="round" />
        </svg>
      </div>
      {title ? (
        <p className="text-sm font-semibold text-brand-ink">{title}</p>
      ) : null}
      <p className={["text-sm text-brand-muted", title ? "mt-1" : ""].join(" ")}>
        {message}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
