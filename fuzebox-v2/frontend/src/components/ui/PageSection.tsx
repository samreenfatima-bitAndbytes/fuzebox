import type { ReactNode } from "react";

export function PageSection({
  title,
  subtitle,
  action,
  children,
  className = "",
  unstyled = false,
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Skip outer fb-section card — use inside another card */
  unstyled?: boolean;
}) {
  const wrap = unstyled ? "" : "fb-section";

  return (
    <section className={[wrap, className].filter(Boolean).join(" ")}>
      {(title || subtitle || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="fb-section-title">{title}</h2> : null}
            {subtitle ? (
              <p className="mt-1 text-sm text-brand-muted">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
