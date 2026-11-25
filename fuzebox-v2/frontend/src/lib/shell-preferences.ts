const KEY = "fuzebox_shell_prefs";

export type ThemeMode = "light" | "dark" | "system";

export type ShellPreferences = {
  presentationMode: boolean;
  autoRefresh: boolean;
  autoRefreshSeconds: number;
  themeMode: ThemeMode;
};

const DEFAULTS: ShellPreferences = {
  presentationMode: false,
  autoRefresh: false,
  autoRefreshSeconds: 30,
  themeMode: "light",
};

export function readShellPreferences(): ShellPreferences {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ShellPreferences>;
    const theme = parsed.themeMode;
    const themeMode: ThemeMode =
      theme === "light" || theme === "dark" || theme === "system"
        ? theme
        : DEFAULTS.themeMode;
    return {
      presentationMode: Boolean(parsed.presentationMode),
      autoRefresh: Boolean(parsed.autoRefresh),
      autoRefreshSeconds: clampInterval(parsed.autoRefreshSeconds ?? 30),
      themeMode,
    };
  } catch {
    return DEFAULTS;
  }
}

export function writeShellPreferences(prefs: ShellPreferences): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function clampInterval(seconds: number): number {
  return Math.min(120, Math.max(10, Math.round(seconds)));
}

export const THEME_MODE_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

export const AUTO_REFRESH_INTERVAL_OPTIONS = [
  { value: "10", label: "10s" },
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
  { value: "60", label: "60s" },
  { value: "120", label: "120s" },
] as const;
