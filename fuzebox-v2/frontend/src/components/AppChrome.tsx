"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { getSession } from "@/lib/auth";

/** Persistent shell chrome — sidebar stays mounted across route changes. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const session = getSession();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-brand-bg">
      {session ? (
        <Sidebar username={session.username} role={session.role} />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
