import type { InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthFormField({
  id,
  label,
  hint,
  prefix,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  prefix?: string;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id} className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">
        {label}
      </Label>
      {prefix ? (
        <div className="mt-1.5 flex overflow-hidden rounded-none border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <span className="flex items-center border-r border-input bg-muted/50 px-3 text-xs text-muted-foreground shrink-0">
            {prefix}
          </span>
          <Input
            id={id}
            className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
            {...props}
          />
        </div>
      ) : (
        <Input id={id} className="mt-1.5 rounded-none" {...props} />
      )}
      {hint ? (
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{hint}</p>
      ) : null}
    </div>
  );
}
