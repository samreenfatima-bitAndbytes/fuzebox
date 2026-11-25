export type ChartLegendKind = "bar" | "line" | "line-dashed" | "area" | "swatch";

export type ChartLegendItem = {
  label: string;
  color: string;
  kind?: ChartLegendKind;
};

function LegendSwatch({ kind, color }: { kind: ChartLegendKind; color: string }) {
  if (kind === "line") {
    return (
      <span
        className="inline-block h-0.5 w-5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
    );
  }

  if (kind === "line-dashed") {
    return (
      <span
        className="inline-block h-0 w-5 shrink-0 border-t-2 border-dashed"
        style={{ borderColor: color }}
        aria-hidden
      />
    );
  }

  if (kind === "bar") {
    return (
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden
      />
    );
  }

  if (kind === "area") {
    return (
      <span
        className="inline-block h-3 w-3 shrink-0 rounded-sm border"
        style={{
          backgroundColor: color,
          borderColor: color.replace(/[\d.]+\)$/, "1)"),
        }}
        aria-hidden
      />
    );
  }

  return (
    <span
      className="inline-block h-3 w-3 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

export function ChartLegendRow({
  items,
  className = "",
}: {
  items: ChartLegendItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={["flex flex-wrap items-center gap-x-5 gap-y-2", className].join(" ")}
      role="list"
      aria-label="Chart legend"
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-2 text-sm font-medium text-brand-ink sm:text-[0.9375rem]"
          role="listitem"
        >
          <LegendSwatch kind={item.kind ?? "swatch"} color={item.color} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
