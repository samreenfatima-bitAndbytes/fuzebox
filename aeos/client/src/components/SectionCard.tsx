import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title, kicker, action, children, className, padding = true,
}: {
  title?: ReactNode;
  kicker?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border bg-card ecl-card-shadow", className)}>
      {(title || kicker || action) && (
        <header className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between px-4 sm:px-5 pt-4 pb-3 border-b">
          <div className="min-w-0">
            {kicker && (
              <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">
                {kicker}
              </div>
            )}
            {title && <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>}
          </div>
          {action && <div className="shrink-0 w-full xl:w-auto max-w-full overflow-x-auto">{action}</div>}
        </header>
      )}
      <div className={padding ? "p-4 sm:p-5" : ""}>{children}</div>
    </section>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn(
      "text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground mb-3",
      className
    )}>{children}</div>
  );
}
