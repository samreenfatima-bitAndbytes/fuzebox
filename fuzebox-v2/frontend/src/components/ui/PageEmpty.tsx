"use client";

import Link from "next/link";

export function PageEmpty({
  title = "No data yet",
  message,
  hint,
  action,
}: {
  title?: string;
  message: string;
  hint?: { label: string; href: string };
  action?: { label: string; onClick: () => void; loading?: boolean };
}) {
  return (
    <div className="fb-empty-state-wrap">
      <div className="fb-empty-state px-6 py-12" role="status">
        <p className="text-sm font-semibold text-brand-ink">{title}</p>
        <p className="mt-2 max-w-md text-sm text-brand-muted">{message}</p>
        {action ? (
          <button
            type="button"
            onClick={action.onClick}
            disabled={action.loading}
            className="fb-btn-primary mt-4 disabled:opacity-50"
          >
            {action.loading ? "Loading…" : action.label}
          </button>
        ) : null}
        {hint ? (
          <Link
            href={hint.href}
            className={[
              "inline-flex text-sm font-medium text-brand-primary hover:underline",
              action ? "mt-3" : "mt-4",
            ].join(" ")}
          >
            {hint.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
