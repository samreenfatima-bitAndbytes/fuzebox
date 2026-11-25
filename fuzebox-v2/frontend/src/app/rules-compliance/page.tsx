"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RulesComplianceDashboard } from "@/components/GovernanceViews";
import { Alert } from "@/components/ui/Alert";
import { PageChip } from "@/components/ui/PageChip";
import { PageLoading } from "@/components/ui/PageLoading";
import { PageToolbar } from "@/components/ui/PageToolbar";
import { useAppRefresh } from "@/hooks/useAppRefresh";
import { ApiError } from "@/lib/api";
import { loadRulesComplianceData } from "@/lib/governance-pages";
import type {
  GovernanceRuleRow,
  GovernanceViolationRow,
} from "@/lib/types";

/** Flip to true when the rules & compliance toolbar should be visible again. */
const SHOW_PAGE_TOOLBAR = false;

export default function RulesCompliancePage() {
  const [rules, setRules] = useState<GovernanceRuleRow[]>([]);
  const [violations, setViolations] = useState<GovernanceViolationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const data = await loadRulesComplianceData();
      if (seq !== loadSeq.current) return;
      setRules(data.rules);
      setViolations(data.violations);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(
        err instanceof ApiError
          ? err.message
          : "Failed to load rules and compliance",
      );
    } finally {
      if (seq !== loadSeq.current) return;
      setLoading(false);
    }
  }, []);

  const hasData = rules.length > 0 || violations.length > 0;

  useAppRefresh(load);

  return (
    <AppShell
      title="Rules & Compliance"
      subtitle="The policy library backing every governance decision. Each rule is signed and chained alongside the decisions it gated — required evidence for ISO/IEC 42001 and EU AI Act audits."
    >
      <nav className="mb-3 text-sm text-brand-muted" aria-label="Breadcrumb">
        <Link href="/unreviewed-decisions" className="hover:text-brand-primary">
          Governance
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-brand-ink">Rules & Compliance</span>
      </nav>

      {SHOW_PAGE_TOOLBAR ? (
        <PageToolbar>
          <PageChip variant="muted">
            {rules.length} rules · {violations.length} violations
            {loading && hasData ? " · refreshing…" : ""}
          </PageChip>
        </PageToolbar>
      ) : null}

      {loading && !hasData ? (
        <PageLoading message="Loading rules and compliance…" />
      ) : null}

      {error ? (
        <Alert variant="error" role="alert">
          {error}
        </Alert>
      ) : null}

      {hasData || !loading ? (
        <RulesComplianceDashboard
          rules={rules}
          violations={violations}
          onReload={load}
        />
      ) : null}
    </AppShell>
  );
}
