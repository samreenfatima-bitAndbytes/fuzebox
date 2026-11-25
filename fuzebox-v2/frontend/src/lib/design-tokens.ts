/**
 * Phase 0 design system — token names and documentation.
 *
 * Values are defined in `src/app/globals.css` (`:root` and `.dark`).
 * Use Tailwind utilities where mapped in `tailwind.config.ts`, or
 * `var(--token-name)` in CSS / inline styles.
 *
 * Do not remove legacy `--brand-*` names; new tokens extend the system.
 */

export const DESIGN_TOKEN_GROUPS = {
  brand: [
    "brand-primary",
    "brand-primary-hover",
    "brand-ink",
    "brand-muted",
    "brand-bg",
    "brand-border",
  ],
  surface: ["surface", "surface-muted", "surface-hover", "surface-elevated", "track"],
  navigation: ["nav-active-bg", "nav-active-text", "nav-hover-bg"],
  typography: [
    "font-sans",
    "font-mono",
    "text-xs",
    "text-sm",
    "text-base",
    "text-lg",
    "text-xl",
    "text-2xl",
    "leading-tight",
    "leading-normal",
    "leading-relaxed",
    "font-medium",
    "font-semibold",
    "font-bold",
  ],
  space: [
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "space-6",
    "space-8",
    "space-10",
    "space-12",
    "space-16",
  ],
  radius: ["radius-sm", "radius-md", "radius-lg", "radius-xl", "radius-full"],
  shadow: ["shadow-xs", "shadow-sm", "shadow-md", "shadow-lg", "shadow-focus"],
  focus: ["focus-ring-color", "focus-ring-width", "focus-ring-offset"],
  motion: ["duration-fast", "duration-normal", "duration-slow", "ease-default"],
  zIndex: ["z-base", "z-dropdown", "z-sticky", "z-modal", "z-toast"],
  shell: ["shell-header-min-height", "shell-sidebar-width", "shell-sidebar-rail-width"],
} as const;

/** CSS variable reference, e.g. `var(--brand-primary)` */
export function cssVar(token: string): string {
  return `var(--${token})`;
}

/** Spacing scale (px) — mirrors `--space-*` in globals.css */
export const SPACE_PX = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;
