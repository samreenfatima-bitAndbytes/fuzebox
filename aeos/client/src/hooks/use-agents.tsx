import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export type AgentTrustStage = {
  signal: "eligible_promotion" | "demotion_risk" | "cooldown" | "stable" | "max_tier";
  signalLabel: string;
  nextTier: string | null;
  prevTier: string | null;
  tierIndex: number;
  cooldownDaysLeft: number | null;
  lastTierChange: {
    outcome: "promoted" | "demoted";
    from: string;
    to: string;
    at: string;
  } | null;
  gates: {
    tenureOk: boolean;
    passRateOk: boolean;
    stabilityOk: boolean;
    noBlocksOk: boolean;
    enoughRuns: boolean;
  };
  passRate: number | null;
  blockedCount: number;
};

export type EnrichedAgent = {
  id: number;
  agentId: string;
  name: string;
  model: string | null;
  runs: number;
  avgWallMs: string | null;
  cuow: number | null;
  mer: number | null;
  abt: number;
  ctr: number;
  tv: number;
  sigma: number;
  costPerRun: number;
  success: number;
  p95Latency: number;
  workflowId?: string | null;
  tenantId?: string;
  status?: string;
  hyperscaler?: string;
  trustTier?: string;
  vendor?: string | null;
  createdAt?: string;
  tierUpdatedAt?: string | null;
  trustStage?: AgentTrustStage | null;
};

export function useAgents() {
  return useQuery<EnrichedAgent[]>({
    queryKey: ["/api/agents"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agents");
      return res.json();
    },
  });
}
