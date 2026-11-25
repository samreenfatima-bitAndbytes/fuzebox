import type { ReactNode } from "react";

const VARIANT = {
  error: "fb-alert-error",
  success: "fb-alert-success",
  warn: "fb-alert-warn",
  info: "fb-alert-info",
} as const;

export type AlertVariant = keyof typeof VARIANT;

export function Alert({
  variant,
  children,
  className = "",
  role = "status",
}: {
  variant: AlertVariant;
  children: ReactNode;
  className?: string;
  role?: "status" | "alert";
}) {
  return (
    <div className={[VARIANT[variant], className].join(" ")} role={role}>
      {children}
    </div>
  );
}
