import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard, DollarSign, FlaskConical,
  ShieldCheck, FileSearch,
  Coins, Gauge, ScanSearch, BookCheck,
  Scale, FileText, KeyRound, Sigma, LogOut, Menu, X, Network,
} from "lucide-react";
import { Logo } from "./Logo";

type Item = { href: string; label: string; icon: any; badge?: string; badgeTone?: "primary" | "danger" | "warning" };
type Group = { label: string; items: Item[] };

const groups: Group[] = [
  {
    label: "ECONOMICS",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/insights/financial", label: "Financial Impact", icon: DollarSign },
      { href: "/insights/equations", label: "AI Performance", icon: Gauge },
      { href: "/insights/scenarios", label: "What-If Scenarios", icon: FlaskConical },
      { href: "/insights/correlations", label: "Correlations", icon: Sigma },
      { href: "/ecl/cognition", label: "Cognition Plane", icon: Coins },
      { href: "/ecl/ledger", label: "Predictive Ledger", icon: BookCheck },
      { href: "/ecl/recommendations", label: "Recommendations", icon: ScanSearch },
      { href: "/ecl/uop-library", label: "UoP Library", icon: BookCheck },
      { href: "/planning/board", label: "Board Report", icon: BookCheck },
    ],
  },
  {
    label: "AGENTS",
    items: [
      { href: "/agents", label: "Agent Registry", icon: Network },
    ],
  },
  {
    label: "GOVERNANCE LAYER",
    items: [
      { href: "/governance/audit", label: "Audit Trail", icon: ShieldCheck },
      { href: "/governance/oversight", label: "Unreviewed Decisions", icon: FileSearch },
      { href: "/governance/compliance", label: "Rules & Compliance", icon: Scale },
      { href: "/governance/api-keys", label: "API Keys", icon: KeyRound },
      { href: "/governance/api-docs", label: "API Docs", icon: FileText },
    ],
  },
];

const DESKTOP_NAV_MQ = "(min-width: 1024px)";

async function handleLogout() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  window.location.href = window.location.origin;
}

export function Layout({ children, title, kicker, headerRight }: { children: ReactNode; title: string; kicker?: string; headerRight?: ReactNode }) {
  const [location] = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_NAV_MQ).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_NAV_MQ);
    const update = () => {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      if (desktop) setNavOpen(false);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    setNavOpen(false);
  }, [location]);

  useEffect(() => {
    if (!navOpen || isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [navOpen, isDesktop]);

  const mobileDrawer = navOpen && !isDesktop;

  return (
    <div className="aeos-app-shell">
      {mobileDrawer && (
        <button
          type="button"
          className="aeos-nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}

      <aside
        className={`aeos-sidebar text-sm${mobileDrawer ? " aeos-sidebar--open" : ""}`}
        style={{ overscrollBehavior: "contain" }}
        aria-hidden={!isDesktop && !navOpen ? true : undefined}
      >
        <div className="aeos-sidebar-brand px-5 py-5 flex items-center gap-3">
          <Logo size={36} />
          <div className="leading-tight min-w-0 flex-1">
            <div className="font-semibold text-white truncate">r-Potential</div>
            <div className="text-[11px] text-white/65 truncate">Powered by FuzeBox AEOS</div>
          </div>
          {!isDesktop && (
            <button
              type="button"
              className="aeos-sidebar-close"
              aria-label="Close menu"
              onClick={() => setNavOpen(false)}
            >
              <X className="h-5 w-5" strokeWidth={1.8} />
            </button>
          )}
        </div>

        <nav className="aeos-sidebar-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-4 space-y-5">
          {groups.map(g => (
            <div key={g.label}>
              <div className="aeos-sidebar-group-label">{g.label}</div>
              <ul className="space-y-0.5">
                {g.items.map(item => {
                  const active = location === item.href || (item.href !== "/" && location.startsWith(item.href + "/"));
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="aeos-sidebar-nav-link"
                        data-active={active ? "true" : "false"}
                        data-testid={`nav-${item.href.replace(/\//g, "-").replace(/^-/, "") || "dashboard"}`}
                        onClick={() => setNavOpen(false)}
                      >
                        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge && (
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                            style={{
                              background: item.badgeTone === "danger" ? "hsl(var(--danger))"
                                        : item.badgeTone === "warning" ? "hsl(var(--warning))"
                                        : "hsl(var(--sidebar-primary))",
                              color: "white",
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="aeos-sidebar-footer px-4 py-4">
          <button
            type="button"
            onClick={async () => {
              setLoggingOut(true);
              await handleLogout();
            }}
            disabled={loggingOut}
            className="aeos-sidebar-signout disabled:opacity-50"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span>{loggingOut ? "Signing out…" : "Sign out"}</span>
          </button>
        </div>
      </aside>

      <div className="aeos-app-main">
        <header className="aeos-topbar">
          <button
            type="button"
            className="aeos-topbar-menu"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen(o => !o)}
          >
            {navOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <div className="aeos-topbar-title">
            {kicker && <div className="aeos-topbar-kicker">{kicker}</div>}
            <h1 className="aeos-topbar-heading">{title}</h1>
          </div>

          {headerRight && (
            <div className="aeos-topbar-actions">
              {headerRight}
            </div>
          )}
        </header>

        <main className="aeos-app-content">
          <div className="aeos-page-inner">{children}</div>
        </main>
      </div>
    </div>
  );
}
