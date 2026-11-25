"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
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

const MENU_GAP = 4;
const VIEWPORT_PAD = 8;
const MENU_MAX_HEIGHT = 240;
const MENU_ROW_HEIGHT = 40;
const MENU_PADDING = 8;

type MenuRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function estimateMenuHeight(optionCount: number): number {
  return Math.min(
    optionCount * MENU_ROW_HEIGHT + MENU_PADDING,
    MENU_MAX_HEIGHT,
  );
}

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

function Check() {
  return (
    <svg
      className="h-4 w-4 shrink-0 text-brand-primary"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.42 0l-3.25-3.25a1 1 0 111.42-1.42l2.54 2.54 6.54-6.54a1 1 0 011.42 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  size = "md",
  className = "",
  id,
  "aria-label": ariaLabel,
}: SelectProps) {
  const autoId = useId();
  const buttonId = id ?? autoId;
  const listboxId = `${buttonId}-listbox`;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const naturalHeight =
      menuRef.current?.scrollHeight ?? estimateMenuHeight(options.length);
    const spaceBelow = window.innerHeight - r.bottom - VIEWPORT_PAD;
    const spaceAbove = r.top - VIEWPORT_PAD;

    let openAbove = false;
    let maxHeight = MENU_MAX_HEIGHT;

    if (naturalHeight + MENU_GAP <= spaceBelow) {
      openAbove = false;
      maxHeight = Math.min(MENU_MAX_HEIGHT, spaceBelow - MENU_GAP);
    } else if (naturalHeight + MENU_GAP <= spaceAbove) {
      openAbove = true;
      maxHeight = Math.min(MENU_MAX_HEIGHT, spaceAbove - MENU_GAP);
    } else {
      openAbove = spaceAbove > spaceBelow;
      maxHeight = Math.min(
        MENU_MAX_HEIGHT,
        (openAbove ? spaceAbove : spaceBelow) - MENU_GAP,
      );
    }

    maxHeight = Math.max(80, maxHeight);
    const menuHeight = Math.min(naturalHeight, maxHeight);
    const top = openAbove
      ? Math.max(VIEWPORT_PAD, r.top - MENU_GAP - menuHeight)
      : r.bottom + MENU_GAP;

    setMenuRect({
      top,
      left: r.left,
      width: r.width,
      maxHeight,
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
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

  const menu =
    open && menuRect && mounted ? (
      <ul
        ref={menuRef}
        id={listboxId}
        role="listbox"
        aria-labelledby={buttonId}
        style={{
          position: "fixed",
          top: menuRect.top,
          left: menuRect.left,
          width: menuRect.width,
          maxHeight: menuRect.maxHeight,
          zIndex: 400,
        }}
        className="z-toast overflow-auto rounded-lg border border-brand-border bg-[var(--surface-elevated)] py-1 shadow-lg ring-1 ring-black/5"
      >
        {options.map((opt) => {
          const isSelected = opt.value === value;
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
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                  opt.disabled
                    ? "cursor-not-allowed text-brand-muted/60"
                    : isSelected
                      ? "bg-[var(--nav-active-bg)] font-medium text-[var(--nav-active-text)]"
                      : "text-brand-ink hover:bg-[var(--nav-hover-bg)]",
                ].join(" ")}
              >
                <span>{opt.label}</span>
                {isSelected && <Check />}
              </button>
            </li>
          );
        })}
      </ul>
    ) : null;

  return (
    <div className={["relative inline-block min-w-[10rem]", className].join(" ")}>
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
            selected ? "font-medium text-brand-ink" : "text-brand-muted",
          ].join(" ")}
        >
          {selected?.label ?? placeholder}
        </span>
        <Chevron open={open} />
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  className = "",
  ...selectProps
}: SelectProps & {
  label?: string;
  hint?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-brand-muted">
          {label}
        </span>
      )}
      <Select {...selectProps} />
      {hint && (
        <span className="mt-1 block text-xs text-brand-muted">{hint}</span>
      )}
    </div>
  );
}
