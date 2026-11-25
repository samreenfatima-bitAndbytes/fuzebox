import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { SectionCard } from "@/components/SectionCard";
import { KpiCard } from "@/components/KpiCard";
import { Pill } from "@/components/Pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ago, num, usd } from "@/lib/format";
import {
  Rocket, Code2, FileJson, FileCode2, ScanSearch, CheckCircle2,
  AlertTriangle, XCircle, RefreshCw, BookCheck, Layers, Shield,
  Brain, Repeat, Upload, Activity, Workflow, Inbox, ChevronRight, Play,
  X as XIcon, Sparkles, Bot, UserCheck, ShieldCheck, CircleDot, ArrowLeft,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";

type Deployment = {
  id: number;
  deploymentId: string;
  name: string;
  codeLanguage: "json" | "crewai" | "python";
  agentKind: string;
  classification: string;
  trustTier: string;
  ropTarget: number;
  recursiveDepth: number;
  reuseFromUop?: string | null;
  rawCode: string;
  manifestJson: string;
  uopInstructions: string;
  validationStatus: "valid" | "warnings" | "errors";
  validationNotes?: string | null;
  status: string;
  signature: string;
  publishedAt: string;
  publishedBy: string;
};

type UoP = {
  uopId: string; name: string; classification: string;
  ropValue: number; mer: number; trustTier: string;
};

type ValidateResult = {
  agentKind: string;
  manifest: Record<string, any>;
  validationStatus: "valid" | "warnings" | "errors";
  validationNotes: string;
};

const SAMPLE: Record<string, string> = {
  json: JSON.stringify({
    agent_id: "agt_pricing_optimizer",
    name: "Pricing Optimizer",
    hyperscaler: "anthropic",
    model: "claude-sonnet-4-6",
    workflow_id: "wf_pricing_q3",
    skills: ["pull_competitor_pricing", "compute_elasticity", "post_to_pos"],
    triggers: ["cron:0 */6 * * *", "event:competitor_price_change"],
    guardrails: ["max_change_pct:0.08", "human_gate:above_500_usd_delta"],
    inputs: { schema: "pricing.input.v1" },
    outputs: { schema: "pricing.output.v1" },
    rop_target: 4.5,
    recursive_depth: 3,
  }, null, 2),
  crewai: `from crewai import Agent, Task, Crew

researcher = Agent(
  role="Edge Researcher",
  goal="Surface advantageous lines across NFL books before opening line",
  backstory="Quant who reads four sportsbooks at once.",
  llm="anthropic/claude-sonnet-4-6",
  tools=[scrape_books, normalize_lines],
)

writer = Agent(
  role="Recommendation Writer",
  goal="Compose customer-facing edge note with citations",
  backstory="Senior content producer with compliance training.",
  llm="anthropic/claude-opus-4-7",
  tools=[citation_verifier, tone_checker],
)

scan = Task(description="Pull and normalize all open NFL lines", agent=researcher)
write = Task(description="Write the edge note with two citations", agent=writer)

crew = Crew(agents=[researcher, writer], tasks=[scan, write])
`,
  python: `# Customer Response Triage agent
from fuzebox.sdk import AgentBase, ledger, hooks

class CustomerResponseTriage(AgentBase):
    """Routes inbound dealer service messages to the right specialist."""
    model = "ms_copilot/gpt-5-mini"
    trust_tier = "T0_unverified"

    @hooks.on_invocation
    def predict_uef(self, msg):
        return ledger.sign_prediction(self, msg, dimensions=8)

    def run(self, msg):
        intent = self.classify(msg)
        if intent.confidence < 0.7:
            return self.escalate_to_human(msg, intent)
        return self.route(intent)

    @hooks.on_completion
    def close_ledger(self, decision_id, result):
        ledger.close(decision_id, result)
`,
};

const LANG_LABEL: Record<string, string> = {
  json: "JSON Manifest", crewai: "CrewAI Code", python: "Python",
};
const LANG_ICON: Record<string, JSX.Element> = {
  json: <FileJson className="h-3.5 w-3.5" />,
  crewai: <Layers className="h-3.5 w-3.5" />,
  python: <FileCode2 className="h-3.5 w-3.5" />,
};

const STATUS_TONE: Record<string, "green" | "amber" | "red"> = {
  valid: "green", warnings: "amber", errors: "red",
};
const STATUS_ICON: Record<string, JSX.Element> = {
  valid: <CheckCircle2 className="h-3.5 w-3.5" />,
  warnings: <AlertTriangle className="h-3.5 w-3.5" />,
  errors: <XCircle className="h-3.5 w-3.5" />,
};

export default function DeployAgentCode() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [language, setLanguage] = useState<"json" | "crewai" | "python">("json");
  const [code, setCode] = useState(SAMPLE.json);
  const [name, setName] = useState("Pricing Optimizer");
  const [classification, setClassification] = useState("AI-Primary");
  const [trustTier, setTrustTier] = useState("T0_unverified");
  const [ropTarget, setRopTarget] = useState("4.0");
  const [recursiveDepth, setRecursiveDepth] = useState("3");
  const [reuseFromUop, setReuseFromUop] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [activeDeployment, setActiveDeployment] = useState<Deployment | null>(null);

  const { data: deployments } = useQuery<Deployment[]>({
    queryKey: ["/api/deployments"],
  });
  const { data: uops } = useQuery<UoP[]>({ queryKey: ["/api/uop/library"] });

  // Live validation as the user types — debounced via React Query keying on inputs
  const { data: validation } = useQuery<ValidateResult>({
    queryKey: ["/api/deployments/validate", language, code],
    queryFn: async () => {
      const r = await fetch("/api/deployments/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codeLanguage: language, rawCode: code }),
      });
      return r.json();
    },
    enabled: code.trim().length > 0,
    staleTime: 1000,
  });

  const deploy = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/deployments", body),
    onSuccess: async (r) => {
      const dep = await (r as Response).json();
      setActiveDeployment(dep);
      qc.invalidateQueries({ queryKey: ["/api/deployments"] });
      qc.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({
        title: "Agent deployed",
        description: `${dep.name} signed and registered · ${dep.deploymentId}`,
      });
    },
    onError: (e: any) => {
      toast({ title: "Deploy failed", description: e?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  function handleLangChange(v: string) {
    const lang = v as "json" | "crewai" | "python";
    setLanguage(lang);
    setCode(SAMPLE[lang]);
  }

  function handleFile(f: File) {
    const reader = new FileReader();
    reader.onload = e => setCode(String(e.target?.result ?? ""));
    reader.readAsText(f);
  }

  function handleDeploy() {
    if (!name.trim() || !code.trim()) {
      toast({ title: "Missing fields", description: "Name and code are required.", variant: "destructive" });
      return;
    }
    deploy.mutate({
      name, codeLanguage: language, rawCode: code,
      classification, trustTier,
      ropTarget: Number(ropTarget) || 3.0,
      recursiveDepth: Number(recursiveDepth) || 2,
      reuseFromUop: reuseFromUop || null,
      webhookUrl: webhookUrl.trim() || null,
    });
  }

  const previewDep = activeDeployment;
  const recent = deployments ?? [];

  // KPI roll-up across deployments
  const stats = useMemo(() => {
    const valid = recent.filter(d => d.validationStatus === "valid").length;
    const warn = recent.filter(d => d.validationStatus === "warnings").length;
    const err = recent.filter(d => d.validationStatus === "errors").length;
    const totalReuse = recent.filter(d => d.reuseFromUop).length;
    return { total: recent.length, valid, warn, err, totalReuse };
  }, [recent]);

  const [topTab, setTopTab] = useState<"deploy" | "training">("deploy");

  return (
    <Layout title="Deploy Agent Code" kicker="Governance / Deploy Agent Code"
      headerRight={
        <div className="flex items-center gap-2">
          <Link href="/governance/audit" className="aeos-btn aeos-btn--topbar aeos-btn-secondary-on-dark">
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <Pill tone="blue" className="gap-1.5">
            <Rocket className="h-3 w-3" /> Recursive training enabled
          </Pill>
        </div>
      }>

      <Tabs value={topTab} onValueChange={(v) => setTopTab(v as "deploy" | "training")} className="mb-5">
        <TabsList>
          <TabsTrigger value="deploy" data-testid="top-tab-deploy">
            <Rocket className="h-3.5 w-3.5 mr-1.5" /> Deploy Code
          </TabsTrigger>
          <TabsTrigger value="training" data-testid="top-tab-training">
            <Workflow className="h-3.5 w-3.5 mr-1.5" /> Recursive Training
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {topTab === "training" ? <RecursiveTrainingView deployments={recent} /> : (
      <>
      <p className="text-sm text-muted-foreground max-w-3xl mb-5 leading-relaxed">
        Deploy a JSON agent manifest, a CrewAI program, or a generic Python agent. Every submission is parsed,
        validated, signed, and rendered into <strong>UoP Instructions for new agents, tasks, and workflows</strong> —
        with a recursive training profile bound to the trust tier you select. The right pane shows the parsed manifest
        and the generated instructions; both are persisted and re-rendered on every retrain cycle.
      </p>

      {/* KPI ROW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard tone="primary" icon={<Rocket className="h-4 w-4" />}
          label="DEPLOYMENTS" value={num(stats.total, 0)}
          sub={`${stats.valid} valid · ${stats.warn} warnings · ${stats.err} errors`} />
        <KpiCard tone="green" icon={<CheckCircle2 className="h-4 w-4" />}
          label="CLEAN VALIDATIONS"
          value={stats.total ? `${Math.round((stats.valid / stats.total) * 100)}%` : "—"}
          sub="parsed without warnings" />
        <KpiCard tone="orange" icon={<Repeat className="h-4 w-4" />}
          label="UoP-INHERITED"
          value={num(stats.totalReuse, 0)}
          sub="agents bootstrapping from a published UoP" />
        <KpiCard tone="amber" icon={<Brain className="h-4 w-4" />}
          label="LIBRARY ENTRIES"
          value={num(uops?.length ?? 0, 0)}
          sub="reusable economic primitives available" />
      </div>

      {/* SPLIT PANE — left: editor + config, right: preview window */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">

        {/* ============== LEFT: deploy form ============== */}
        <div className="space-y-5 min-w-0">
          <SectionCard
            kicker="Step 1 — Choose source"
            title="Code Source"
            action={
              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border bg-card text-[11px] font-medium cursor-pointer hover:border-foreground/20"
                data-testid="upload-code">
                <Upload className="h-3 w-3" /> Upload file
                <input type="file" accept=".json,.py,.txt"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
              </label>
            }>
            <Tabs value={language} onValueChange={handleLangChange}>
              <TabsList className="grid grid-cols-3 w-full max-w-md mb-4">
                <TabsTrigger value="json" data-testid="tab-json">
                  <FileJson className="h-3.5 w-3.5 mr-1.5" /> JSON
                </TabsTrigger>
                <TabsTrigger value="crewai" data-testid="tab-crewai">
                  <Layers className="h-3.5 w-3.5 mr-1.5" /> CrewAI
                </TabsTrigger>
                <TabsTrigger value="python" data-testid="tab-python">
                  <FileCode2 className="h-3.5 w-3.5 mr-1.5" /> Python
                </TabsTrigger>
              </TabsList>

              <TabsContent value={language} className="mt-0">
                <div className="rounded-lg border overflow-hidden">
                  <div className="px-3 py-1.5 text-[11px] font-mono text-muted-foreground bg-muted/40 border-b flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      {LANG_ICON[language]} {LANG_LABEL[language]}
                    </span>
                    {validation && (
                      <Pill tone={STATUS_TONE[validation.validationStatus]} className="gap-1">
                        {STATUS_ICON[validation.validationStatus]}
                        {validation.validationStatus}
                      </Pill>
                    )}
                  </div>
                  <Textarea
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    spellCheck={false}
                    className="font-mono text-[12px] leading-[1.55] min-h-[340px] max-h-[460px] resize-y border-0 rounded-none focus-visible:ring-0"
                    data-testid="textarea-code"
                  />
                </div>
                {validation?.validationNotes && (
                  <div className={`mt-2 text-[11px] flex items-start gap-1.5 ${
                    validation.validationStatus === "errors" ? "text-[hsl(0_72%_44%)]"
                    : validation.validationStatus === "warnings" ? "text-[hsl(28_90%_38%)]"
                    : "text-muted-foreground"}`}>
                    <ScanSearch className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{validation.validationNotes}</span>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </SectionCard>

          <SectionCard kicker="Step 2 — Configure" title="Deployment Profile">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[11px]" htmlFor="dep-name">Deployment Name</Label>
                <Input id="dep-name" value={name} onChange={e => setName(e.target.value)}
                  data-testid="input-name" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Classification</Label>
                <Select value={classification} onValueChange={setClassification}>
                  <SelectTrigger data-testid="select-classification"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AI-Primary">AI-Primary</SelectItem>
                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                    <SelectItem value="AI-Assisted">AI-Assisted</SelectItem>
                    <SelectItem value="Human-Only">Human-Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Trust Tier</Label>
                <Select value={trustTier} onValueChange={setTrustTier}>
                  <SelectTrigger data-testid="select-trust"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="T0_unverified">T0 · Unverified</SelectItem>
                    <SelectItem value="T1_observed">T1 · Observed</SelectItem>
                    <SelectItem value="T2_supervised">T2 · Supervised</SelectItem>
                    <SelectItem value="T3_autonomous">T3 · Autonomous</SelectItem>
                    <SelectItem value="T4_autonomous">T4 · Trusted Autonomous</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]" htmlFor="dep-rop">RoP Target (×)</Label>
                <Input id="dep-rop" type="number" step="0.1" min="1.0" max="10.0"
                  value={ropTarget} onChange={e => setRopTarget(e.target.value)}
                  data-testid="input-rop" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]" htmlFor="dep-depth">Recursive Depth</Label>
                <Input id="dep-depth" type="number" min="1" max="6"
                  value={recursiveDepth} onChange={e => setRecursiveDepth(e.target.value)}
                  data-testid="input-depth" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px]">Inherit from UoP (optional)</Label>
                <Select value={reuseFromUop || "_none"} onValueChange={v => setReuseFromUop(v === "_none" ? "" : v)}>
                  <SelectTrigger data-testid="select-uop"><SelectValue placeholder="Greenfield (no inheritance)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Greenfield · no inheritance</SelectItem>
                    {(uops ?? []).map(u => (
                      <SelectItem key={u.uopId} value={u.uopId}>
                        {u.name} · RoP {u.ropValue.toFixed(2)}×
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="text-[11px]" htmlFor="dep-webhook">Webhook URL <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="dep-webhook"
                  type="url"
                  placeholder="https://your-orchestrator.example.com/api/agent-deployed"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  data-testid="input-webhook"
                />
                <p className="text-[10px] text-muted-foreground">After deployment, a POST signal will be sent here — enter your external orchestrator's endpoint.</p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t flex items-center justify-between">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Shield className="h-3 w-3" />
                Submission is parsed, signed with the FuzeBox KMS root, and chained into the audit ledger.
              </div>
              <Button
                onClick={handleDeploy}
                disabled={deploy.isPending || validation?.validationStatus === "errors"}
                data-testid="btn-deploy"
                className="gap-2">
                {deploy.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Deploy Agent
              </Button>
            </div>
          </SectionCard>

          {/* Recent deployments */}
          <SectionCard kicker="Recent" title="Past Deployments"
            action={
              <Pill tone="neutral">{recent.length} total</Pill>
            }>
            {recent.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No deployments yet — deploy your first agent above.
              </div>
            ) : (
              <div className="divide-y -mx-5">
                {recent.slice(0, 8).map(d => (
                  <button key={d.deploymentId}
                    onClick={() => setActiveDeployment(d)}
                    className={`w-full px-5 py-3 text-left hover:bg-muted/40 transition flex items-center justify-between gap-3 ${
                      activeDeployment?.deploymentId === d.deploymentId ? "bg-muted/30" : ""
                    }`}
                    data-testid={`row-dep-${d.deploymentId}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">{d.name}</span>
                        <Pill tone="outline" className="gap-1 shrink-0">
                          {LANG_ICON[d.codeLanguage]} {d.codeLanguage}
                        </Pill>
                        <Pill tone={STATUS_TONE[d.validationStatus]} className="gap-1 shrink-0">
                          {STATUS_ICON[d.validationStatus]} {d.validationStatus}
                        </Pill>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                        {d.deploymentId} · {d.classification} · {d.trustTier.replace(/_/g, " · ")} · RoP target {d.ropTarget.toFixed(1)}×
                      </div>
                    </div>
                    <div className="text-[11px] text-muted-foreground shrink-0">{ago(d.publishedAt)}</div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* ============== RIGHT: preview pane ============== */}
        <div className="space-y-5 min-w-0">
          <SectionCard
            kicker="Preview"
            title={previewDep ? previewDep.name : "Deployment Preview"}
            action={
              previewDep
                ? <Pill tone="green" className="gap-1"><CheckCircle2 className="h-3 w-3" /> deployed</Pill>
                : <Pill tone="neutral">live preview</Pill>
            }>
            {!previewDep && validation && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <PreviewStat label="Detected kind" value={validation.agentKind} />
                  <PreviewStat label="Validation"
                    value={
                      <span className="inline-flex items-center gap-1.5">
                        {STATUS_ICON[validation.validationStatus]}
                        <span className="capitalize">{validation.validationStatus}</span>
                      </span>
                    } />
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground mb-1.5">
                    Parsed Manifest (live)
                  </div>
                  <pre className="rounded-md border bg-muted/40 p-3 text-[11px] font-mono leading-[1.55] overflow-auto max-h-[260px]">
{JSON.stringify(validation.manifest, null, 2)}
                  </pre>
                </div>
                <div className="text-[11px] text-muted-foreground border-t pt-3 flex items-start gap-1.5">
                  <Code2 className="h-3 w-3 mt-0.5" />
                  Hit <strong className="mx-1">Deploy Agent</strong> to sign this code and generate the full UoP Instructions block.
                </div>
              </div>
            )}

            {previewDep && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <PreviewStat label="Agent kind" value={previewDep.agentKind} />
                  <PreviewStat label="Trust tier"
                    value={previewDep.trustTier.replace(/_/g, " · ")} />
                  <PreviewStat label="RoP target"
                    value={`${previewDep.ropTarget.toFixed(2)}×`} />
                  <PreviewStat label="Classification" value={previewDep.classification} />
                  <PreviewStat label="Recursive depth" value={`${previewDep.recursiveDepth} levels`} />
                  <PreviewStat label="Inherits from UoP"
                    value={previewDep.reuseFromUop ?? "Greenfield"} />
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <FileJson className="h-3 w-3" /> Parsed Manifest
                  </div>
                  <pre className="rounded-md border bg-muted/40 p-3 text-[11px] font-mono leading-[1.55] overflow-auto max-h-[200px]">
{previewDep.manifestJson}
                  </pre>
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Code2 className="h-3 w-3" /> Source Code ({previewDep.codeLanguage})
                  </div>
                  <pre className="rounded-md border bg-muted/40 p-3 text-[11px] font-mono leading-[1.55] overflow-auto max-h-[200px] whitespace-pre-wrap">
{previewDep.rawCode}
                  </pre>
                </div>

                <div className="border-t pt-3 text-[11px] text-muted-foreground flex items-center gap-2 font-mono">
                  <Shield className="h-3 w-3" /> {previewDep.signature}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            kicker="Recursive Training & UoP Instructions"
            title="Generated for new agents, tasks, and workflows"
            action={
              previewDep
                ? <Pill tone="blue">{previewDep.deploymentId}</Pill>
                : <Pill tone="neutral">awaiting deploy</Pill>
            }>
            {!previewDep ? (
              <div className="text-xs text-muted-foreground py-8 text-center">
                The full UoP instructions render here after deploy — including the three-loop recursive
                training profile, bootstrapping sequence, governance constraints, and library pathway.
              </div>
            ) : (
              <article className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h2:tracking-wide prose-h2:uppercase prose-h2:text-muted-foreground prose-h2:mt-5 prose-h2:mb-2 prose-p:text-[13px] prose-p:leading-relaxed prose-li:text-[13px] prose-li:leading-relaxed prose-li:my-0.5 prose-ul:my-2 prose-ol:my-2"
                data-testid="uop-instructions">
                <RenderMarkdown text={previewDep.uopInstructions} />
              </article>
            )}
          </SectionCard>
        </div>
      </div>
      </>)}
    </Layout>
  );
}

function PreviewStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold mt-1 truncate">{value}</div>
    </div>
  );
}

/**
 * Lightweight Markdown renderer for the generated instructions.
 * Supports H1/H2 headings, ordered/unordered lists, bold (**) and inline code (`).
 * Avoids pulling in a full MD library — output shape is fully under our control server-side.
 */
function RenderMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let listBuffer: { ordered: boolean; items: string[] } | null = null;

  function flushList() {
    if (!listBuffer) return;
    const Tag = listBuffer.ordered ? "ol" : "ul";
    out.push(
      <Tag key={out.length}>
        {listBuffer.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
      </Tag>
    );
    listBuffer = null;
  }

  function inline(s: string): React.ReactNode {
    // bold then code
    const nodes: React.ReactNode[] = [];
    let rest = s;
    let key = 0;
    const regex = /(\*\*[^*]+\*\*|`[^`]+`)/;
    while (true) {
      const m = rest.match(regex);
      if (!m) { nodes.push(rest); break; }
      const idx = m.index!;
      if (idx > 0) nodes.push(rest.slice(0, idx));
      const token = m[0];
      if (token.startsWith("**")) {
        nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
      } else {
        nodes.push(<code key={key++} className="rounded px-1 py-0.5 bg-muted text-[11.5px] font-mono">{token.slice(1, -1)}</code>);
      }
      rest = rest.slice(idx + token.length);
    }
    return <>{nodes}</>;
  }

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (line.startsWith("# ")) {
      flushList();
      out.push(<h1 key={out.length}>{inline(line.slice(2))}</h1>);
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(<h2 key={out.length}>{inline(line.slice(3))}</h2>);
    } else if (/^\d+\.\s/.test(line)) {
      if (!listBuffer || !listBuffer.ordered) { flushList(); listBuffer = { ordered: true, items: [] }; }
      listBuffer.items.push(line.replace(/^\d+\.\s/, ""));
    } else if (line.startsWith("- ")) {
      if (!listBuffer || listBuffer.ordered) { flushList(); listBuffer = { ordered: false, items: [] }; }
      listBuffer.items.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else if (line.startsWith("_") && line.endsWith("_")) {
      flushList();
      out.push(<p key={out.length} className="italic text-muted-foreground">{line.slice(1, -1)}</p>);
    } else {
      flushList();
      out.push(<p key={out.length}>{inline(line)}</p>);
    }
  }
  flushList();
  return <>{out}</>;
}

/* =====================================================================
 * Recursive Training View — Orchestrator + animated workflow modal
 * ===================================================================== */

type Execution = {
  id: string;
  deploymentId: string;
  title: string;
  startedAgo: string;
  status: "completed" | "running" | "failed" | "awaiting_human";
  trustTier: string;
  classification: string;
  recursiveDepth: number;
  agentKind: string;
  codeLanguage: string;
  manifestJson: string;
};

function statusPillTone(s: Execution["status"]): "green" | "amber" | "red" | "blue" {
  return s === "completed" ? "green" : s === "running" ? "blue" : s === "failed" ? "red" : "amber";
}

function deploymentStatusToExecStatus(status: string): Execution["status"] {
  if (status === "training") return "running";
  if (status === "deployed") return "completed";
  if (status === "retired") return "failed";
  return "awaiting_human";
}

function RecursiveTrainingView({ deployments }: { deployments: Deployment[] }) {
  const [openExec, setOpenExec] = useState<Execution | null>(null);

  const execs: Execution[] = useMemo(() => {
    return (deployments ?? []).map(d => ({
      id: d.deploymentId.replace(/^dep-/, "").slice(0, 8),
      deploymentId: d.deploymentId,
      title: d.name,
      startedAgo: ago(d.publishedAt),
      status: deploymentStatusToExecStatus(d.status),
      trustTier: d.trustTier,
      classification: d.classification,
      recursiveDepth: d.recursiveDepth,
      agentKind: d.agentKind,
      codeLanguage: d.codeLanguage,
      manifestJson: d.manifestJson,
    }));
  }, [deployments]);

  const counts = {
    running: execs.filter(e => e.status === "running").length,
    completed: execs.filter(e => e.status === "completed").length,
    failed: execs.filter(e => e.status === "failed").length,
    awaitingHuman: execs.filter(e => e.status === "awaiting_human").length,
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="h-9 w-9 rounded-lg grid place-items-center bg-[hsl(213_100%_94%)] text-[hsl(213_84%_42%)]">
          <Play className="h-4 w-4 fill-current" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold">Orchestrator</h2>
          <p className="text-xs text-muted-foreground">Runtime execution engine for governed AI workflows</p>
        </div>
        <button type="button" className="aeos-btn aeos-btn-secondary" data-testid="btn-human-task-inbox">
          <Inbox className="h-3.5 w-3.5" /> Human Task Inbox
        </button>
      </div>

      {/* Counter cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <CounterCard tone="blue" icon={<Activity className="h-4 w-4" />} label="Running" value={counts.running} />
        <CounterCard tone="green" icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={counts.completed} />
        <CounterCard tone="red" icon={<XCircle className="h-4 w-4" />} label="Failed" value={counts.failed} />
        <CounterCard tone="amber" icon={<UserCheck className="h-4 w-4" />} label="Awaiting Human" value={counts.awaitingHuman} />
      </div>

      <SectionCard kicker="Recent" title="Deployed Agents">
        {execs.length === 0 ? (
          <div className="text-xs text-muted-foreground py-8 text-center">
            No deployments yet — deploy your first agent on the Deploy Code tab.
          </div>
        ) : (
          <div className="divide-y -mx-5">
            {execs.map(e => (
              <div key={e.deploymentId} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{e.title}</div>
                  <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                    {e.deploymentId} · {e.classification} · depth {e.recursiveDepth} · {e.startedAgo}
                  </div>
                </div>
                <Pill tone={statusPillTone(e.status)} className="shrink-0">{e.status.replace(/_/g, " ")}</Pill>
                <button
                  onClick={() => setOpenExec(e)}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border bg-card text-[12px] font-medium hover:border-foreground/20"
                  data-testid={`open-workflow-${e.deploymentId}`}
                >
                  Open Workflow <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog open={!!openExec} onOpenChange={(o) => !o && setOpenExec(null)}>
        <DialogContent className="max-w-[1200px] w-[98vw] h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 py-3 border-b shrink-0">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2 flex-wrap">
              <Workflow className="h-4 w-4 text-[hsl(213_84%_56%)]" />
              <span className="truncate max-w-[280px]">{openExec?.title ?? "Workflow"}</span>
              <span className="text-[11px] font-normal text-muted-foreground ml-1 font-mono">{openExec?.deploymentId}</span>
              <div className="flex gap-1.5 ml-auto items-center">
                <Pill tone="neutral">{openExec?.agentKind ?? "agent"}</Pill>
                <Pill tone="outline">{openExec?.trustTier?.replace(/_/g, " · ")}</Pill>
                <Pill tone="blue">depth {openExec?.recursiveDepth}</Pill>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {openExec && <WorkflowCanvas exec={openExec} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CounterCard({ tone, icon, label, value }: { tone: "blue" | "green" | "red" | "amber"; icon: React.ReactNode; label: string; value: number }) {
  const bg: Record<string, string> = {
    blue: "bg-[hsl(213_100%_94%)] text-[hsl(213_84%_42%)]",
    green: "bg-[hsl(142_72%_92%)] text-[hsl(142_70%_30%)]",
    red: "bg-[hsl(0_85%_94%)] text-[hsl(0_72%_44%)]",
    amber: "bg-[hsl(38_96%_92%)] text-[hsl(28_90%_38%)]",
  };
  return (
    <div className="rounded-xl border bg-card p-4 ecl-card-shadow flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${bg[tone]}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[.16em] text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

/* =====================================================================
 * Animated Workflow Canvas — builds nodes dynamically from the manifest
 * ===================================================================== */

type NodeKind = "start" | "agent" | "policy" | "human" | "end";
type NodeDef = {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

const KIND_STYLES: Record<NodeKind, { tag: string; tagBg: string; tagFg: string; ring: string; barBg: string }> = {
  start:  { tag: "ENTRY",        tagBg: "bg-[hsl(170_70%_90%)]",  tagFg: "text-[hsl(170_70%_30%)]",  ring: "hsl(170 70% 45%)", barBg: "hsl(170 70% 45%)" },
  agent:  { tag: "AGENT TASK",   tagBg: "bg-[hsl(263_70%_94%)]",  tagFg: "text-[hsl(263_60%_42%)]",  ring: "hsl(263 60% 56%)", barBg: "hsl(142 70% 42%)" },
  policy: { tag: "POLICY CHECK", tagBg: "bg-[hsl(0_85%_94%)]",    tagFg: "text-[hsl(0_72%_44%)]",    ring: "hsl(0 72% 56%)",   barBg: "hsl(25 95% 55%)" },
  human:  { tag: "HUMAN TASK",   tagBg: "bg-[hsl(220_60%_94%)]",  tagFg: "text-[hsl(220_60%_38%)]",  ring: "hsl(220 60% 56%)", barBg: "hsl(220 30% 60%)" },
  end:    { tag: "",             tagBg: "",                        tagFg: "",                          ring: "hsl(220 10% 60%)", barBg: "" },
};

function buildWorkflowNodes(exec: Execution): { nodes: NodeDef[]; edges: { from: string; to: string }[] } {
  let manifest: any = {};
  try { manifest = JSON.parse(exec.manifestJson || "{}"); } catch {}

  const NODE_W = 200, NODE_H = 80, GAP_Y = 32, START_X = 300;
  const nodes: NodeDef[] = [];
  const edges: { from: string; to: string }[] = [];

  // Start node
  nodes.push({ id: "start", kind: "start", label: exec.title, x: START_X, y: 16, w: NODE_W, h: 64 });

  let y = 16 + 64 + GAP_Y;

  // Skills / tasks from manifest — each becomes an agent node
  const skills: string[] = Array.isArray(manifest.skills) ? manifest.skills
    : Array.isArray(manifest.tasks) ? manifest.tasks.map((t: any) => typeof t === "string" ? t : t.description ?? t.name ?? "Task")
    : [];

  const mainIds: string[] = ["start"];

  if (skills.length === 0) {
    // Fallback: single agent node from name/kind
    const id = "agent_0";
    nodes.push({ id, kind: "agent", label: exec.title, sub: exec.agentKind, x: START_X, y, w: NODE_W, h: NODE_H });
    mainIds.push(id);
    y += NODE_H + GAP_Y;
  } else {
    skills.forEach((s, i) => {
      const id = `step_${i}`;
      const label = String(s).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      nodes.push({ id, kind: "agent", label, sub: exec.agentKind, x: START_X, y, w: NODE_W, h: NODE_H });
      mainIds.push(id);
      y += NODE_H + GAP_Y;
    });
  }

  // Guardrails → policy check nodes (right column)
  const guardrails: string[] = Array.isArray(manifest.guardrails) ? manifest.guardrails : [];
  if (guardrails.length > 0) {
    let gy = 16 + 64 + GAP_Y;
    guardrails.forEach((g, i) => {
      const id = `guard_${i}`;
      const label = String(g).replace(/_/g, " ").replace(/:/g, ": ").replace(/\b\w/g, c => c.toUpperCase());
      nodes.push({ id, kind: "policy", label, x: START_X + NODE_W + 80, y: gy, w: NODE_W, h: NODE_H });
      // connect from the corresponding step if exists, else from start
      const fromId = mainIds[i + 1] ?? mainIds[mainIds.length - 1];
      edges.push({ from: fromId, to: id });
      gy += NODE_H + GAP_Y;
    });
  }

  // Triggers → human nodes where trigger contains "human" or "gate"
  const triggers: string[] = Array.isArray(manifest.triggers) ? manifest.triggers : [];
  const humanTriggers = triggers.filter(t => /human|gate|review/i.test(String(t)));
  if (humanTriggers.length > 0) {
    humanTriggers.forEach((t, i) => {
      const id = `human_${i}`;
      const label = String(t).replace(/_/g, " ").replace(/:/g, ": ").replace(/\b\w/g, c => c.toUpperCase());
      nodes.push({ id, kind: "human", label, x: START_X - NODE_W - 80, y: 16 + 64 + GAP_Y + i * (NODE_H + GAP_Y), w: NODE_W, h: NODE_H });
      edges.push({ from: "start", to: id });
    });
  }

  // End node
  const endId = "end";
  nodes.push({ id: endId, kind: "end", label: "Process Complete", x: START_X, y, w: NODE_W, h: 56 });
  mainIds.push(endId);

  // Main chain edges
  for (let i = 0; i < mainIds.length - 1; i++) {
    edges.push({ from: mainIds[i], to: mainIds[i + 1] });
  }

  return { nodes, edges };
}

const NAV_ITEMS = [
  { label: "Workflows",           icon: <Workflow className="h-3.5 w-3.5" /> },
  { label: "Blueprint Composer",  icon: <Sparkles className="h-3.5 w-3.5" /> },
  { label: "Blueprint Library",   icon: <BookCheck className="h-3.5 w-3.5" /> },
  { label: "Audit Log",           icon: <Shield className="h-3.5 w-3.5" /> },
];

function WorkflowCanvas({ exec }: { exec: Execution }) {
  const { nodes, edges } = useMemo(() => buildWorkflowNodes(exec), [exec]);
  const [canvasTab, setCanvasTab] = useState<"workflow" | "manifest">("workflow");
  const [navItem, setNavItem] = useState("Workflows");

  const nodeMap: Record<string, NodeDef> = Object.fromEntries(nodes.map(n => [n.id, n]));

  function pathFor(fromId: string, toId: string): string {
    const a = nodeMap[fromId], b = nodeMap[toId];
    if (!a || !b) return "";
    const ax = a.x + a.w / 2, ay = a.y + a.h;
    const bx = b.x + b.w / 2, by = b.y;
    if (Math.abs(ax - bx) < 4) return `M ${ax} ${ay} L ${bx} ${by}`;
    const midY = ay + (by - ay) / 2;
    return `M ${ax} ${ay} L ${ax} ${midY} L ${bx} ${midY} L ${bx} ${by}`;
  }

  const maxX = Math.max(...nodes.map(n => n.x + n.w)) + 40;
  const maxY = Math.max(...nodes.map(n => n.y + n.h)) + 40;

  let manifest: any = {};
  try { manifest = JSON.parse(exec.manifestJson || "{}"); } catch {}

  const taskLabels = nodes.filter(n => n.kind !== "start" && n.kind !== "end").map(n => n.label);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left navigation rail */}
      <div className="w-[160px] border-r bg-muted/20 px-2 py-4 shrink-0 flex flex-col gap-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground px-2 mb-2">Navigation</div>
        {NAV_ITEMS.map(it => (
          <button
            key={it.label}
            onClick={() => setNavItem(it.label)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left transition ${
              navItem === it.label
                ? "bg-[hsl(213_100%_94%)] text-[hsl(213_84%_42%)] font-medium"
                : "text-muted-foreground hover:bg-muted/40"
            }`}>
            {it.icon}
            {it.label}
          </button>
        ))}
      </div>

      {/* Canvas area with tab bar */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 py-2 border-b bg-muted/20 shrink-0">
          <button
            onClick={() => setCanvasTab("workflow")}
            className={`px-3 py-1 rounded-md text-[12px] font-medium transition ${canvasTab === "workflow" ? "bg-[hsl(213_100%_94%)] text-[hsl(213_84%_42%)]" : "text-muted-foreground hover:bg-muted/40"}`}>
            <Workflow className="h-3 w-3 inline mr-1.5" />Workflow
          </button>
          <button
            onClick={() => setCanvasTab("manifest")}
            className={`px-3 py-1 rounded-md text-[12px] font-medium transition ${canvasTab === "manifest" ? "bg-[hsl(213_100%_94%)] text-[hsl(213_84%_42%)]" : "text-muted-foreground hover:bg-muted/40"}`}>
            <FileJson className="h-3 w-3 inline mr-1.5" />Manifest
          </button>
        </div>

        {canvasTab === "manifest" ? (
          <div className="flex-1 overflow-auto p-4">
            <pre className="rounded-lg border bg-muted/40 p-4 text-[11px] font-mono leading-[1.6] whitespace-pre-wrap">
              {JSON.stringify(manifest, null, 2) || exec.manifestJson}
            </pre>
          </div>
        ) : (
          <div className="flex-1 relative overflow-auto" style={{ background: "hsl(220 14% 98%)" }}>
            <div className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: "radial-gradient(circle, hsl(220 10% 85%) 1px, transparent 1px)",
                backgroundSize: "20px 20px",
              }} />
            <div className="relative p-5" style={{ width: Math.max(maxX, 600), height: Math.max(maxY, 500) }}>
              <svg className="absolute inset-0 pointer-events-none" width={Math.max(maxX, 600)} height={Math.max(maxY, 500)}>
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                    <path d="M 0 0 L 8 4 L 0 8 Z" fill="hsl(213 84% 56%)" />
                  </marker>
                </defs>
                {edges.map((e, i) => (
                  <g key={i}>
                    <path d={pathFor(e.from, e.to)} fill="none"
                      stroke="hsl(220 14% 80%)" strokeWidth={2} strokeDasharray="6 4" />
                    <path d={pathFor(e.from, e.to)} fill="none"
                      stroke="hsl(213 84% 56%)" strokeWidth={2.5}
                      strokeDasharray="8 12"
                      markerEnd="url(#arrow)"
                      className="ecl-flow-line"
                      style={{ animationDelay: `${i * 0.25}s` }} />
                    {nodeMap[e.from] && (
                      <circle cx={nodeMap[e.from].x + nodeMap[e.from].w / 2} cy={nodeMap[e.from].y + nodeMap[e.from].h} r={3.5} fill="hsl(213 84% 56%)" />
                    )}
                    {nodeMap[e.to] && (
                      <circle cx={nodeMap[e.to].x + nodeMap[e.to].w / 2} cy={nodeMap[e.to].y} r={3.5} fill="hsl(0 72% 56%)" />
                    )}
                  </g>
                ))}
              </svg>

              {nodes.map(n => {
                const styles = KIND_STYLES[n.kind];
                return (
                  <div key={n.id} className="absolute" style={{ left: n.x, top: n.y, width: n.w, height: n.h }}>
                    {n.kind === "start" ? (
                      <div className="h-full w-full rounded-xl flex items-center justify-center text-white font-semibold text-sm ecl-pulse-start px-3 text-center"
                        style={{ background: "linear-gradient(135deg, hsl(170 70% 45%), hsl(190 65% 40%))" }}>
                        <Sparkles className="h-3.5 w-3.5 mr-2 shrink-0" />
                        <span className="truncate">{n.label}</span>
                      </div>
                    ) : n.kind === "end" ? (
                      <div className="h-full w-full rounded-full border-2 bg-card flex items-center justify-center text-sm font-medium text-foreground ecl-pulse-soft">
                        <CircleDot className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                        {n.label}
                      </div>
                    ) : (
                      <div className="h-full w-full rounded-xl border-2 bg-card p-3 ecl-pulse-soft flex flex-col relative"
                        style={{ borderColor: styles.ring + "33" }}>
                        <div className={`text-[10px] uppercase tracking-[.16em] font-semibold ${styles.tagBg} ${styles.tagFg} rounded px-1.5 py-0.5 self-start mb-1.5`}>
                          {styles.tag}
                        </div>
                        <div className="text-[12px] font-semibold leading-tight truncate">{n.label}</div>
                        {n.sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{n.sub}</div>}
                        <div className="mt-auto self-end h-1.5 w-12 rounded-full" style={{ background: styles.barBg + "55" }} />
                        <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full ecl-blink" style={{ background: styles.ring }} />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* zoom controls */}
              <div className="absolute left-3 bottom-3 flex flex-col bg-card/90 border rounded-md backdrop-blur-sm">
                <button className="px-2 py-1 text-sm border-b">+</button>
                <button className="px-2 py-1 text-sm border-b">−</button>
                <button className="px-2 py-1 text-sm">⤢</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right side panel — Paxton */}
      <div className="w-[240px] border-l bg-card px-3 py-4 shrink-0 overflow-y-auto">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-7 w-7 rounded-md grid place-items-center bg-[hsl(263_70%_94%)] text-[hsl(263_60%_42%)]">
            <Bot className="h-4 w-4" />
          </div>
          <div className="text-[12px] font-semibold flex-1">Paxton Designer</div>
          <Pill tone="blue" className="text-[9px]">AI</Pill>
        </div>
        <p className="text-[11px] text-muted-foreground mb-3">
          Automation opportunity analysis for this deployment.
        </p>

        <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground mb-1.5">Agent Info</div>
        <div className="space-y-1 text-[11px] mb-3">
          <div className="flex justify-between"><span className="text-muted-foreground">Kind</span><span className="font-medium">{exec.agentKind}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Language</span><span className="font-medium">{exec.codeLanguage}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Trust</span><span className="font-medium truncate ml-2">{exec.trustTier.replace(/_/g, " ")}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Depth</span><span className="font-medium">{exec.recursiveDepth}</span></div>
        </div>

        <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground mb-1.5">Steps ({taskLabels.length})</div>
        <ul className="space-y-1 text-[11px] mb-3">
          {taskLabels.map((t, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
              <span className="truncate">{t}</span>
            </li>
          ))}
        </ul>

        {manifest.model && (
          <>
            <div className="text-[10px] uppercase tracking-[.16em] text-muted-foreground mb-1.5">Model</div>
            <div className="text-[11px] font-mono mb-3 truncate">{manifest.model}</div>
          </>
        )}

        <div className="rounded-md border bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex items-start gap-1.5">
          <ShieldCheck className="h-3 w-3 mt-0.5 shrink-0" />
          {exec.deploymentId} governed under {exec.trustTier.replace(/_/g, " ")} supervision.
        </div>
      </div>
    </div>
  );
}
