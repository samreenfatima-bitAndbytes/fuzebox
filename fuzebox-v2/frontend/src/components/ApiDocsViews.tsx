"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { ChartPanel } from "@/components/ui/ChartPanel";
import { getApiUrl } from "@/lib/auth";
import { copyTextToClipboard } from "@/lib/clipboard";

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<number | null>(null);

  const copy = async () => {
    const ok = await copyTextToClipboard(code);
    if (!ok) return;
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    setCopied(true);
    copyResetTimer.current = window.setTimeout(() => {
      setCopied(false);
      copyResetTimer.current = null;
    }, 2000);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-brand-border bg-brand-surface">
      <div className="flex items-center justify-between gap-3 border-b border-brand-border bg-brand-surface/80 px-4 py-2.5">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
          {title}
        </div>
        <button
          type="button"
          className="fb-btn min-w-[4.75rem] text-xs"
          onClick={copy}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-brand-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function ApiDocsContent() {
  const apiBase = getApiUrl();

  const ingestCurl = useMemo(
    () =>
      [
        `curl -X POST "${apiBase}/api/observation/ingest" \\`,
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
      ].join("\n"),
    [apiBase],
  );

  const canonicalCurl = useMemo(
    () =>
      [
        `curl -X POST "${apiBase}/api/observation/ingest/canonical" \\`,
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
      ].join("\n"),
    [apiBase],
  );

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-brand-muted">
        This page documents the ingestion API your systems call to send
        telemetry into r‑Potential. Authentication is via a per‑tenant API key
        (see{" "}
        <Link href="/api-keys" className="text-brand-primary hover:underline">
          API Keys
        </Link>
        ).
      </p>

      <h2 className="text-sm font-semibold text-brand-ink">Quickstart</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="fb-card-accent-top p-4 sm:p-5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
            Auth
          </p>
          <h3 className="fb-section-title text-sm">Authorization header</h3>
          <div className="mt-3 space-y-2 text-sm text-brand-ink">
            <p>
              Send your key as{" "}
              <span className="rounded bg-brand-surface px-1.5 py-0.5 font-mono text-xs">
                Authorization: Bearer &lt;api_key&gt;
              </span>
              .
            </p>
            <p className="text-brand-muted">
              Keys are stored hashed server‑side; the raw key is only shown once
              when generated.
            </p>
          </div>
        </div>

        <div className="fb-card-accent-top p-4 sm:p-5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
            Base URL
          </p>
          <h3 className="fb-section-title text-sm">Webhook API service</h3>
          <div className="mt-3 space-y-2 text-sm text-brand-ink">
            <p>
              Ingestion requests are sent to the Fuzebox webhook API base URL:
            </p>
            <div className="break-all rounded-lg border border-brand-border bg-brand-surface px-2 py-1.5 font-mono text-xs">
              {apiBase}
            </div>
            <p className="text-xs text-brand-muted">
              API paths begin with{" "}
              <span className="font-mono">/api/…</span>. Configure the base via{" "}
              <span className="font-mono">NEXT_PUBLIC_API_URL</span> in the
              frontend.
            </p>
          </div>
        </div>
      </div>

      <h2 className="text-sm font-semibold text-brand-ink">
        Ingestion endpoints
      </h2>
      <div className="space-y-6">
        <ChartPanel
          kicker="Observation Plane"
          title="POST /api/observation/ingest"
          action={
            <a
              className="inline-flex items-center gap-1 text-xs text-brand-muted hover:text-brand-ink"
              href="https://curl.se/docs/manpage.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              curl reference ↗
            </a>
          }
        >
          <div className="space-y-3 text-sm">
            <p className="text-brand-muted">
              Flexible ingest endpoint that accepts vendor-native payloads in{" "}
              <span className="font-mono">raw</span> plus a normalized execution
              context in <span className="font-mono">ctx</span>. The server maps
              the event into the canonical schema and writes the PEL row.
            </p>
            <CodeBlock title="curl example" code={ingestCurl} />
            <p className="text-xs text-brand-muted">
              Returns a JSON payload containing the persisted canonical event +
              the associated ledger row.
            </p>
          </div>
        </ChartPanel>

        <ChartPanel
          kicker="Observation Plane"
          title="POST /api/observation/ingest/canonical"
        >
          <div className="space-y-3 text-sm">
            <p className="text-brand-muted">
              Direct canonical ingestion (best for orchestrators that already
              construct canonical events). The server verifies{" "}
              <span className="font-mono">auditHash</span> before persisting.
            </p>
            <div className="rounded-lg border border-brand-border bg-brand-surface/60 p-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-muted">
                auditHash verification
              </p>
              <p className="leading-relaxed text-brand-muted">
                The server recomputes:
              </p>
              <div className="mt-2 whitespace-pre-wrap font-mono text-xs text-brand-ink">
                HMAC_SHA256(secret, (prevEventHash || &quot;null&quot;) +
                JSON.stringify(payload_without_auditHash))
              </div>
              <p className="mt-2 text-brand-muted">
                The secret is{" "}
                <span className="font-mono">ECL_SECRET_KEY</span> in production.
              </p>
            </div>
            <CodeBlock title="curl example" code={canonicalCurl} />
            <p className="text-xs text-brand-muted">
              Returns:{" "}
              <span className="font-mono">
                {`{ "eventId": "...", "decisionId": "..." }`}
              </span>
            </p>
          </div>
        </ChartPanel>
      </div>

      <h2 className="text-sm font-semibold text-brand-ink">Common responses</h2>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartPanel kicker="HTTP 401" title="Invalid or missing API key">
          <CodeBlock
            title="response"
            code={`{ "error": "Invalid or missing API key" }`}
          />
        </ChartPanel>
        <ChartPanel kicker="HTTP 400" title="Invalid payload (canonical ingest)">
          <CodeBlock
            title="response"
            code={`{ "error": "Invalid payload", "details": { "fieldErrors": { /* ... */ } } }`}
          />
        </ChartPanel>
      </div>
    </div>
  );
}
