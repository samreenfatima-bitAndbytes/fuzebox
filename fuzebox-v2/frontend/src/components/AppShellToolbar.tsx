"use client";

import { useShell } from "@/components/ShellProvider";
import { IconRefresh } from "@/components/shell/icons";
import { ShellOptionsMenu } from "@/components/ShellOptionsMenu";

/** Top navbar: Refresh + View (theme, presentation, auto-refresh). */
export function AppShellToolbar() {
  const { triggerRefresh } = useShell();

  return (
    <div className="fb-toolbar-cluster" role="toolbar" aria-label="Page controls">
      <button
        type="button"
        onClick={triggerRefresh}
        className="fb-btn-toolbar"
        title="Reload data on this page"
      >
        <IconRefresh />
        <span className="hidden sm:inline">Refresh</span>
      </button>
      <ShellOptionsMenu />
    </div>
  );
}
