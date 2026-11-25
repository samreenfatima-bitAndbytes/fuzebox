/** Small label chips for toolbars (tags, status, patent ids). */
export function PageChip({
  children,
  variant = "default",
  className = "",
}: {
  children: React.ReactNode;
  variant?: "default" | "muted";
  className?: string;
}) {
  return (
    <span
      className={[
        variant === "muted" ? "fb-page-chip-muted" : "fb-page-chip",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
