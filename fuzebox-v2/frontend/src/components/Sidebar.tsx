"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconSignOut } from "@/components/shell/icons";
import { NavPageIcon } from "@/components/nav-icons";
import { useShell } from "@/components/ShellProvider";
import { clearSession } from "@/lib/auth";

type NavItem = {
  label: string;
  href?: string;
  external?: string;
  /** Icon lookup when link is external (no href). */
  iconHref?: string;
};

type NavGroup = {
  title: string;
  help: string;
  items: NavItem[];
};

/** Sidebar-visible routes only — other pages remain reachable by direct URL. */
const NAV: NavGroup[] = [
  {
    title: "Dashboard",
    help: "Classic fleet summary, performance, and task scorecards.",
    items: [
      { label: "Overview", href: "/overview" },
      { label: "Performance", href: "/performance" },
      { label: "Tasks", href: "/tasks" },
    ],
  },
  {
    title: "Monitor",
    help: "Live fleet pulse and operational activity.",
    items: [{ label: "Live Monitor", href: "/live-monitor" }],
  },
  {
    title: "MY AI AGENTS",
    help: "Registry, roster, comparisons, and dependency map.",
    items: [
      { label: "Agents", href: "/agents" },
      { label: "Agent Roster", href: "/agent-roster" },
      { label: "Agent Comparisons", href: "/agent-compare" },
      { label: "Dependencies", href: "/agent-dependencies" },
    ],
  },
  {
    title: "OBSERVATION",
    help: "Event capture, coverage, and economic cognition surfaces.",
    items: [
      { label: "Observation Plane", href: "/observation-plane" },
      { label: "Coverage Manifest", href: "/coverage-manifest" },
    ],
  },
  // {
  //   title: "OPERATIONS",
  //   help: "Deploy and register agent code packages.",
  //   items: [{ label: "Deploy Agent Code", href: "/deploy-agent-code" }],
  // },
  {
    title: "QUALITY",
    help: "Task outcomes, team reviews, and quality signals.",
    items: [{ label: "Tasks & Reviews", href: "/quality" }],
  },
  {
    title: "Studio",
    help: "Scenario design, run review, and distributed traces.",
    items: [
      { label: "Scenario Builder", href: "/scenario-builder" },
      { label: "Run Review", href: "/run-review" },
      { label: "Traces", href: "/traces" },
    ],
  },
  {
    title: "GOVERNANCE",
    help: "Oversight, compliance, and API access.",
    items: [
      { label: "Unreviewed Decisions", href: "/unreviewed-decisions" },
      { label: "Rules & Compliance", href: "/rules-compliance" },
      { label: "API Keys", href: "/api-keys" },
      { label: "API Docs", href: "/api-docs" },
    ],
  },
];

const GROUP_STORAGE_KEY = "fuzebox_nav_collapsed";
const SIDEBAR_SCROLL_KEY = "fuzebox_sidebar_scroll";

function groupSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

const PATH_PREFIX_ACTIVE: Record<string, string> = {
  "/overview": "/overview",
  "/performance": "/performance",
  "/tasks": "/tasks",
  "/live-monitor": "/live-monitor",
  "/agents": "/agents",
  "/agent-roster": "/agent-roster",
  "/agent-compare": "/agent-compare",
  "/agent-dependencies": "/agent-dependencies",
  "/observation-plane": "/observation-plane",
  "/coverage-manifest": "/coverage-manifest",
  "/deploy-agent-code": "/deploy-agent-code",
  "/quality": "/quality",
  "/scenario-builder": "/scenario-builder",
  "/run-review": "/run-review",
  "/traces": "/traces",
  "/unreviewed-decisions": "/unreviewed-decisions",
  "/rules-compliance": "/rules-compliance",
  "/api-keys": "/api-keys",
  "/api-docs": "/api-docs",
};

function navItemActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  const prefix = PATH_PREFIX_ACTIVE[href];
  return Boolean(prefix && pathname.startsWith(prefix));
}

function groupContainsPath(pathname: string, items: NavItem[]): boolean {
  return items.some((item) => item.href && navItemActive(pathname, item.href));
}

