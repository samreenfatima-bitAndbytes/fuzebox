/** Routes where the shell shows the header Generate request action. */
const GENERATE_REQUEST_ROUTES = [
  "/overview",
  "/live-monitor",
  "/run-review",
  "/scenario-builder",
  "/quality",
  "/tasks",
  "/performance",
  "/v2-mission-control",
] as const;

export const OPEN_GENERATE_REQUEST_EVENT = "fuzebox:open-generate-request";

export function pathShowsGenerateRequest(pathname: string): boolean {
  return GENERATE_REQUEST_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function openGenerateRequest(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_GENERATE_REQUEST_EVENT));
}
