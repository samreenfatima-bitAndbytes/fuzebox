"use client";

import type { ReactNode } from "react";

const HERO_POINTS = [
  "Monitor agent performance, cost, and quality in one place.",
  "Generate pipeline runs and tune workflows from Run Review.",
  "Trace end-to-end execution across your agent fleet.",
] as const;

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="fb-auth-page flex min-h-screen">
      <aside
        className="fb-auth-hero relative hidden w-[min(44%,30rem)] shrink-0 flex-col justify-between border-r px-10 py-12 lg:flex xl:px-12"
        aria-label="Fuzebox product overview"
      >
        <div>
          <div className="flex items-center gap-3">
            <div
              className="fb-auth-hero-logo flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
              aria-hidden
            >
              F
            </div>
            <div>
              <p className="fb-auth-hero-title text-lg font-bold tracking-tight">
                Fuzebox
              </p>
              <p className="fb-auth-hero-sub text-sm font-medium">
                Agent performance platform
              </p>
            </div>
          </div>
          <h2 className="fb-auth-hero-title mt-12 max-w-sm text-3xl font-bold leading-tight tracking-tight">
            Operations console for AI agents
          </h2>
          <p className="fb-auth-hero-body mt-4 max-w-sm text-sm leading-relaxed">
            Executive-ready dashboards, scenario builder, and run review — built
            for teams shipping multi-agent workflows.
          </p>
        </div>

        <ul className="mt-10 space-y-4">
          {HERO_POINTS.map((point) => (
            <li
              key={point}
              className="fb-auth-hero-body flex gap-3 text-sm leading-relaxed"
            >
              <span
                className="fb-auth-hero-bullet mt-2 h-2 w-2 shrink-0 rounded-full"
                aria-hidden
              />
              {point}
            </li>
          ))}
        </ul>

        <p className="fb-auth-hero-foot text-xs font-medium tracking-wide">
          Secure sign-in · Role-based access · Live & demo data modes
        </p>
      </aside>

      <main className="fb-auth-main flex min-h-screen flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 lg:px-12">
        <div className="w-full max-w-[26rem]">{children}</div>
      </main>
    </div>
  );
}
