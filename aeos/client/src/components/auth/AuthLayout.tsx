import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Activity, BookCheck, Coins, ShieldCheck } from "lucide-react";

const HERO_POINTS = [
  {
    icon: Activity,
    text: "Capture every agent action across the Observation Plane with chained provenance.",
  },
  {
    icon: Coins,
    text: "Roll up Five Equations and economic cognition into board-ready insight.",
  },
  {
    icon: ShieldCheck,
    text: "Close the loop with governance rules, human review, and audit trails.",
  },
] as const;

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="aeos-auth-page min-h-screen flex">
      <aside
        className="aeos-auth-hero hidden lg:flex lg:w-[min(44%,30rem)] shrink-0 flex-col justify-between border-r border-[hsl(var(--sidebar-border))] px-10 py-12 xl:px-12"
        aria-label="r-Potential product overview"
      >
        <div>
          <div className="flex items-center gap-3">
            <Logo size={48} />
            <div className="min-w-0">
              <p className="text-lg font-semibold text-white tracking-tight truncate">
                r-Potential
              </p>
              <p className="text-sm text-white/65 truncate">Powered by FuzeBox AEOS</p>
            </div>
          </div>

          <p className="mt-10 text-[10px] font-semibold uppercase tracking-[.2em] text-[hsl(var(--sidebar-primary))]">
            Economic Cognition Layer
          </p>
          <h2 className="mt-3 max-w-sm text-3xl font-semibold leading-tight tracking-tight text-white">
            Price every agent action. Govern every decision.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Observation, predictive ledger, and cognition in one workspace — built for
            operators who need economics and compliance on the same plane.
          </p>
        </div>

        <ul className="mt-10 space-y-5">
          {HERO_POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex gap-3 text-sm leading-relaxed text-white/75">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-white/10 bg-white/5 text-[hsl(var(--sidebar-primary))]"
                aria-hidden
              >
                <Icon className="h-4 w-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-white/45">
          <BookCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Secure sign-in · Tenant-scoped workspaces · ISO-ready audit chain
        </div>
      </aside>

      <main className="aeos-auth-main flex min-h-screen flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 lg:px-12">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}
