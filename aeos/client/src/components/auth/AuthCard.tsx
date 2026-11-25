import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

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
    <div className="aeos-auth-card overflow-hidden border border-[hsl(var(--card-border))] bg-card shadow-lg">
      <div className="aeos-auth-card-header border-b border-[hsl(var(--card-border))] px-6 py-6 sm:px-8">
        <div className="flex items-center gap-3 lg:hidden mb-4">
          <Logo size={40} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">r-Potential</p>
            <p className="text-xs text-muted-foreground truncate">FuzeBox AEOS</p>
          </div>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[hsl(var(--primary))]">
          Workspace access
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>

      <div className="px-6 py-6 sm:px-8 sm:py-7">{children}</div>

      {footer ? (
        <div className="border-t border-[hsl(var(--card-border))] bg-muted/40 px-6 py-4 sm:px-8">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
