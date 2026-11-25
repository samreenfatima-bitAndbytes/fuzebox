"use client";

import { useEffect, useState, type ReactNode } from "react";

const DRAWER_ANIM_MS = 280;

export function Modal({
  open,
  onClose,
  children,
  align = "center",
  size = "md",
  labelledBy,
  describedBy,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "center" | "sheet" | "drawer-right";
  size?: "md" | "lg";
  labelledBy?: string;
  describedBy?: string;
  closeOnBackdrop?: boolean;
}) {
  const [mounted, setMounted] = useState(open);
  const isDrawerRight = align === "drawer-right";
  const closing = isDrawerRight && mounted && !open;

  useEffect(() => {
    if (open) {
      setMounted(true);
    } else if (!isDrawerRight) {
      setMounted(false);
    }
  }, [open, isDrawerRight]);

  useEffect(() => {
    if (!isDrawerRight || open || !mounted) return;
    const t = window.setTimeout(() => setMounted(false), DRAWER_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted, isDrawerRight]);

  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  const panelMax =
    align === "drawer-right"
      ? ""
      : size === "lg"
        ? "max-w-4xl"
        : "max-w-lg";

  return (
    <div
      className={[
        "fb-modal-overlay",
        align === "sheet"
          ? "items-end p-0 sm:items-center sm:p-4"
          : align === "drawer-right"
            ? [
                "fb-modal-overlay--drawer-right",
                closing ? "fb-modal-overlay--drawer-right-out" : "fb-modal-overlay--drawer-right-in",
              ].join(" ")
            : "items-center p-4",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={[
          "fb-modal-panel fb-modal-panel-accent w-full",
          panelMax,
          align === "sheet"
            ? "rounded-t-xl sm:rounded-xl overflow-y-auto"
            : align === "drawer-right"
              ? [
                  "fb-modal-panel--drawer-right min-h-0 overflow-hidden",
                  closing ? "fb-modal-panel--drawer-right-out" : "fb-modal-panel--drawer-right-in",
                ].join(" ")
              : "rounded-xl overflow-y-auto",
        ].join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({
  title,
  description,
  actions,
  titleId,
  onClose,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  titleId?: string;
  onClose?: () => void;
}) {
  return (
    <header
      className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border px-5 py-4 sm:px-6"
      style={{ background: "var(--accent-gradient-soft)" }}
    >
      <div className="min-w-0 flex-1">
        <h2
          id={titleId}
          className="fb-text-display text-lg"
        >
          {title}
        </h2>
        {description ? (
          <p className="fb-text-subtitle mt-1 break-words">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-brand-muted fb-hover"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function ModalBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["px-5 py-4 sm:px-6 sm:py-5", className].join(" ")}>
      {children}
    </div>
  );
}

export function ModalFooter({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <footer
      className={[
        "flex flex-wrap gap-3 border-t border-brand-border px-5 py-4 sm:px-6",
        className,
      ].join(" ")}
    >
      {children}
    </footer>
  );
}
