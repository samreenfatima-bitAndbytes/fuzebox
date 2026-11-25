"use client";

export type ToastVariant = "success" | "error" | "info";

export type ToastMessage = {
  id: number;
  message: string;
  variant: ToastVariant;
};

const VARIANT_CLASS: Record<ToastVariant, string> = {
  success: "fb-alert-success",
  error: "fb-alert-error",
  info: "fb-alert-info",
};

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-5 right-5 z-toast flex max-w-lg flex-col gap-3 sm:bottom-7 sm:right-7"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "pointer-events-auto rounded-xl px-5 py-4 text-base shadow-xl",
            VARIANT_CLASS[t.variant],
          ].join(" ")}
          role="status"
        >
          <div className="flex items-start justify-between gap-4">
            <span className="leading-snug">{t.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="shrink-0 rounded-md p-1 text-lg leading-none text-current opacity-70 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
