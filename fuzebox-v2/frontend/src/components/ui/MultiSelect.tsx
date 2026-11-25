"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { SelectOption } from "@/components/ui/Select";

type MultiSelectProps = {
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  /** Shown when nothing is selected (empty = all). */
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
  className?: string;
  id?: string;
  "aria-label"?: string;
};

const SIZE = {
  sm: "px-2.5 py-1.5 text-sm",
  md: "px-3 py-2 text-sm",
} as const;

/** Matches max-h-72 on the dropdown panel (header + list). */
const MENU_ESTIMATED_HEIGHT_PX = 288;

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={[
        "h-4 w-4 shrink-0 text-brand-muted transition-transform duration-200",
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
  );
}

function Check({ checked }: { checked: boolean }) {
  return (
    <span
      className={[
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
        checked
          ? "border-brand-primary bg-brand-primary text-white"
          : "border-brand-border bg-[var(--surface)]",
      ].join(" ")}
      aria-hidden
    >
      {checked ? (
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.42 0l-3.25-3.25a1 1 0 111.42-1.42l2.54 2.54 6.54-6.54a1 1 0 011.42 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : null}
    </span>
  );
}

export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "All",
  disabled = false,
  size = "md",
  className = "",
  id,
  "aria-label": ariaLabel,
}: MultiSelectProps) {
  const autoId = useId();
  const buttonId = id ?? autoId;
  const listboxId = `${buttonId}-listbox`;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuRect, setMenuRect] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    placement: "above" | "below";
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selected = useMemo(() => new Set(values), [values]);

  const summary = useMemo(() => {
    if (values.length === 0) return placeholder;
    if (values.length === 1) {
      return options.find((o) => o.value === values[0])?.label ?? values[0];
    }
    return `${values.length} selected`;
  }, [values, options, placeholder]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const spaceBelow = window.innerHeight - r.bottom - gap;
    const spaceAbove = r.top - gap;
    const openAbove =
      spaceBelow < MENU_ESTIMATED_HEIGHT_PX && spaceAbove > spaceBelow;
    const width = Math.max(r.width, 240);
    const left = Math.min(r.left, window.innerWidth - width - 8);

    if (openAbove) {
      setMenuRect({
        bottom: window.innerHeight - r.top + gap,
        left,
        width,
        placement: "above",
      });
    } else {
      setMenuRect({
        top: r.bottom + gap,
        left,
        width,
        placement: "below",
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      const panel = document.getElementById(listboxId);
      if (panel?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onMouse);
    return () => document.removeEventListener("mousedown", onMouse);
  }, [open, listboxId]);

  const toggle = (value: string) => {
    if (selected.has(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  const menu =
    open && menuRect && mounted ? (
      <div
        id={listboxId}
        role="listbox"
        aria-multiselectable
        aria-labelledby={buttonId}
        style={{
          position: "fixed",
          left: menuRect.left,
          width: menuRect.width,
          zIndex: 400,
          ...(menuRect.placement === "above"
            ? { bottom: menuRect.bottom }
            : { top: menuRect.top }),
        }}
        className="z-toast max-h-72 overflow-hidden rounded-lg border border-brand-border bg-[var(--surface-elevated)] shadow-lg ring-1 ring-black/5"
      >
        <div className="flex items-center justify-between gap-2 border-b border-brand-border px-3 py-2">
          <span className="text-xs text-brand-muted">
            {values.length === 0 ? "Showing all" : `${values.length} selected`}
          </span>
          <button
            type="button"
            className="text-xs font-medium text-brand-primary hover:underline"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange([]);
            }}
          >
            Clear
          </button>
        </div>
        <ul className="max-h-56 overflow-auto py-1">
          {options.map((opt) => {
            const isSelected = selected.has(opt.value);
            return (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  onMouseDown={(e) => {
                    if (opt.disabled) return;
                    e.preventDefault();
                    toggle(opt.value);
                  }}
                  className={[
                    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                    opt.disabled
                      ? "cursor-not-allowed text-brand-muted/60"
                      : isSelected
                        ? "bg-[var(--nav-active-bg)] text-[var(--nav-active-text)]"
                        : "text-brand-ink hover:bg-[var(--nav-hover-bg)]",
                  ].join(" ")}
                >
                  <Check checked={isSelected} />
                  <span className="min-w-0 truncate">{opt.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  return (
    <div className={["relative inline-block min-w-[12rem] w-full", className].join(" ")}>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          if (!disabled) setOpen((o) => !o);
        }}
        className={[
          "fb-input flex w-full items-center justify-between gap-2 text-left shadow-sm",
          SIZE[size],
          disabled
            ? "cursor-not-allowed opacity-50"
            : open
              ? "border-brand-primary ring-2 ring-brand-primary/15"
              : "hover:border-brand-primary/35",
        ].join(" ")}
      >
        <span
          className={[
            "truncate",
            values.length > 0 ? "font-medium text-brand-ink" : "text-brand-muted",
          ].join(" ")}
        >
          {summary}
        </span>
        <Chevron open={open} />
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
