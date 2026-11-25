"use client";

import type { ReactNode, Ref } from "react";

export type PageTabItem<T extends string> = {
  id: T;
  label: string;
};

export function PageTabs<T extends string>({
  tabs,
  active,
  onChange,
  className = "",
}: {
  tabs: readonly PageTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div
      className={["fb-page-tabs", className].join(" ")}
      role="tablist"
      aria-label="Page views"
    >
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={[
              "fb-page-tab",
              selected ? "fb-page-tab-active" : "fb-page-tab-inactive",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function PageTabPanel({
  id,
  labelledBy,
  children,
  className = "",
  panelRef,
}: {
  id: string;
  labelledBy: string;
  children: ReactNode;
  className?: string;
  panelRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={panelRef}
      id={id}
      role="tabpanel"
      aria-labelledby={labelledBy}
      className={className}
    >
      {children}
    </div>
  );
}
