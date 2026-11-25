"use client";

export function TracesTipCard() {
  return (
    <aside className="fb-card-accent-top p-4 sm:p-5">
      <p className="text-sm font-semibold text-brand-ink">Tip</p>
      <p className="mt-1.5 text-sm text-brand-muted">
        Pick a trace, then use tabs below.
      </p>
      <ul className="mt-2.5 space-y-1 text-sm text-brand-muted">
        <li>
          <strong className="font-medium text-brand-ink">Timeline</strong> shows
          span ordering and overlap.
        </li>
        <li>
          <strong className="font-medium text-brand-ink">Spans</strong> is the
          searchable details table.
        </li>
        <li>Export CSV for sharing evidence.</li>
      </ul>
    </aside>
  );
}
