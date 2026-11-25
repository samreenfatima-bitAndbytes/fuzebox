"use client";

export function DownloadCsvButton({
  label = "Download CSV",
  onClick,
  disabled,
  className = "",
}: {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "shrink-0 rounded-md border border-brand-border px-3 py-1.5 text-sm font-medium fb-hover disabled:opacity-50",
        className,
      ].join(" ")}
    >
      {label}
    </button>
  );
}
