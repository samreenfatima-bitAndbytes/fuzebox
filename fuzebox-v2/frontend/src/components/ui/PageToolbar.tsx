import type { ReactNode } from "react";

/** Horizontal filter / control row — tinted panel at top of dashboard pages. */
export function PageToolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["fb-page-toolbar-panel", className].filter(Boolean).join(" ")}
      role="toolbar"
      aria-label="Page filters"
    >
      <div className="fb-page-toolbar w-full">{children}</div>
    </div>
  );
}
