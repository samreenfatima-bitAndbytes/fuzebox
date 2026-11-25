export type AuthTab = "signin" | "register";

export function AuthTabs({
  active,
  onChange,
  disabled,
}: {
  active: AuthTab;
  onChange: (tab: AuthTab) => void;
  disabled?: boolean;
}) {
  const tabs: { id: AuthTab; label: string }[] = [
    { id: "signin", label: "Sign in" },
    { id: "register", label: "Create workspace" },
  ];

  return (
    <div
      className="aeos-content-segment w-full"
      role="tablist"
      aria-label="Authentication mode"
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`auth-tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`auth-panel-${tab.id}`}
          disabled={disabled}
          className="aeos-content-segment-btn flex-1 justify-center"
          data-active={active === tab.id ? "true" : "false"}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
