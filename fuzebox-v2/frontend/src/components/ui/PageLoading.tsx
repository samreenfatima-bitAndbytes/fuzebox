export function PageLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="fb-page-loading" role="status" aria-live="polite">
      <span className="fb-page-loading-spinner" aria-hidden />
      <span className="text-sm text-brand-muted">{message}</span>
    </div>
  );
}
