import { AlertTriangle } from "lucide-react";

export function AuthError({ message }: { message: string }) {
  return (
    <div
      className="flex gap-2.5 rounded-none border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
      role="alert"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
