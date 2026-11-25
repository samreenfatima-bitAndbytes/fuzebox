/** Compact nav icons for sidebar (expanded + collapsed rail). */

import type { ReactNode } from "react";

type IconProps = { className?: string };

function Svg({
  className = "h-5 w-5",
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const NAV_PAGE_ICONS: Record<string, (props: IconProps) => ReactNode> = {
  "/live-monitor": (p) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M7 20h10M12 16v4" />
      <circle cx="12" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  ),
  "/overview": (p) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </Svg>
  ),
  "/observation-plane": (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
    </Svg>
  ),
  "/economics": (p) => (
    <Svg {...p}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7H14a3.5 3.5 0 010 7H6" />
    </Svg>
  ),
  "/performance": (p) => (
    <Svg {...p}>
      <path d="M22 12h-4l-3 9-4-18-3 9H2" />
    </Svg>
  ),
  "/tasks": (p) => (
    <Svg {...p}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M5 6l1 1 2-2M5 12l1 1 2-2M5 18l1 1 2-2" />
    </Svg>
  ),
  "/quality": (p) => (
    <Svg {...p}>
      <path d="M12 3l1.5 4.5H18l-3.5 2.5 1.5 4.5L12 12l-4 4.5 1.5-4.5L6 7.5h4.5z" />
    </Svg>
  ),
  "/agent-roster": (p) => (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="18" cy="18" r="3" />
      <path d="M18 15v1.5" />
    </Svg>
  ),
  "/agent-compare": (p) => (
    <Svg {...p}>
      <path d="M8 3v18M16 3v18M3 8h5M3 16h5M16 8h5M16 16h5" />
    </Svg>
  ),
  "/agent-dependencies": (p) => (
    <Svg {...p}>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2" />
      <path d="M8 6h8M6 8v8M16 10v6M10 16h6" />
    </Svg>
  ),
  "/economic-cognition/uop-library": (p) => (
    <Svg {...p}>
      <path d="M4 6h16M4 12h10M4 18h6" />
      <rect x="15" y="10" width="5" height="5" rx="1" />
      <path d="M17 8v2M19 10h-2" />
    </Svg>
  ),
  "/six-sigma/correlations": (p) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="2" />
      <circle cx="17" cy="17" r="2" />
      <path d="M9 7h8M7 9v8M15 11l-4 4" />
      <path d="M12 4v2M12 18v2M4 12h2M18 12h2" />
    </Svg>
  ),
  "/agents": (p) => (
    <Svg {...p}>
      <path d="M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </Svg>
  ),
  "/scenario-builder": (p) => (
    <Svg {...p}>
      <path d="M15 4l5 5M13 6L4 15l-1 4 4-1 9-9" />
    </Svg>
  ),
  "/run-review": (p) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </Svg>
  ),
  "/traces": (p) => (
    <Svg {...p}>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M8.6 17.4l10.8-10.8" />
    </Svg>
  ),
  "/v2-mission-control": (p) => (
    <Svg {...p}>
      <rect x="3" y="4" width="8" height="16" rx="1" />
      <rect x="13" y="4" width="8" height="16" rx="1" />
      <path d="M7 9h0M7 12h0M17 9h0M17 12h0" strokeWidth="2.5" />
    </Svg>
  ),
  "/coverage-manifest": (p) => (
    <Svg {...p}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </Svg>
  ),
  "/deploy-agent-code": (p) => (
    <Svg {...p}>
      <path d="M4.5 16.5L12 9l7.5 7.5" />
      <path d="M12 3v12" />
      <path d="M5 21h14" />
    </Svg>
  ),
  "/unreviewed-decisions": (p) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
      <circle cx="17" cy="17" r="3" fill="currentColor" stroke="none" />
    </Svg>
  ),
  "/rules-compliance": (p) => (
    <Svg {...p}>
      <path d="M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7l7-4z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  "/api-keys": (p) => (
    <Svg {...p}>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M16 3h5v5" />
    </Svg>
  ),
  "/api-docs": (p) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </Svg>
  ),
};

export function NavPageIcon({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  const base = href.startsWith("/agents") ? "/agents" : href;
  const Icon = NAV_PAGE_ICONS[base];
  if (!Icon) {
    return (
      <span
        className={[
          "flex h-5 w-5 items-center justify-center rounded bg-brand-primary/15 text-[10px] font-bold text-brand-primary",
          className,
        ].join(" ")}
      >
        •
      </span>
    );
  }
  return <>{Icon({ className: className ?? "h-5 w-5 shrink-0" })}</>;
}
