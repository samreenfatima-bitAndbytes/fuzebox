"use client";

import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ApiDocsContent } from "@/components/ApiDocsViews";

export default function ApiDocsPage() {
  return (
    <AppShell title="API Docs" subtitle="Ingestion API reference for Workforce integrations.">
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/api-keys" className="hover:text-brand-primary">
          API Keys
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">API Docs</span>
      </nav>

      <div className="mb-4 flex justify-end">
        <Link href="/api-keys" className="fb-btn text-sm">
          ← Back to API Keys
        </Link>
      </div>

      <ApiDocsContent />
    </AppShell>
  );
}
