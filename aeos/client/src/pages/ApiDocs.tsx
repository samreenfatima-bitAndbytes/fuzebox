import { useMemo } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill, StatusDot } from "@/components/Pill";
import { useToast } from "@/hooks/use-toast";
import {
  Copy, ExternalLink, KeyRound, FileText,
  Activity, ShieldCheck, Radio,
} from "lucide-react";

function CodeBlock({ title, code }: { title: string; code: string }) {
  const { toast } = useToast();

  return (
    <div className="rounded-none border bg-muted/20 overflow-hidden min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-4 py-2.5 border-b bg-card/40">
        <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground truncate min-w-0">
          {title}
        </div>
        <button
          type="button"
          className="aeos-btn aeos-btn-secondary aeos-btn--sm w-full sm:w-auto shrink-0"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              toast({ title: "Copied", description: "Snippet copied to clipboard." });
            } catch {
              toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
            }
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy
        </button>
      </div>
      <pre className="p-3 sm:p-4 text-[10px] sm:text-xs leading-relaxed overflow-x-auto max-w-full">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function ApiDocs() {
  const origin = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.origin;
  }, []);

  const ingestCurl = useMemo(() => {
    return [
      `curl -X POST "${origin}/api/observation/ingest" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "Authorization: Bearer <YOUR_API_KEY>" \\`,
      `  -d '{
    "hyperscaler": "openai",
    "raw": {
      "id": "vendor_req_123",
      "model": "gpt-4.1",
      "usage": { "input_tokens": 1200, "output_tokens": 420 }
    },
    "ctx": {
      "workspaceId": "ws_001",
      "agentId": "agt_support_triage",
      "workflowId": "wf_support_v1",
      "skill": "ticket-triage",
      "trigger": "webhook",
      "capturedVia": "proxy",
      "humanBaselineMinutes": 6.5,
      "manualHourlyCostUsd": 65,
      "costCenter": "CC_SUPPORT"
    },
    "qualityConfidence": 0.86,
    "reworkMinutes": 0.25
  }'`,
    ].join("\n");
  }, [origin]);

  const canonicalCurl = useMemo(() => {
    return [
      `curl -X POST "${origin}/api/observation/ingest/canonical" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -H "Authorization: Bearer <YOUR_API_KEY>" \\`,
      `  -d '{
    "eventId": "01J0C6Q2R6G7T3D6P0Y8QK5Z9M",
    "schemaVersion": "fbx-canonical-v1.0",
    "capturedAt": "2026-05-05T13:37:42.123Z",
    "tenantId": "will_be_overridden_server_side",
    "workspaceId": "ws_001",
    "decisionId": "OBS-000000123",
    "hyperscaler": "openai",
    "endpoint": "/v1/responses",
    "transport": "https",
    "capturedVia": "proxy",
    "agentId": "agt_support_triage",
    "agentKind": "llm_call",
    "model": "gpt-4.1",
    "workflowId": "wf_support_v1",
    "skill": "ticket-triage",
    "trigger": "webhook",
    "inputTokens": 1200,
    "outputTokens": 420,
    "wallMs": 1320,
    "vendorCostUsd": 0.048,
    "amortizedCostUsd": 0.055,
    "passedThresholds": true,
    "confidence": 0.86,
    "humanReview": "auto",
    "reworkMinutes": 0.25,
    "laborValueSavedUsd": 8.5,
    "policyOutcome": "logged_only",
    "trustTier": "T1_observed",
    "prevEventHash": null,
    "auditHash": "<HMAC_SHA256_HEX>"
  }'`,
    ].join("\n");
  }, [origin]);

  const authHeader = `Authorization: Bearer <YOUR_API_KEY>`;

  return (
    <Layout
      title="API Docs"
      kicker="Governance / API Docs"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <Activity className="h-3 w-3" />
            2 endpoints
          </Pill>
          <Link href="/governance/api-keys" className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark">
            <KeyRound className="h-3.5 w-3.5" />
            Manage keys
          </Link>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Ingestion API for sending telemetry into r-Potential. Authenticate with a per-tenant API key;
          events land on the Predictive Ledger and feed governance rules, audit trail, and certification evidence.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">Observation Plane</Pill>
          <Pill tone="slate">Bearer auth</Pill>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          label="ENDPOINTS"
          value="2"
          sub="Raw + canonical ingest"
          tone="primary"
          icon={<Radio className="h-4 w-4" />}
        />
        <KpiCard
          label="AUTH"
          value="Bearer"
          sub="Per-tenant API key"
          tone="primary"
          icon={<KeyRound className="h-4 w-4" />}
        />
        <KpiCard
          label="BASE URL"
          value="Same origin"
          sub="UI and API share host"
          tone="green"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <KpiCard
          label="SCHEMA"
          value="v1.0"
          sub="fbx-canonical-v1.0"
          tone="slate"
          icon={<FileText className="h-4 w-4" />}
        />
      </div>

      <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
            Quick reference
          </div>
          <div className="text-xs sm:text-sm font-semibold text-foreground mt-1 font-mono break-all">
            {origin || "<your-domain>"}/api/observation/ingest
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Keys hashed server-side · tenantId overridden on canonical ingest · auditHash verified before persist
          </div>
        </div>
        <Pill tone="green">
          <StatusDot tone="green" />
          Ready to integrate
        </Pill>
      </div>

      <div className="grid gap-4 sm:gap-5 grid-cols-1 xl:grid-cols-2 mb-6 min-w-0">
        <SectionCard className="min-w-0" kicker="Authentication" title="Authorization header">
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground leading-relaxed">
              Send your key on every request. Generate keys on the API Keys page — the raw value is shown once.
            </p>
            <CodeBlock title="header" code={authHeader} />
          </div>
        </SectionCard>

        <SectionCard className="min-w-0" kicker="Base URL" title="Same origin as the UI">
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground leading-relaxed">
              When using the hosted UI, the API is served from the same base. Hash-routing in iframes does not affect API paths.
            </p>
            <div className="font-mono rounded-none border bg-muted/30 px-3 py-2 text-xs break-all">
              {origin || "<your-domain>"}
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        className="mb-4 min-w-0"
        kicker="Observation Plane"
        title="POST /api/observation/ingest"
        action={
          <a
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            href="https://curl.se/docs/manpage.html"
            target="_blank"
            rel="noreferrer"
          >
            curl reference <ExternalLink className="h-3.5 w-3.5" />
          </a>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            Flexible ingest that accepts vendor-native payloads in <span className="font-mono">raw</span> plus a normalized
            execution context in <span className="font-mono">ctx</span>. The server maps the event into the canonical schema
            and writes the PEL row.
          </p>
          <CodeBlock title="curl example" code={ingestCurl} />
          <p className="text-xs text-muted-foreground">
            Returns JSON with the persisted canonical event and associated ledger row.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        className="mb-6 min-w-0"
        kicker="Observation Plane"
        title="POST /api/observation/ingest/canonical"
      >
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            Direct canonical ingestion for orchestrators that already construct canonical events. The server verifies{" "}
            <span className="font-mono">auditHash</span> before persisting.
          </p>
          <div className="rounded-none border bg-muted/20 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground mb-2">
              auditHash verification
            </div>
            <div className="text-muted-foreground leading-relaxed">
              The server recomputes:
              <div className="mt-2 font-mono text-[10px] sm:text-xs whitespace-pre-wrap break-all">
                HMAC_SHA256(secret, (prevEventHash || "null") + JSON.stringify(payload_without_auditHash))
              </div>
              <div className="mt-2">
                Production secret: <span className="font-mono">ECL_SECRET_KEY</span>
              </div>
            </div>
          </div>
          <CodeBlock title="curl example" code={canonicalCurl} />
          <p className="text-xs text-muted-foreground">
            Returns: <span className="font-mono">{`{ "eventId": "...", "decisionId": "..." }`}</span>
          </p>
        </div>
      </SectionCard>

      <div className="grid gap-4 sm:gap-5 grid-cols-1 xl:grid-cols-2 mb-6 min-w-0">
        <SectionCard className="min-w-0" kicker="HTTP 401" title="Invalid or missing API key">
          <CodeBlock title="response" code={`{ "error": "Invalid or missing API key" }`} />
        </SectionCard>
        <SectionCard className="min-w-0" kicker="HTTP 400" title="Invalid payload (canonical ingest)">
          <CodeBlock
            title="response"
            code={`{ "error": "Invalid payload", "details": { "fieldErrors": { /* ... */ } } }`}
          />
        </SectionCard>
      </div>
    </Layout>
  );
}
