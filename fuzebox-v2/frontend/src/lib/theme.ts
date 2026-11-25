import type { ThemeMode } from "@/lib/shell-preferences";

/**
 * Theme resolution for light / dark / system.
 * Visual tokens live in `globals.css`; see `design-tokens.ts` for the full catalog.
 */

export type ResolvedTheme = "light" | "dark";

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyThemeToDocument(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  root.dataset.theme = resolved;
}