function readCollapsedState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(GROUP_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={[
        "h-4 w-4 shrink-0 transition-transform duration-200",
        collapsed ? "rotate-180" : "",
      ].join(" ")}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M11.78 5.22a.75.75 0 010 1.06L8.03 10l3.75 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function NavLink({
  item,
  rail,
  onNavigate,
}: {
  item: NavItem;
  rail: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = Boolean(item.href && navItemActive(pathname, item.href));

  const className = [
    "fb-nav-link",
    rail ? "fb-nav-link-rail" : "",
    active ? "fb-nav-link-active" : "",
  ].join(" ");

  const iconHref = item.href ?? item.iconHref;

  const content = (
    <>
      {iconHref && <NavPageIcon href={iconHref} />}
      {!rail && <span className="truncate">{item.label}</span>}
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        scroll={false}
        className={className}
        title={rail ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
      >
        {content}
      </Link>
    );
  }

  return (
    <a
      href={item.external}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={rail ? item.label : undefined}
    >
      {content}
    </a>
  );
}

function NavGroupSection({
  group,
  collapsed,
  onToggle,
  rail,
  onNavigate,
  sectionActive,
}: {
  group: NavGroup;
  collapsed: boolean;
  onToggle: () => void;
  rail: boolean;
  onNavigate?: () => void;
  sectionActive: boolean;
}) {
  const slug = groupSlug(group.title);

  if (rail) {
    return (
      <div className="space-y-0.5 border-b border-brand-border/60 pb-2 pl-1 last:border-0">
        {group.items.map((item) => (
          <NavLink key={item.label} item={item} rail onNavigate={onNavigate} />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-1">
      <button
        type="button"
        id={`nav-group-${slug}`}
        aria-expanded={!collapsed}
        aria-controls={`nav-group-panel-${slug}`}
        title={group.help}
        onClick={onToggle}
        className={[
          "fb-nav-group-btn",
          sectionActive ? "fb-nav-group-btn-active" : "fb-nav-group-btn-idle",
        ].join(" ")}
        aria-current={sectionActive ? "true" : undefined}
      >
        <span className="truncate">{group.title}</span>
        <svg
          className={[
            "h-4 w-4 shrink-0 transition-transform duration-200",
            collapsed ? "-rotate-90" : "rotate-0",
          ].join(" ")}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <div
        id={`nav-group-panel-${slug}`}
        role="region"
        aria-labelledby={`nav-group-${slug}`}
        className={[
          "grid transition-[grid-template-rows] duration-200 ease-out",
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="space-y-0.5 pb-2 pl-2 pt-0.5">
            {group.items.map((item) => (
              <NavLink
                key={item.label}
                item={item}
                rail={false}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ username, role }: { username: string; role: string }) {
  const pathname = usePathname();
  const {
    sidebarCollapsed,
    toggleSidebarCollapsed,
    mobileNavOpen,
    setMobileNavOpen,
  } = useShell();
  const [groupCollapsed, setGroupCollapsed] = useState<Record<string, boolean>>(
    {},
  );
  const navRef = useRef<HTMLElement>(null);

  const [isDesktop, setIsDesktop] = useState(false);
  const rail = sidebarCollapsed && isDesktop;
  const mobileDrawer = mobileNavOpen && !isDesktop;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setGroupCollapsed(readCollapsedState());
  }, []);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const saved = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (saved) {
      const top = Number(saved);
      if (!Number.isNaN(top)) el.scrollTop = top;
    }
    const onScroll = () => {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(el.scrollTop));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname, setMobileNavOpen]);

  useEffect(() => {
    if (!mobileDrawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const first = navRef.current?.querySelector<HTMLElement>(
      "a[href], button:not([disabled])",
    );
    first?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileDrawer, setMobileNavOpen]);

  useEffect(() => {
    setGroupCollapsed((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const group of NAV) {
        if (groupContainsPath(pathname, group.items) && next[group.title]) {
          next[group.title] = false;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname]);

  const persistGroups = useCallback((next: Record<string, boolean>) => {
    setGroupCollapsed(next);
    try {
      localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const toggleGroup = useCallback(
    (title: string) => {
      persistGroups({
        ...groupCollapsed,
        [title]: !groupCollapsed[title],
      });
    },
    [groupCollapsed, persistGroups],
  );

  const closeMobile = () => setMobileNavOpen(false);

  const signOut = () => {
    clearSession();
    window.location.href = "/login";
  };

  return (
    <>
      {mobileDrawer && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-[300] bg-black/45 backdrop-blur-[1px] lg:hidden"
          onClick={closeMobile}
        />
      )}

      <aside
        className={[
          "fb-app-sidebar fixed inset-y-0 left-0 z-[301] flex h-screen flex-col transition-[width,transform] duration-200 ease-out",
          "lg:relative lg:z-auto lg:translate-x-0 lg:shadow-none",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          rail ? "fb-sidebar-rail" : "fb-sidebar w-[min(var(--shell-sidebar-width),85vw)]",
        ].join(" ")}
        id="app-sidebar"
        aria-label="Main navigation"
        {...(mobileDrawer ? { "aria-modal": true as const } : {})}
      >
        <div
          className={[
            "fb-sidebar-brand flex shrink-0 items-center",
            rail ? "justify-center px-2 py-4" : "justify-between gap-2 px-4 py-4",
          ].join(" ")}
        >
          {rail ? (
            <Link
              href="/live-monitor"
              className="fb-sidebar-brand-mark"
              title="Fuzebox"
            >
              F
            </Link>
          ) : (
            <>
              <Link
                href="/live-monitor"
                className="flex min-w-0 items-center gap-3 rounded-md fb-hover"
              >
                <span className="fb-sidebar-brand-mark shrink-0">F</span>
                <span className="min-w-0">
                  <span className="fb-sidebar-brand-title block">Fuzebox</span>
                  <span className="fb-text-caption block">Agent Performance</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={toggleSidebarCollapsed}
                className="fb-btn-toolbar hidden shrink-0 !min-h-0 !p-2 lg:inline-flex"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <CollapseIcon collapsed={false} />
              </button>
            </>
          )}
        </div>

        {rail && (
          <div className="hidden border-b border-brand-border px-2 py-2 lg:block">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              className="fb-btn-toolbar flex w-full items-center justify-center !min-h-0 !p-2"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <CollapseIcon collapsed />
            </button>
          </div>
        )}

        <nav
          ref={navRef}
          className={[
            "fb-sidebar-nav-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4",
            rail ? "space-y-2 px-2" : "px-3 pl-4",
          ].join(" ")}
        >
          {NAV.map((group) => (
            <NavGroupSection
              key={group.title}
              group={group}
              collapsed={Boolean(groupCollapsed[group.title])}
              onToggle={() => toggleGroup(group.title)}
              rail={rail}
              onNavigate={closeMobile}
              sectionActive={groupContainsPath(pathname, group.items)}
            />
          ))}
        </nav>

        <div
          className={[
            "shrink-0 border-t border-brand-border",
            rail ? "px-2 py-4" : "px-4 py-5",
          ].join(" ")}
        >
          {rail ? (
            <div className="flex flex-col items-center gap-3">
              <div
                className="fb-sidebar-user-avatar"
                title={`${username} (${role})`}
              >
                {username.slice(0, 1).toUpperCase()}
              </div>
              <button
                type="button"
                onClick={signOut}
                className="fb-btn-toolbar !min-h-0 !p-2"
                title="Sign out"
                aria-label="Sign out"
              >
                <IconSignOut />
              </button>
            </div>
          ) : (
            <div className="fb-sidebar-user-card">
              <div className="flex items-center gap-3">
                <div className="fb-sidebar-user-avatar" aria-hidden>
                  {username.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm font-semibold text-brand-ink">
                    {username}
                  </p>
                  <p className="truncate text-xs capitalize text-brand-muted">
                    {role}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="fb-btn mt-3 inline-flex w-full items-center justify-center gap-2"
              >
                <IconSignOut />
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
