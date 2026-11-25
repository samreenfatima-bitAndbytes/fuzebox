"use client";

export type AuthTab = "signin" | "register";

const TABS: { id: AuthTab; label: string }[] = [
  { id: "signin", label: "Sign in" },
  { id: "register", label: "Create account" },
];

export function AuthTabs({
  active,
  onChange,
  disabled,
}: {
  active: AuthTab;
  onChange: (tab: AuthTab) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="fb-page-tabs"
      role="tablist"
      aria-label="Authentication"
    >
      {TABS.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`auth-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`auth-panel-${tab.id}`}
            disabled={disabled}
            onClick={() => onChange(tab.id)}
            className={[
              "fb-page-tab flex-1",
              selected ? "fb-page-tab-active" : "fb-page-tab-inactive",
              "disabled:cursor-not-allowed disabled:opacity-50",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
