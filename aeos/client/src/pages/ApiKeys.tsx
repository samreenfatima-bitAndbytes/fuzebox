import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill, StatusDot } from "@/components/Pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ago, num } from "@/lib/format";
import { useListSelection } from "@/hooks/use-list-selection";
import {
  Copy, KeyRound, ShieldAlert, Trash2, FileText,
  Activity, Search, CheckCircle2,
} from "lucide-react";

type ApiKeyRow = {
  id: number;
  label: string;
  createdAt: string | Date;
  revokedAt: string | Date | null;
};

type CreateApiKeyResponse = {
  key: string;
  label: string;
  tenantId: string;
};

type StatusFilter = "all" | "active" | "revoked";

function asIso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.toISOString();
}

export default function ApiKeys() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useQuery<ApiKeyRow[]>({
    queryKey: ["/api/admin/api-keys"],
  });

  const keys = data ?? [];

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");

  const create = useMutation({
    mutationFn: (body: { label: string }) => apiRequest("POST", "/api/admin/api-keys", body),
    onSuccess: async (r) => {
      const payload = (await (r as Response).json()) as CreateApiKeyResponse;
      setCreated(payload);
      qc.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      toast({ title: "API key generated", description: `Created “${payload.label}” for this tenant.` });
    },
    onError: (e: unknown) => {
      toast({
        title: "Failed to generate key",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/api-keys/${id}`),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      toast({ title: "API key revoked", description: "The key is now inactive." });
    },
    onError: (e: unknown) => {
      toast({
        title: "Failed to revoke key",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const sorted = useMemo(() => {
    return [...keys].sort((a, b) => {
      const ta = Date.parse(asIso(a.createdAt) ?? "") || 0;
      const tb = Date.parse(asIso(b.createdAt) ?? "") || 0;
      return tb - ta;
    });
  }, [keys]);

  const activeCount = sorted.filter(k => !k.revokedAt).length;
  const revokedCount = sorted.filter(k => !!k.revokedAt).length;

  const list = useMemo(() => sorted.filter(k => {
    if (statusFilter === "active" && k.revokedAt) return false;
    if (statusFilter === "revoked" && !k.revokedAt) return false;
    if (!q.trim()) return true;
    return k.label.toLowerCase().includes(q.toLowerCase());
  }), [sorted, statusFilter, q]);

  const { selected: active, select: selectKey, id: activeKeyId } = useListSelection(
    list,
    (k) => k.id,
  );

  function resetDialog() {
    setLabel("");
    setCreated(null);
  }

  async function copyKey(rawKey: string) {
    try {
      await navigator.clipboard.writeText(rawKey);
      toast({ title: "Copied", description: "API key copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  }

  const overallTone = activeCount === 0 && sorted.length > 0 ? "red" : activeCount > 0 ? "green" : "slate";

  return (
    <Layout
      title="API Keys"
      kicker="Governance / API Keys"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/governance/api-docs" className="aeos-btn aeos-btn--topbar aeos-btn-secondary-on-dark">
            <FileText className="h-3.5 w-3.5" />
            API Docs
          </Link>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark"
            onClick={() => {
              resetDialog();
              setOpen(true);
            }}
            data-testid="btn-generate-api-key"
          >
            <KeyRound className="h-4 w-4" />
            Generate key
          </button>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          Manage tenant-scoped Workforce integration keys. Keys authenticate observation-plane ingest
          and governance rule checks — stored hashed server-side; the raw value is shown once at creation.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">Bearer auth</Pill>
          <Pill tone="slate">Tenant-scoped</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load API keys. Try refreshing the page or signing in again.
        </div>
      )}

      {!isError && (
        <>
          <div className="aeos-audit-alert mb-6 flex-wrap">
            <ShieldAlert className="h-5 w-5 text-[hsl(38_90%_38%)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[hsl(28_90%_28%)]">Store keys securely</div>
              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Raw keys are only displayed once after generation. Revoke compromised keys immediately — they cannot be restored.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <KpiCard
              label="TOTAL KEYS"
              value={isLoading ? "—" : num(sorted.length, 0)}
              sub="All time for this tenant"
              tone="primary"
              icon={<KeyRound className="h-4 w-4" />}
            />
            <KpiCard
              label="ACTIVE"
              value={isLoading ? "—" : num(activeCount, 0)}
              sub="Currently valid for ingest"
              tone={activeCount > 0 ? "green" : "slate"}
              icon={<CheckCircle2 className="h-4 w-4" />}
            />
            <KpiCard
              label="REVOKED"
              value={isLoading ? "—" : num(revokedCount, 0)}
              sub="Permanently disabled"
              tone={revokedCount > 0 ? "amber" : "slate"}
              icon={<Trash2 className="h-4 w-4" />}
            />
            <KpiCard
              label="ENDPOINTS"
              value="2"
              sub="Raw + canonical ingest"
              tone="primary"
              icon={<FileText className="h-4 w-4" />}
            />
          </div>

          {!isLoading && (
            <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">
                  Integration posture
                </div>
                <div className="text-sm font-semibold text-foreground mt-1 break-words">
                  {activeCount} active · {revokedCount} revoked · Bearer token on all ingest calls
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  See API Docs for curl examples and auditHash verification
                </div>
              </div>
              <Pill tone={overallTone}>
                <StatusDot tone={overallTone} />
                {activeCount > 0 ? "Ready to ingest" : sorted.length > 0 ? "No active keys" : "No keys yet"}
              </Pill>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start mb-6 min-w-0">
            <SectionCard
              className="min-w-0"
              kicker="Tenant keys"
              title={`${list.length} key${list.length === 1 ? "" : "s"}`}
              padding={false}
              action={
                <div className="aeos-content-segment" role="tablist" aria-label="Status filter">
                  {([
                    ["all", "All", sorted.length],
                    ["active", "Active", activeCount],
                    ["revoked", "Revoked", revokedCount],
                  ] as const).map(([id, label, count]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      onClick={() => setStatusFilter(id)}
                      className="aeos-content-segment-btn"
                      data-active={statusFilter === id ? "true" : "false"}
                      aria-selected={statusFilter === id}
                    >
                      {label}
                      <span className="ml-1 tabular-nums opacity-70">({count})</span>
                    </button>
                  ))}
                </div>
              }
            >
              <div className="px-3 sm:px-5 py-3 border-b">
                <label className="aeos-filter-search w-full max-w-none sm:max-w-sm">
                  <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Search by label…"
                  />
                </label>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[24rem] xl:min-w-0">
                  <thead className="bg-muted/30 text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b">
                    <tr>
                      <Th>Label</Th>
                      <Th>Created</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(k => {
                      const revoked = !!k.revokedAt;
                      const tone = revoked ? "red" : "green";
                      return (
                        <tr
                          key={k.id}
                          className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${
                            activeKeyId === k.id ? "bg-primary/5" : ""
                          } border-l-2 ${revoked ? "border-l-[hsl(0_72%_52%)]" : "border-l-[hsl(142_70%_42%)]"}`}
                          onClick={() => selectKey(k)}
                          data-testid={`row-key-${k.id}`}
                        >
                          <Td className="font-medium max-w-[10rem] sm:max-w-none truncate" title={k.label}>{k.label}</Td>
                          <Td mono>{ago(asIso(k.createdAt) ?? "")}</Td>
                          <Td>
                            <Pill tone={tone} className="gap-1.5">
                              <StatusDot tone={tone} />
                              {revoked ? "Revoked" : "Active"}
                            </Pill>
                          </Td>
                        </tr>
                      );
                    })}
                    {!isLoading && list.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-5 py-12 text-center text-muted-foreground">
                          {sorted.length === 0
                            ? "No API keys yet. Generate one to connect Workforce."
                            : "No keys match this filter."}
                        </td>
                      </tr>
                    )}
                    {isLoading && (
                      <tr>
                        <td colSpan={3} className="px-5 py-12 text-center text-muted-foreground">
                          Loading keys…
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard className="h-fit min-w-0" kicker="Key detail" title={active ? active.label : "Select a key"}>
              {!active ? (
                <p className="text-sm text-muted-foreground">
                  Click any row to view metadata or revoke an active key.
                </p>
              ) : (
                <KeyDetail
                  keyRow={active}
                  onRevoke={() => revoke.mutate(active.id)}
                  revoking={revoke.isPending}
                />
              )}
            </SectionCard>
          </div>
        </>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetDialog();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Generate API key</DialogTitle>
          </DialogHeader>

          {!created ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="api-key-label" className="text-[11px]">
                  Label
                </Label>
                <Input
                  id="api-key-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder='e.g. "Acme Workforce"'
                  autoFocus
                  data-testid="input-api-key-label"
                />
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-end justify-end gap-2 pt-2">
                <button type="button" className="aeos-btn aeos-btn-secondary w-full sm:w-auto" onClick={() => setOpen(false)}>
                  Close
                </button>
                <button
                  type="button"
                  className="aeos-btn aeos-btn-primary w-full sm:w-auto"
                  onClick={() => create.mutate({ label })}
                  disabled={create.isPending || label.trim().length === 0}
                  data-testid="btn-submit-generate"
                >
                  {create.isPending ? "Generating…" : "Generate"}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-none border bg-muted/30 p-4">
                <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground font-semibold mb-2">
                  Raw API key
                </div>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-start gap-2">
                  <code className="flex-1 break-all rounded-none border bg-background px-3 py-2 text-[11px] sm:text-[12px] font-mono min-w-0">
                    {created.key}
                  </code>
                  <button
                    type="button"
                    className="aeos-btn aeos-btn-secondary aeos-btn--icon"
                    onClick={() => copyKey(created.key)}
                    aria-label="Copy API key"
                    data-testid="btn-copy-api-key"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 text-[12px] text-[hsl(28_90%_38%)] flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>Copy this key now</strong> — it will never be shown again
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button type="button" className="aeos-btn aeos-btn-secondary" onClick={() => setOpen(false)} data-testid="btn-close-after-create">
                  Close
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function KeyDetail({
  keyRow, onRevoke, revoking,
}: {
  keyRow: ApiKeyRow;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const revoked = !!keyRow.revokedAt;
  const tone = revoked ? "red" : "green";

  return (
    <div className="space-y-4">
      <div className={`rounded-none border-l-4 px-3 py-2 ${
        revoked
          ? "border-[hsl(0_85%_84%)] bg-[hsl(0_100%_97%)]"
          : "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]"
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">Status</div>
            <div className="text-sm font-semibold mt-0.5 break-words">{keyRow.label}</div>
          </div>
          <Pill tone={tone} className="shrink-0">
            <StatusDot tone={tone} />
            {revoked ? "Revoked" : "Active"}
          </Pill>
        </div>
      </div>

      <div className="space-y-0 text-sm">
        <DetailRow k="Key ID" v={<span className="font-mono text-xs">{keyRow.id}</span>} />
        <DetailRow k="Created" v={ago(asIso(keyRow.createdAt) ?? "")} />
        {revoked && (
          <DetailRow k="Revoked" v={ago(asIso(keyRow.revokedAt) ?? "")} />
        )}
      </div>

      {!revoked && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="aeos-btn aeos-btn-danger w-full"
              disabled={revoking}
              data-testid={`btn-revoke-${keyRow.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Revoke key
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
              <AlertDialogDescription>
                This will immediately disable the Workforce integration using this API key.
                You can’t restore it — you’ll need to generate a new key instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRevoke} className="gap-2">
                <ShieldAlert className="h-4 w-4" />
                Revoke key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function DetailRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-0.5 sm:gap-3 py-2 border-b border-border/40 last:border-0 min-w-0">
      <span className="text-muted-foreground shrink-0">{k}</span>
      <span className="font-medium text-foreground sm:text-right break-words min-w-0">{v}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 sm:px-4 py-2.5 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, mono, className }: { children: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <td className={`px-3 sm:px-4 py-2.5 align-top tabular-nums text-xs whitespace-nowrap ${mono ? "font-mono" : ""} ${className ?? ""}`}>
      {children}
    </td>
  );
}
