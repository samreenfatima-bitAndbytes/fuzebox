"use client";

export function FilterChipGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = "Filter",
  className = "",
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={["fb-page-tabs", className].join(" ")}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(opt.id)}
            className={[
              "fb-page-tab",
              selected ? "fb-page-tab-active" : "fb-page-tab-inactive",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
