import type { ReactNode } from "react";

export function ChartGuideAside({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <aside className="fb-card-accent-top flex h-full flex-col p-4 sm:p-5">
      <h4 className="text-sm font-semibold text-brand-ink">{title}</h4>
      <p className="mt-1.5 text-sm leading-relaxed text-brand-ink/75 sm:text-[0.9375rem]">
        {lead}
      </p>
      <ul className="mt-3 space-y-2 text-sm text-brand-muted">{children}</ul>
    </aside>
  );
}
