"use client";

import type { CSSProperties, ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export function DataTableToolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["flex flex-wrap items-center gap-3", className].join(" ")}
      role="toolbar"
    >
      {children}
    </div>
  );
}

export function DataTable({
  children,
  empty,
  className = "",
  stickyHeader = true,
}: {
  children: ReactNode;
  empty?: { title?: string; message: string };
  className?: string;
  stickyHeader?: boolean;
}) {
  if (empty) {
    return (
      <div className={["fb-card-accent-top", className].join(" ")}>
        <EmptyState
          title={empty.title}
          message={empty.message}
          size="sm"
          className="border-0 bg-transparent"
        />
      </div>
    );
  }

  return (
    <div className={["fb-card-accent-top shadow-sm", className].join(" ")}>
      <div className="fb-table-scroll">
        <table
          className={[
            "fb-data-table min-w-full text-left text-sm",
            stickyHeader ? "fb-data-table-sticky" : "",
          ].join(" ")}
        >
          {children}
        </table>
      </div>
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return <thead className="fb-table-head">{children}</thead>;
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-brand-border">{children}</tbody>;
}

export function DataTableRow({
  children,
  className = "",
  id,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      id={id}
      className={["fb-table-row", className].join(" ")}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  children,
  align = "left",
  className = "",
  title,
  style,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const alignClass =
    align === "right"
      ? "text-right"
      : align === "center"
        ? "text-center"
        : "text-left";
  return (
    <td
      className={["fb-data-table-cell", alignClass, className].join(" ")}
      title={title}
      style={style}
    >
      {children}
    </td>
  );
}
