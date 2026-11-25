import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { Download, TrendingUp, FileText, BookCheck, Brain, Check, RefreshCw } from "lucide-react";
import { usd, num, pct } from "@/lib/format";
import jsPDF from "jspdf";

type Summary = {
  economics: { laborValueSavedUsd: number; amortizedCostUsd: number; netSavingsUsd: number;
    weeklyRunRateUsd: number; ropAvg: number };
  counts: { events: number; ledgerRows: number; ledgerClosed: number; agents: number;
    newRecommendations: number; coverageEntries: number; coverageGaps: number };
  quality?: { passRate: number; sigmaLevel?: number };
  latestEquations?: { cuow: number; abt: number; mer: number; ctr: number; tv: number;
    rop: number; tuop: number; huop: number; auop: number; synergyS: number; taskCount: number; } | null;
};

type AuthMe = { user: { tenantId: string; username: string } };

const REPORT_SECTIONS = [
  "Executive summary",
  "Five Equations",
  "UoP Master Equation",
  "Sigma Scores",
] as const;

function currentQuarter(): { label: string; start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3);
  const starts = [
    { label: "Q1", start: `Jan 1`, end: `Mar 31` },
    { label: "Q2", start: `Apr 1`, end: `Jun 30` },
    { label: "Q3", start: `Jul 1`, end: `Sep 30` },
    { label: "Q4", start: `Oct 1`, end: `Dec 31` },
  ];
  return {
    label: `${starts[q].label} ${y}`,
    start: `${starts[q].start}, ${y}`,
    end: `${starts[q].end}, ${y}`,
  };
}

