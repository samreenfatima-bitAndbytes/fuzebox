"use client";

import { AppChrome } from "@/components/AppChrome";
import { ShellProvider } from "@/components/ShellProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <AppChrome>{children}</AppChrome>
    </ShellProvider>
  );
}
