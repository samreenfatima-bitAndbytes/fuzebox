"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShell } from "@/components/ShellProvider";
import { Select } from "@/components/ui/Select";
import {
  AUTO_REFRESH_INTERVAL_OPTIONS,
  THEME_MODE_OPTIONS,
  type ThemeMode,
} from "@/lib/shell-preferences";

function ToggleRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 transition-colors hover:bg-[var(--surface-hover)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-brand-border text-brand-primary focus:ring-brand-primary/30"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-brand-ink">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-xs text-brand-muted">{hint}</span>
        )}
      </span>
    </label>
  );
}

export function ShellOptionsMenu() {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  const {
    presentationMode,
    setPresentationMode,
    autoRefresh,
    setAutoRefresh,
    autoRefreshSeconds,
    setAutoRefreshSeconds,
    themeMode,
    setThemeMode,
  } = useShell();

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      const width = 280;
      let left = rect.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setPos({
        top: rect.bottom + 6,
        left,
        width,
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        buttonRef.current?.contains(t) ||
        panelRef.current?.contains(t)
      ) {
        return;
      }
      // Theme/interval Select menus portal to document.body — ignore those clicks
      if (t instanceof Element && t.closest('[role="listbox"]')) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panel =
    open && mounted ? (
      <div
        ref={panelRef}
        id={menuId}
        role="menu"
        className="fb-shell-options-panel fixed z-toast py-3 ring-1 ring-black/5"
        style={{ top: pos.top, left: pos.left, width: pos.width }}
      >
        <div className="border-b border-brand-border px-3 pb-3 pt-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-brand-muted">
            Appearance
          </p>
          <div className="mt-2">
            <Select
              size="sm"
              value={themeMode}
              onChange={(v) => setThemeMode(v as ThemeMode)}
              options={[...THEME_MODE_OPTIONS]}
              className="w-full min-w-0"
              aria-label="Theme"
            />
          </div>
        </div>

        <div className="space-y-1 border-b border-brand-border px-3 py-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-brand-muted">
            View
          </p>
          <ToggleRow
            label="Presentation"
            hint="Show demo talking points on supported pages"
            checked={presentationMode}
            onChange={setPresentationMode}
          />
        </div>

        <div className="space-y-2 px-3 pt-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-brand-muted">
            Data refresh
          </p>
          <ToggleRow
            label="Auto-refresh"
            hint="Periodically reload the current page"
            checked={autoRefresh}
            onChange={setAutoRefresh}
          />
          {autoRefresh && (
            <div className="pl-6">
              <span className="mb-1 block text-xs text-brand-muted">
                Interval
              </span>
              <Select
                size="sm"
                value={String(autoRefreshSeconds)}
                onChange={(v) => setAutoRefreshSeconds(Number(v))}
                options={[...AUTO_REFRESH_INTERVAL_OPTIONS]}
                className="w-full min-w-0"
                aria-label="Auto-refresh interval"
              />
            </div>
          )}
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="fb-btn-toolbar inline-flex items-center gap-1.5"
        title="Theme, presentation, and auto-refresh"
      >
        <svg
          className="h-4 w-4 text-brand-muted"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path d="M3 4.75A.75.75 0 013.75 4h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 4.75zm0 5A.75.75 0 013.75 9h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 9.75zm0 5a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" />
        </svg>
        View
        <svg
          className={[
            "h-4 w-4 text-brand-muted transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {mounted && panel ? createPortal(panel, document.body) : null}
    </>
  );
}
