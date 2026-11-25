import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { ago } from "@/lib/format";
import { Database, Network, AlertTriangle, ShieldCheck } from "lucide-react";

type Coverage = { hyperscaler: string; surface: string; status: string;
  activatedAt?: string; lastTelemetryAt?: string; signedAt?: string; signature?: string };

export default function CoverageManifest() {
  const { data: cov } = useQuery<Coverage[]>({ queryKey: ["/api/observation/coverage"] });
  const list = cov ?? [];
  const covered = list.filter(c => c.status === "covered").length;
  const degraded = list.filter(c => c.status === "degraded").length;
  const gap = list.filter(c => c.status === "gap").length;

  const vendorMap = list.reduce<Record<string, string[]>>((acc, c) => {
    (acc[c.hyperscaler] ??= []).push(c.surface);
    return acc;
  }, {});
  const vendors = Object.entries(vendorMap);

  return (
    <Layout title="Coverage Manifest" kicker="Economic Cognition / Coverage">
      <p className="text-sm text-muted-foreground max-w-3xl mb-4 leading-relaxed">
        The coverage manifest is the contract layer between FuzeBox AEOS and every hyperscaler
        surface. Each row is signed at activation; missing signatures or stale telemetry generate
        coverage gap alerts.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard tone="primary" icon={<Database className="h-4 w-4" />}
          label="REGISTERED SURFACES" value={list.length + ""} sub={`across ${vendors.length} vendor${vendors.length !== 1 ? "s" : ""}`} />
        <KpiCard tone="green" icon={<ShieldCheck className="h-4 w-4" />}
          label="FULLY COVERED" value={covered + ""} sub="signed + active telemetry" />
        <KpiCard tone="amber" icon={<Network className="h-4 w-4" />}
          label="DEGRADED" value={degraded + ""} sub="stale signal · re-key needed" />
        <KpiCard tone="red" icon={<AlertTriangle className="h-4 w-4" />}
          label="GAPS" value={gap + ""} sub="connector not active" />
      </div>

      <SectionCard kicker="Manifest table" title="Per-surface health" padding={false}>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
            <tr><Th>Vendor</Th><Th>Surface</Th><Th>Status</Th><Th>Activated</Th><Th>Last telemetry</Th><Th>Signature</Th></tr>
          </thead>
          <tbody>
            {list.map((c, i) => {
              const tone = c.status === "covered" ? "green" : c.status === "degraded" ? "amber" : "red";
              return (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
                  <Td><Pill tone="slate">{c.hyperscaler}</Pill></Td>
                  <Td className="font-mono text-xs">{c.surface}</Td>
                  <Td>
                    <Pill tone={tone}>
                      <StatusDot tone={tone} />
                      {c.status.toUpperCase()}
                    </Pill>
                  </Td>
                  <Td className="text-xs">{ago(c.activatedAt)}</Td>
                  <Td className="text-xs">{ago(c.lastTelemetryAt)}</Td>
                  <Td className="font-mono text-[10px]">{c.signature?.slice(0, 14) ?? "—"}…</Td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">No coverage manifest yet</td></tr>
            )}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard kicker="Hyperscaler coverage map" title="Capture mechanism per vendor" className="mt-5">
        {vendors.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No coverage entries registered yet</p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {vendors.map(([hyperscaler, surfaces]) => (
              <div key={hyperscaler} className="rounded-lg border bg-card p-3">
                <div className="font-semibold text-sm mb-2">{hyperscaler}</div>
                <ul className="space-y-1">
                  {surfaces.map(s => {
                    const entry = list.find(c => c.hyperscaler === hyperscaler && c.surface === s);
                    const tone = entry?.status === "covered" ? "green" : entry?.status === "degraded" ? "amber" : "red";
                    return (
                      <li key={s} className="flex items-center gap-2 text-xs">
                        <StatusDot tone={tone} />
                        <span className="font-mono">{s}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </Layout>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="text-left px-5 py-2 font-semibold">{children}</th>; }
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-2 ${className ?? ""}`}>{children}</td>;
}
