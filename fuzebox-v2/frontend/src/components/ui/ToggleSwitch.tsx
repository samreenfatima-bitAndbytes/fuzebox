"use client";

export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  id,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className="min-w-[1.75rem] text-[10px] font-semibold uppercase tracking-wide text-brand-muted"
        aria-hidden
      >
        {checked ? "ON" : "OFF"}
      </span>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        aria-label={label ?? (checked ? "Disable rule" : "Enable rule")}
        disabled={disabled}
        className={[
          "fb-toggle-track",
          checked ? "fb-toggle-track--on" : "",
          disabled ? "opacity-50" : "",
        ].join(" ")}
        onClick={() => onChange(!checked)}
      >
        <span className="fb-toggle-thumb" />
      </button>
    </div>
  );
}
