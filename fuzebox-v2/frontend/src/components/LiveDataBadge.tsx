"use client";

export type DataMode = "live" | "demo";

/** Hidden from UI — data-mode state in AppShell is unchanged for seed flow. */
export function LiveDataBadge({ mode: _mode }: { mode: DataMode }) {
  return null;
}
