"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentForm } from "@/components/AgentForm";
import { AppShell } from "@/components/AppShell";
import { TalkingPoints } from "@/components/TalkingPoints";
import { Alert } from "@/components/ui/Alert";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { createAgent } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { useShell } from "@/components/ShellProvider";

export default function NewAgentPage() {
  const router = useRouter();
  const { showToast } = useShell();
  const session = getSession();
  const canWrite = session?.role !== "readonly";

  return (
    <AppShell
      title="Create agent"
      subtitle="Register a new agent in the database."
    >
      <TalkingPoints
        title="Before you save"
        bullets={[
          "Pick a clear name and group — Tasks and scorecards filter by group.",
          "Model and per-1K token rates feed Economics and scenario cost previews.",
          "Skills and permissions apply when this agent is assigned in the pipeline.",
        ]}
      />

      <PageToolbar>
        <Link href="/agents" className="fb-btn">
          ← Back to registry
        </Link>
      </PageToolbar>

      {!canWrite && (
        <Alert variant="warn" className="mb-6" role="alert">
          Your account is read-only. Contact an admin to create agents.
        </Alert>
      )}

      <AgentForm
        mode="create"
        canWrite={canWrite}
        onSubmit={async (values) => {
          const agent = await createAgent(values);
          showToast(`Agent “${agent.name}” created.`);
          router.push("/agents");
        }}
        onCancel={() => router.push("/agents")}
      />
    </AppShell>
  );
}
