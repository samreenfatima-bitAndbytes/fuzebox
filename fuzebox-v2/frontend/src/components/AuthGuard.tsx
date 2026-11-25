"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSession } from "@/lib/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getSession()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="fb-auth-loading" role="status" aria-live="polite">
        <div className="fb-auth-loading-spinner" aria-hidden />
        <p className="text-sm">Loading session…</p>
      </div>
    );
  }

  return <>{children}</>;
}
