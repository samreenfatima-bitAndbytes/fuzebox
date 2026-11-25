import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export type AeosSelectOption = {
  value: string;
  label: string;
};

type AeosSelectProps = {
  value: string;
  options: AeosSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  menuMinWidth?: string;
  "data-testid"?: string;
};

export function AeosSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  className,
  menuMinWidth,
  "data-testid": testId,
}: AeosSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div className={`aeos-select ${className ?? ""}`} ref={rootRef}>
      <button
        type="button"
        className="aeos-select-trigger"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid={testId}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          className="aeos-select-menu"
          role="listbox"
          style={menuMinWidth ? { minWidth: menuMinWidth } : undefined}
        >
          {options.map(option => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="aeos-select-option"
              data-active={option.value === value ? "true" : "false"}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
