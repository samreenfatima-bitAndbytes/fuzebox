"use client";

import { useEffect, useRef } from "react";
import { useShell } from "@/components/ShellProvider";

/** Re-run `load` on mount, when `load` deps change, and on shell Refresh / auto-refresh. */
export function useAppRefresh(load: () => void | Promise<void>) {
  const { refreshTick } = useShell();
  const loadRef = useRef(load);
  loadRef.current = load;

  // `load` must be a stable useCallback (e.g. useAppRefresh(load)), not an inline arrow.
  useEffect(() => {
    void loadRef.current();
  }, [load, refreshTick]);
}
