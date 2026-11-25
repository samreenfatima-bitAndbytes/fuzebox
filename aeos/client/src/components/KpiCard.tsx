import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "orange" | "green" | "amber" | "red" | "slate";
const ICON_BG: Record<Tone, string> = {
  primary: "bg-[hsl(213_100%_94%)] text-[hsl(213_84%_42%)]",
  orange:  "bg-[hsl(25_100%_94%)]  text-[hsl(25_90%_45%)]",
  green:   "bg-[hsl(142_72%_92%)]  text-[hsl(142_70%_30%)]",
  amber:   "bg-[hsl(38_96%_92%)]   text-[hsl(28_90%_38%)]",
  red:     "bg-[hsl(0_85%_94%)]    text-[hsl(0_72%_44%)]",
  slate:   "bg-[hsl(220_14%_94%)]  text-[hsl(220_15%_28%)]",
};

export function KpiCard({
  label, value, sub, icon, tone = "primary", trend, footer, className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  trend?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const valueTitle =
    typeof value === "string" || typeof value === "number" ? String(value) : undefined;

  return (
    <div className={cn(
      "rounded-xl border bg-card p-4 ecl-card-shadow flex flex-col gap-2 min-w-0 overflow-hidden",
      className
    )}>
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground leading-snug min-w-0">
          {label}
        </div>
        {icon && (
          <div className={cn("h-8 w-8 rounded-lg grid place-items-center shrink-0", ICON_BG[tone])}>
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-2 min-w-0">
        <div
          className="text-xl sm:text-2xl xl:text-[28px] font-bold leading-tight text-foreground tabular-nums min-w-0 truncate"
          title={valueTitle}
        >
          {value}
        </div>
        {trend && <div className="shrink-0">{trend}</div>}
      </div>
      {sub && (
        <div className="text-xs text-muted-foreground min-w-0 truncate" title={typeof sub === "string" ? sub : undefined}>
          {sub}
        </div>
      )}
      {footer && <div className="pt-2 mt-auto min-w-0">{footer}</div>}
    </div>
  );
}
