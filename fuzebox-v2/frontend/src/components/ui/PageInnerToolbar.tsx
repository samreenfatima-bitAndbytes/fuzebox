import type { ReactNode } from "react";

/** Filter row inside a card (no outer page toolbar panel). */
export function PageInnerToolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["fb-page-inner-toolbar", className].filter(Boolean).join(" ")}
      role="toolbar"
    >
      {children}
    </div>
  );
}
