import { getApiUrl } from "./auth";

export const DEPLOYMENT_HEALTH_POLL_MS = 30_000;

export type DeploymentHealthPayload = {
  status: string;
  active_agents: number;
  active_scenarios?: number;
  timestamp?: string;
};

export function defaultDeploymentHealthUrl(): string {
  return `${getApiUrl().replace(/\/$/, "")}/health`;
}

export function normalizeHealthUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

export async function fetchDeploymentHealth(
  url: string,
): Promise<DeploymentHealthPayload> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Health check failed (${res.status})`);
  }
  const data = (await res.json()) as Partial<DeploymentHealthPayload>;
  if (!data || typeof data.status !== "string") {
    throw new Error("Invalid health response — expected { status, active_agents }");
  }
  return {
    status: data.status,
    active_agents: Number(data.active_agents ?? 0),
    active_scenarios:
      data.active_scenarios != null ? Number(data.active_scenarios) : undefined,
    timestamp: data.timestamp,
  };
}
