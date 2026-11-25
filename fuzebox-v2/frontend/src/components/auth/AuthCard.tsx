"use client";

import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="fb-card-accent-top shadow-lg">
      <div
        className="border-b border-brand-border px-6 py-6 sm:px-8"
        style={{ background: "var(--accent-gradient-soft)" }}
      >
        <p className="text-xs font-bold uppercase tracking-widest text-brand-primary lg:hidden">
          Fuzebox
        </p>
        <h1 className="fb-text-display mt-2 lg:mt-0">{title}</h1>
        <p className="fb-text-subtitle mt-2">{subtitle}</p>
      </div>
      <div className="px-6 py-6 sm:px-8 sm:py-7">{children}</div>
      {footer ? (
        <div className="border-t border-brand-border bg-[var(--surface-muted)]/80 px-6 py-4 sm:px-8">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
