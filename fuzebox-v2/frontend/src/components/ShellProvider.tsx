"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clampInterval,
  readShellPreferences,
  writeShellPreferences,
  type ShellPreferences,
  type ThemeMode,
} from "@/lib/shell-preferences";
import { readSidebarCollapsed, writeSidebarCollapsed } from "@/lib/sidebar-layout";
import { applyThemeToDocument, resolveTheme } from "@/lib/theme";
import { ToastHost, type ToastMessage, type ToastVariant } from "@/components/ui/Toast";

const DEFAULT_PREFS: ShellPreferences = {
  presentationMode: false,
  autoRefresh: false,
  autoRefreshSeconds: 30,
  themeMode: "light",
};

type ShellContextValue = {
  refreshTick: number;
  triggerRefresh: () => void;
  presentationMode: boolean;
  setPresentationMode: (on: boolean) => void;
  autoRefresh: boolean;
  setAutoRefresh: (on: boolean) => void;
  autoRefreshSeconds: number;
  setAutoRefreshSeconds: (seconds: number) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  resolvedTheme: "light" | "dark";
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  showToast: (message: string, variant?: ToastVariant) => void;
};

const ShellContext = createContext<ShellContextValue | null>(null);

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [prefs, setPrefs] = useState<ShellPreferences>(DEFAULT_PREFS);
  const [refreshTick, setRefreshTick] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastSeq = useRef(0);

  useEffect(() => {
    setPrefs(readShellPreferences());
    setSidebarCollapsedState(readSidebarCollapsed());
    setHydrated(true);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    writeSidebarCollapsed(collapsed);
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsedState((prev) => {
      const next = !prev;
      writeSidebarCollapsed(next);
      return next;
    });
  }, []);

  const persist = useCallback((next: ShellPreferences) => {
    setPrefs(next);
    writeShellPreferences(next);
  }, []);

  const triggerRefresh = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      dismissToast(id);
    }, 4500);
  }, [dismissToast]);

  const resolvedTheme = resolveTheme(prefs.themeMode);

  useEffect(() => {
    if (!hydrated) return;
    applyThemeToDocument(resolvedTheme);
  }, [hydrated, resolvedTheme]);

  useEffect(() => {
    if (!hydrated || prefs.themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeToDocument(resolveTheme("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [hydrated, prefs.themeMode]);

  useEffect(() => {
    if (!hydrated || !prefs.autoRefresh) return;
    const id = window.setInterval(
      triggerRefresh,
      prefs.autoRefreshSeconds * 1000,
    );
    return () => window.clearInterval(id);
  }, [
    hydrated,
    prefs.autoRefresh,
    prefs.autoRefreshSeconds,
    triggerRefresh,
  ]);

  const value = useMemo<ShellContextValue>(
    () => ({
      refreshTick,
      triggerRefresh,
      presentationMode: prefs.presentationMode,
      setPresentationMode: (on) =>
        persist({ ...prefs, presentationMode: on }),
      autoRefresh: prefs.autoRefresh,
      setAutoRefresh: (on) => persist({ ...prefs, autoRefresh: on }),
      autoRefreshSeconds: prefs.autoRefreshSeconds,
      setAutoRefreshSeconds: (seconds) =>
        persist({
          ...prefs,
          autoRefreshSeconds: clampInterval(seconds),
        }),
      themeMode: prefs.themeMode,
      setThemeMode: (mode) =>
        setPrefs((prev) => {
          const next = { ...prev, themeMode: mode };
          writeShellPreferences(next);
          return next;
        }),
      resolvedTheme,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebarCollapsed,
      mobileNavOpen,
      setMobileNavOpen,
      showToast,
    }),
    [
      refreshTick,
      triggerRefresh,
      prefs,
      persist,
      resolvedTheme,
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebarCollapsed,
      mobileNavOpen,
      showToast,
    ],
  );

  return (
    <ShellContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </ShellContext.Provider>
  );
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within ShellProvider");
  }
  return ctx;
}
