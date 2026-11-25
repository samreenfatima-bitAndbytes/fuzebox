import type { ReactNode } from "react";

export type KpiTone = "default" | "accent" | "neutral" | "positive" | "caution";

export type KpiIconTone = "blue" | "orange" | "red" | "teal";

export type KpiCardProps = {
  label: ReactNode;
  value: string;
  sub?: string;
  /** md = default dashboard tile; lg = observation plane emphasis */
  size?: "md" | "lg";
  /** Tighter tile for nested grids (telemetry, studio panels) */
  compact?: boolean;
  /** Optional value emphasis only; tile background stays Overview default */
  tone?: KpiTone;
  /** Optional corner icon (e.g. Dependencies KPI row) */
  icon?: ReactNode;
  iconTone?: KpiIconTone;
  footer?: ReactNode;
};

const TONE_CLASS: Record<KpiTone, string> = {
  default: "",
  accent: "fb-kpi-accent",
  neutral: "fb-kpi-neutral",
  positive: "fb-kpi-positive",
  caution: "fb-kpi-caution",
};

const ICON_TONE_CLASS: Record<KpiIconTone, string> = {
  blue: "fb-kpi-icon--blue",
  orange: "fb-kpi-icon--orange",
  red: "fb-kpi-icon--red",
  teal: "fb-kpi-icon--teal",
};

export function KpiCard({
  label,
  value,
  sub,
  size = "md",
  compact = false,
  tone = "default",
  icon,
  iconTone = "blue",
  footer,
}: KpiCardProps) {
  return (
    <div
      className={[
        "fb-kpi flex flex-col justify-center",
        TONE_CLASS[tone],
        icon ? "fb-kpi--with-icon" : "",
        compact ? "fb-kpi-compact" : "min-h-[5.5rem]",
        !compact && size === "lg" ? "min-h-[5.75rem]" : "",
      ].join(" ")}
    >
      {icon ? (
        <span
          className={["fb-kpi-icon", ICON_TONE_CLASS[iconTone]].join(" ")}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      <div className="fb-kpi-label">{label}</div>
      <div
        className={[
          "fb-kpi-value mt-1 min-w-0 tabular-nums",
          size === "lg" ? "text-2xl sm:text-3xl" : compact ? "text-lg" : "text-xl sm:text-2xl",
        ].join(" ")}
      >
        {value}
      </div>
      {sub ? <div className="fb-kpi-sub mt-0.5">{sub}</div> : null}
      {footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  );
}

export function KpiGrid({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={["fb-kpi-grid", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
