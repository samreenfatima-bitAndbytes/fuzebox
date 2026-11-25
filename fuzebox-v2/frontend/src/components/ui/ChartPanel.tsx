import type { ReactNode } from "react";
import { RunReviewInfoTip } from "@/components/RunReviewChrome";

export function ChartPanel({
  kicker,
  title,
  subtitle,
  tip,
  action,
  children,
  className = "",
}: {
  kicker?: string;
  title: string;
  subtitle?: string;
  tip?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["min-w-0", className].join(" ")}>
      <div
        className={[
          "flex flex-wrap items-start justify-between gap-3",
          subtitle ? "mb-4" : "mb-2",
        ].join(" ")}
      >
        <div className="min-w-0">
          {kicker ? (
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
              {kicker}
            </p>
          ) : null}
          <h3 className="fb-section-title inline-flex items-center gap-1.5">
            {title}
            {tip ? <RunReviewInfoTip text={tip} label={title} /> : null}
          </h3>
          {subtitle ? (
            <p className="mt-1 max-w-prose text-sm leading-relaxed text-brand-ink/80 sm:text-base">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}