export default function BoardReport() {
  const [isExporting, setIsExporting] = useState(false);
  const { data: s, isLoading, isError } = useQuery<Summary>({ queryKey: ["/api/dashboard/summary"] });
  const { data: auth } = useQuery<AuthMe>({ queryKey: ["/api/auth/me"] });
  const eq = s?.latestEquations;
  const ec = s?.economics;
  const tenantId = auth?.user?.tenantId ?? "—";
  const quarter = currentQuarter();
  const eventCount = s?.counts.events ?? 0;
  const hasEvents = eventCount > 0;
  const hasMetrics = !!eq || (ec?.netSavingsUsd ?? 0) !== 0 || hasEvents;
  const needsRefresh = hasEvents && !eq;
  const sigmaVal = s?.quality?.sigmaLevel ?? (eq ? Math.min(5, eq.mer * 1.2) : null);
  const ledgerPct = s?.counts.ledgerRows
    ? (s.counts.ledgerClosed / s.counts.ledgerRows) * 100
    : 0;

  function exportToPDF() {
    setIsExporting(true);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = 210;
    const L = 14;
    const R = W - L;
    const TW = R - L;

    function hexToRgb(hex: string): [number, number, number] {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [r, g, b];
    }

    function pill(
      x: number, y: number,
      label: string,
      bg: string, textColor: string,
      dotColor?: string
    ): number {
      const PAD_X = 4.5;
      const H = 5.8;
      const R_PILL = H / 2;
      pdf.setFontSize(7.5);
      const dotW = dotColor ? 2.2 + 1.5 : 0;
      const textW = pdf.getTextWidth(label);
      const pillW = PAD_X * 2 + dotW + textW;

      pdf.setFillColor(...hexToRgb(bg));
      pdf.setDrawColor(...hexToRgb(bg));
      pdf.roundedRect(x, y - R_PILL, pillW, H, R_PILL, R_PILL, "F");
      pdf.setDrawColor(0, 0, 0, 0.06);
      pdf.setLineWidth(0.15);
      pdf.roundedRect(x, y - R_PILL, pillW, H, R_PILL, R_PILL, "S");

      let tx = x + PAD_X;
      if (dotColor) {
        pdf.setFillColor(...hexToRgb(dotColor));
        pdf.circle(tx + 1, y, 1, "F");
        tx += 2.2 + 1.5;
      }
      pdf.setTextColor(...hexToRgb(textColor));
      pdf.setFont("helvetica", "bold");
      pdf.text(label, tx, y + 0.5);
      return pillW;
    }

    let cy = 18;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text("CONFIDENTIAL · FOR BOARD USE ONLY", L, cy);
    cy += 7;

    pdf.setFont("times", "bold");
    pdf.setFontSize(23);
    pdf.setTextColor(15, 23, 42);
    pdf.text("Economic Cognition · Operating Review", L, cy);
    cy += 6;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`${quarter.label}  ·  ${tenantId}  ·  Prepared by FuzeBox AEOS`, L, cy);
    cy += 6;
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.4);
    pdf.line(L, cy, R, cy);
    cy += 8;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text("EXECUTIVE SUMMARY", L, cy);
    cy += 6;

    pdf.setFont("times", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(30, 41, 59);
    const summaryText =
      `The hybrid workforce delivered a net economic surplus of ${usd(ec?.netSavingsUsd ?? 0)} ` +
      `across ${s?.counts.events ?? 0} agent decisions reconciled through the Predictive Economic ` +
      `Ledger during ${quarter.label}. Return on Potential converged at ${ec ? num(ec.ropAvg, 2) : "—"}× — ` +
      `an indicator the agent fleet is now meaningfully accretive after governance overhead. ` +
      `Total Units of Production reached ${eq ? num(eq.tuop, 1) : "—"} ` +
      `(HUoP ${eq ? num(eq.huop, 1) : "—"} · AUoP ${eq ? num(eq.auop, 1) : "—"} · ` +
      `synergy coefficient ${eq ? num(eq.synergyS, 3) : "—"}). ` +
      `Cost per Unit of Work stood at ${eq ? usd(eq.cuow) : "—"} across ` +
      `${eq?.taskCount ?? 0} tasks, with Model Efficiency Ratio at ${eq ? num(eq.mer, 2) : "—"}.`;
    const lines = pdf.splitTextToSize(summaryText, TW);
    pdf.setLineHeightFactor(1.55);
    pdf.text(lines, L, cy);
    pdf.setLineHeightFactor(1.15);
    cy += lines.length * 5.8 + 7;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text("FIVE EQUATIONS", L, cy);
    cy += 6;

    const eqRows = [
      ["CUoW · Cost / Unit of Work",        eq ? usd(eq.cuow) : "—"],
      ["ABT · Agent Break-even Threshold",   eq ? num(eq.abt, 2) : "—"],
      ["MER · Model Efficiency Ratio",       eq ? num(eq.mer, 2) : "—"],
      ["CTR · Coordination Tax Ratio",       eq ? pct(eq.ctr) : "—"],
      ["TV  · Transformation Velocity",      eq ? num(eq.tv, 1) + "/h" : "—"],
    ];
    const ROW_H = 8.5;
    eqRows.forEach(([label, val], i) => {
      const rowY = cy + i * ROW_H;
      if (i % 2 === 0) {
        pdf.setFillColor(248, 250, 252);
        pdf.rect(L, rowY - ROW_H * 0.6, TW, ROW_H, "F");
      }
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.25);
      pdf.line(L, rowY + ROW_H * 0.45, R, rowY + ROW_H * 0.45);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(100, 116, 139);
      pdf.text(label, L + 1.5, rowY);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9.5);
      pdf.setTextColor(15, 23, 42);
      pdf.text(val, R - 1.5, rowY, { align: "right" });
    });
    cy += eqRows.length * ROW_H + 7;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text("UOP MASTER EQUATION", L, cy);
    cy += 6;

    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.4);
    pdf.roundedRect(L, cy, TW, 11, 2, 2, "FD");
    pdf.setFont("courier", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(30, 41, 59);
    pdf.text("TUoP = HUoP + AUoP + (H × A × S)", L + 5, cy + 7.2);
    cy += 15;

    pdf.setFont("times", "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(55, 65, 81);
    const huopVal = eq ? num(eq.huop, 1) : "—";
    const auopVal = eq ? num(eq.auop, 1) : "—";
    const synVal  = eq ? num(eq.synergyS, 1) : "—";
    const totVal  = eq ? num(eq.tuop, 1) : "—";
    pdf.text(`HUoP `, L, cy);
    let vx = L + pdf.getTextWidth("HUoP ");
    pdf.setFont("times", "bold"); pdf.text(huopVal, vx, cy); vx += pdf.getTextWidth(huopVal);
    pdf.setFont("times", "normal"); pdf.text("  ·  AUoP ", vx, cy); vx += pdf.getTextWidth("  ·  AUoP ");
    pdf.setFont("times", "bold"); pdf.text(auopVal, vx, cy); vx += pdf.getTextWidth(auopVal);
    pdf.setFont("times", "normal"); pdf.text("  ·  Synergy ", vx, cy); vx += pdf.getTextWidth("  ·  Synergy ");
    pdf.setFont("times", "bold"); pdf.text(synVal, vx, cy); vx += pdf.getTextWidth(synVal);
    pdf.setFont("times", "normal"); pdf.text("  ·  Total ", vx, cy); vx += pdf.getTextWidth("  ·  Total ");
    pdf.setFont("times", "bold");
    pdf.setTextColor(59, 130, 246);
    pdf.text(totVal, vx, cy);
    cy += 10;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.setTextColor(148, 163, 184);
    pdf.text("SIGMA SCORES", L, cy);
    cy += 6;

    const sigmaTone = sigmaVal != null
      ? (sigmaVal >= 4 ? "green" : sigmaVal >= 3 ? "blue" : sigmaVal >= 2 ? "amber" : "red")
      : "blue";
    const PILL_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
      green: { bg: "#dcfce7", text: "#166534", dot: "#16a34a" },
      amber: { bg: "#fef3c7", text: "#92400e", dot: "#d97706" },
      red:   { bg: "#fee2e2", text: "#991b1b", dot: "#dc2626" },
      blue:  { bg: "#dbeafe", text: "#1e40af", dot: "#3b82f6" },
    };
    const sc = PILL_COLORS[sigmaTone];
    let px = L;
    const pillH_center = cy + 2.5;
    const pw0 = sigmaVal != null
      ? pill(px, pillH_center, `${sigmaVal.toFixed(1)}Σ`, sc.bg, sc.text, sc.dot)
      : 0;
    if (pw0) { px += pw0 + 3; }
    const pw1 = pill(px, pillH_center, `${s?.counts.ledgerClosed ?? 0} / ${s?.counts.ledgerRows ?? 0} ledger rows reconciled`, PILL_COLORS.blue.bg, PILL_COLORS.blue.text);
    px += pw1 + 3;
    const pw2 = pill(px, pillH_center, `${s?.counts.coverageEntries ?? 0} surfaces signed`, PILL_COLORS.green.bg, PILL_COLORS.green.text);
    px += pw2 + 3;
    pill(px, pillH_center, `${s?.counts.newRecommendations ?? 0} pending recommendations`, PILL_COLORS.amber.bg, PILL_COLORS.amber.text);
    cy += 14;

    const footerY = 282;
    pdf.setDrawColor(203, 213, 225);
    pdf.setLineWidth(0.4);
    pdf.line(L, footerY, R, footerY);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(156, 163, 175);
    pdf.text(
      `Confidential — r-Potential by FuzeBox · ${tenantId} · ${quarter.label} · Patent Family 6 / 8 · USPTO Provisional 63/898,712 · Page 1 of 1`,
      L, footerY + 4
    );

    const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeQuarter = quarter.label.replace(/\s+/g, "_");
    pdf.save(`Board_Report_${safeQuarter}_${safeTenant}.pdf`);
    setIsExporting(false);
  }

  return (
    <Layout
      title="Board Report"
      kicker="Planning / Board Report"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <FileText className="h-3 w-3" />
            {isLoading ? "Loading…" : isError ? "Unavailable" : hasMetrics ? quarter.label : "Awaiting data"}
          </Pill>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark"
            data-testid="btn-export-board"
            onClick={exportToPDF}
            disabled={isExporting || isLoading || isError}
          >
          {isExporting ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Export PDF
        </button>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Quarterly operating review for the board — live data from the Cognition Plane, Predictive
          Economic Ledger, and coverage manifest. Preview updates as metrics change; export a
          confidential PDF when ready.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">Patent Family 6 / 8</Pill>
          <Pill tone="slate">Confidential · Board use only</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load report data. Try refreshing the page or signing in again.
        </div>
      )}

      {!isError && !isLoading && !hasEvents && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          No activity recorded yet — the report will populate once agents are running. Check{" "}
          <Link href="/ecl/observation" className="text-[hsl(var(--primary))] hover:underline">Observation Plane</Link>
          {" "}for incoming events.
        </div>
      )}

      {!isError && needsRefresh && (
        <div className="rounded-none border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground mb-6 leading-relaxed">
          Activity is present but equation metrics are not computed yet. Open{" "}
          <Link href="/ecl/cognition" className="text-[hsl(var(--primary))] hover:underline">Cognition Plane</Link>
          {" "}and click <span className="font-medium text-foreground">Refresh</span> in the top bar before exporting.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard
          tone="green"
          icon={<TrendingUp className="h-4 w-4" />}
          label="NET SURPLUS"
          value={usd(ec?.netSavingsUsd ?? 0)}
          sub={`${quarter.label} run-rate`}
          footer={
            ec ? (
              <div className="text-xs text-muted-foreground">
                Weekly <span className="font-semibold text-foreground tabular-nums">{usd(ec.weeklyRunRateUsd)}</span>
              </div>
            ) : undefined
          }
        />
        <KpiCard
          tone="primary"
          icon={<Brain className="h-4 w-4" />}
          label="RoP"
          value={ec ? `${num(ec.ropAvg, 2)}×` : "—"}
          sub="Return on Potential"
          trend={
            sigmaVal != null && sigmaVal >= 3 ? (
              <span className="text-[11px] font-semibold text-[hsl(142_70%_30%)] tabular-nums">
                {sigmaVal.toFixed(1)}σ
              </span>
            ) : undefined
          }
        />
        <KpiCard
          tone="orange"
          icon={<BookCheck className="h-4 w-4" />}
          label="LEDGER CLOSED"
          value={`${s?.counts.ledgerClosed ?? 0} / ${s?.counts.ledgerRows ?? 0}`}
          sub={`${num(ledgerPct, 0)}% reconciled`}
          footer={
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{s?.counts.events ?? 0}</span> agent decisions
            </div>
          }
        />
        <KpiCard
          tone="amber"
          icon={<FileText className="h-4 w-4" />}
          label="OPEN ITEMS"
          value={String(s?.counts.newRecommendations ?? 0)}
          sub="Pending recommendations"
          footer={
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{s?.counts.coverageGaps ?? 0}</span> coverage gaps
            </div>
          }
        />
      </div>

      <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
            {hasMetrics ? "Report ready" : "Preview only"}
          </div>
          <div className="text-sm font-semibold text-foreground mt-1 break-words">
            {quarter.label} Board Update · {tenantId}
          </div>
          <div className="text-xs text-muted-foreground mt-1 break-words">
            {REPORT_SECTIONS.length} sections · PDF · {hasMetrics ? "live preview below" : "refresh metrics on Cognition Plane for full content"}
          </div>
        </div>
        <Pill tone={hasMetrics ? "green" : "slate"}>
          <StatusDot tone={hasMetrics ? "green" : "slate"} />
          {hasMetrics ? "Live data" : "Awaiting metrics"}
        </Pill>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,340px)_1fr] gap-4 sm:gap-5 items-start min-w-0">
        <SectionCard className="h-fit min-w-0" kicker="Configuration" title="Build the report">
          <dl className="text-sm space-y-4">
            <MetaRow k="Report name" v={`${quarter.label} Board Update`} />
            <MetaRow k="Date range" v={`${quarter.start} – ${quarter.end}`} />
            <MetaRow k="Tenant" v={tenantId} mono />
            <MetaRow k="Format" v={<Pill tone="slate">PDF · A4 portrait</Pill>} />
          </dl>

          <div className="mt-5 pt-4 border-t">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground mb-3">
              Included sections
            </div>
            <ul className="space-y-2">
              {REPORT_SECTIONS.map(section => (
                <li key={section} className="flex items-center gap-2 text-xs text-foreground">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-none bg-[hsl(142_72%_94%)] text-[hsl(142_70%_30%)]">
                    <Check className="h-3 w-3" />
                  </span>
                  {section}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 pt-4 border-t space-y-3">
            <div className="rounded-none border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
              Preview reflects current tenant metrics. Export generates a board-ready PDF with
              confidential footer and patent attribution.
            </div>
            <button
              type="button"
              className="aeos-btn aeos-btn-primary w-full"
              onClick={exportToPDF}
              disabled={isExporting || isLoading || isError}
              data-testid="btn-export-board-inline"
            >
              {isExporting ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Export PDF
            </button>
          </div>
        </SectionCard>

        <SectionCard
          className="min-w-0"
          kicker="Live preview"
          title={`${quarter.label} — Board Report`}
          padding={false}
          action={
            <Pill tone="slate">Print layout · Georgia serif</Pill>
          }
        >
          <div className="border-b bg-muted/20 px-3 sm:px-5 py-2 text-[11px] text-muted-foreground">
            Confidential document preview — scroll to review all sections before export
          </div>
          <div
            id="board-report-content"
            className="flex flex-col bg-white min-h-[70vh] xl:min-h-[1122px] p-6 sm:p-10 xl:p-14 overflow-x-auto"
            style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
          >
            <div className="flex-1 space-y-7 sm:space-y-9 min-w-[min(100%,520px)] w-full">
              <header className="border-b border-slate-200/80 pb-5 sm:pb-6">
                <div className="text-[9px] font-bold uppercase tracking-[.28em] text-slate-400 font-sans">
                  Confidential · For Board Use Only
                </div>
                <h2 className="text-xl sm:text-2xl xl:text-[28px] font-bold mt-2.5 tracking-tight text-slate-900 leading-tight break-words">
                  Economic Cognition · Operating Review
                </h2>
                <p className="text-[12px] sm:text-[13px] text-slate-500 mt-2 font-sans break-words">
                  {quarter.label} · {tenantId} · Prepared by FuzeBox AEOS
                </p>
              </header>

              <ReportSection title="Executive Summary">
                <p className="text-[13px] sm:text-[14px] leading-[1.75] sm:leading-[1.85] text-slate-700 break-words">
                  The hybrid workforce delivered a net economic surplus of{" "}
                  <strong className="text-slate-900">{usd(ec?.netSavingsUsd ?? 0)}</strong> across{" "}
                  <strong className="text-slate-900">{s?.counts.events ?? 0}</strong> agent decisions reconciled through the
                  Predictive Economic Ledger during <strong className="text-slate-900">{quarter.label}</strong>.
                  Return on Potential converged at <strong className="text-slate-900">{ec ? num(ec.ropAvg, 2) : "—"}×</strong>
                  {" "}— an indicator the agent fleet is now meaningfully accretive after governance overhead.
                  Total Units of Production reached <strong className="text-slate-900">{eq ? usd(eq.tuop, { decimals: 0 }) : "—"}</strong>{" "}
                  (HUoP <strong className="text-slate-900">{eq ? usd(eq.huop, { decimals: 0 }) : "—"}</strong> ·
                  AUoP <strong className="text-slate-900">{eq ? usd(eq.auop, { decimals: 0 }) : "—"}</strong> ·
                  synergy coefficient <strong className="text-slate-900">{eq ? num(eq.synergyS, 3) : "—"}</strong>).
                  Cost per Unit of Work stood at <strong className="text-slate-900">{eq ? usd(eq.cuow) : "—"}</strong> across{" "}
                  <strong className="text-slate-900">{eq?.taskCount ?? 0}</strong> tasks, with Model Efficiency Ratio at{" "}
                  <strong className="text-slate-900">{eq ? num(eq.mer, 2) : "—"}</strong>.
                </p>
              </ReportSection>

              <ReportSection title="Five Equations">
                <div className="overflow-x-auto -mx-1">
                <table className="w-full text-[12px] sm:text-[13.5px] min-w-[18rem]">
                  <tbody>
                    <Tr k="CUoW · Cost / Unit of Work"       v={eq ? usd(eq.cuow) : "—"} />
                    <Tr k="ABT · Agent Break-even Threshold" v={eq ? num(eq.abt, 2) : "—"} />
                    <Tr k="MER · Model Efficiency Ratio"     v={eq ? num(eq.mer, 2) : "—"} />
                    <Tr k="CTR · Coordination Tax Ratio"     v={eq ? pct(eq.ctr) : "—"} />
                    <Tr k="TV  · Transformation Velocity"    v={eq ? num(eq.tv, 1) + "/h" : "—"} />
                  </tbody>
                </table>
                </div>
              </ReportSection>

              <ReportSection title="UoP Master Equation">
                <div className="text-[13.5px] text-slate-800">
                  <div className="flex items-center min-h-[52px] px-3 sm:px-5 rounded-none border border-slate-200 bg-slate-50 font-mono font-semibold tracking-wide text-slate-800 text-[11px] sm:text-[13px] break-all">
                    TUoP = HUoP + AUoP + (H × A × S)
                  </div>
                  <p className="mt-3.5 leading-loose text-slate-600 break-words text-[12px] sm:text-[13.5px]">
                    HUoP <strong className="tabular-nums text-slate-900">{eq ? num(eq.huop, 1) : "—"}</strong>
                    {" · "}
                    AUoP <strong className="tabular-nums text-slate-900">{eq ? num(eq.auop, 1) : "—"}</strong>
                    {" · "}
                    Synergy <strong className="tabular-nums text-slate-900">{eq ? num(eq.synergyS, 1) : "—"}</strong>
                    {" · "}
                    Total <strong className="tabular-nums text-[hsl(222_47%_11%)]">{eq ? num(eq.tuop, 1) : "—"}</strong>
                  </p>
                </div>
              </ReportSection>

              <ReportSection title="Sigma Scores">
                <div className="flex items-center flex-wrap gap-2 font-sans">
                  {sigmaVal != null ? <ReportSigma value={sigmaVal} /> : (
                    <Pill tone="slate">Quality σ unavailable — refresh on Cognition Plane</Pill>
                  )}
                  <Pill tone="blue">{s?.counts.ledgerClosed ?? 0} / {s?.counts.ledgerRows ?? 0} ledger reconciled</Pill>
                  <Pill tone="green">{s?.counts.coverageEntries ?? 0} surfaces signed</Pill>
                  <Pill tone="amber">{s?.counts.newRecommendations ?? 0} pending recommendations</Pill>
                </div>
              </ReportSection>
            </div>

            <footer className="pt-5 border-t border-slate-200/80 mt-8 sm:mt-10 text-[8px] sm:text-[9px] text-slate-400 font-sans tracking-widest uppercase break-words leading-relaxed">
              Confidential — r-Potential by FuzeBox · {tenantId} · {quarter.label} · Patent Family 6 / 8 · USPTO Provisional 63/898,712 · Page 1 of 1
            </footer>
          </div>
        </SectionCard>
      </div>
    </Layout>
  );
}

function MetaRow({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-[.16em] text-muted-foreground font-semibold">{k}</dt>
      <dd className={`font-medium mt-0.5 break-words ${mono ? "font-mono text-xs break-all" : ""}`}>{v}</dd>
    </div>
  );
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-sans">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Tr({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr className="border-b border-slate-200/80 last:border-0 odd:bg-slate-50/60">
      <td className="py-3 sm:py-3.5 pl-2 pr-2 sm:pr-3 text-slate-500 font-sans align-top">{k}</td>
      <td className="py-3 sm:py-3.5 pr-2 font-semibold tabular-nums text-right text-slate-900 whitespace-nowrap align-top">{v}</td>
    </tr>
  );
}

function ReportSigma({ value }: { value: number }) {
  const tone = value >= 4.0 ? "green" : value >= 3.0 ? "blue" : value >= 2.0 ? "amber" : "red";
  return (
    <Pill tone={tone}>
      <StatusDot tone={tone} />
      <span className="tabular-nums">{value.toFixed(1)}σ</span>
    </Pill>
  );
}
