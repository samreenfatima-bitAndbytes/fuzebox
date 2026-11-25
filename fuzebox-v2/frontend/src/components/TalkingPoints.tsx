"use client";

import { useShell } from "@/components/ShellProvider";

export function TalkingPoints({
  title,
  bullets,
}: {
  title: string;
  bullets: string[];
}) {
  const { presentationMode } = useShell();
  if (!presentationMode) return null;

  return (
    <div className="fb-talking-points mb-6 rounded-xl border border-brand-border bg-gradient-to-r from-[#eff6ff] to-[#ecfdf5] px-4 py-3 dark:from-[rgba(30,58,95,0.4)] dark:to-[rgba(15,118,110,0.15)]">
      <p className="text-sm font-semibold text-[var(--page-title-color)]">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-muted">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
    </div>
  );
}
