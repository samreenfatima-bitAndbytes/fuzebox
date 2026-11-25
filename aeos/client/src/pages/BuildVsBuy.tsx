import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { KpiCard } from "@/components/KpiCard";
import { SectionCard } from "@/components/SectionCard";
import { Pill, StatusDot } from "@/components/Pill";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { usd, num } from "@/lib/format";
import { useListSelection } from "@/hooks/use-list-selection";
import { GitBranch, Wrench, Package, Lightbulb, Info, Plus, Pencil, Grid3x3 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

type Risk = "Low" | "Medium" | "High";
type Rec = "BUILD" | "BUY";

const RISK_EXPLAINER: Record<Risk, string> = {
  Low:    "Low risk: this option is unlikely to run over budget, slip its timeline, or fall short of expectations.",
  Medium: "Medium risk: there's a real chance of cost overruns, delays, or rework — worth planning around.",
  High:   "High risk: a meaningful chance this option runs over budget, behind schedule, or needs significant rework.",
};

const FACTOR_EXPLAINER: Record<string, string> = {
  "Cost (Year 1)":           "How much this option would cost in its first year, including setup and ongoing running costs.",
  "Speed to Deploy":         "How quickly this option could be up and running.",
  "Control & Customization": "How much say we'd have over how it works, and how easily we could adapt it later.",
  "Quality Ceiling":         "How good the end result could realistically get with this option, at its best.",
  "Maintenance Burden":      "How much ongoing work it would take to keep this running well day to day.",
};

const DEFAULT_MATRIX: MatrixRow[] = [
  { factor: "Cost (Year 1)", weight: 0.3, build: 2, buy: 4 },
  { factor: "Speed to Deploy", weight: 0.25, build: 2, buy: 5 },
  { factor: "Control & Customization", weight: 0.2, build: 5, buy: 2 },
  { factor: "Quality Ceiling", weight: 0.15, build: 4, buy: 3 },
  { factor: "Maintenance Burden", weight: 0.1, build: 2, buy: 4 },
];

function scoreLabel(score: number): string {
  if (score >= 5) return "the strongest option for this factor";
  if (score >= 4) return "a strong fit";
  if (score >= 3) return "a fair, middling fit";
  if (score >= 2) return "a weaker fit";
  return "the weakest option for this factor";
}

type Comparison = {
  process: string;
  build: { cost: number; timeline: string; risk: Risk; control: string };
  buy:   { cost: number; timeline: string; risk: Risk; control: string };
  recommendation: Rec;
  rationale: string;
};

type MatrixRow = { factor: string; weight: number; build: number; buy: number };

type AssessmentRow = {
  process: string;
  buildCostUsd: number; buildTimeline: string; buildRisk: Risk; buildControl: string;
  buyCostUsd: number;   buyTimeline: string;   buyRisk: Risk;   buyControl: string;
  recommendation: Rec;
  rationale: string;
};

type BuildVsBuyResponse = { ok: boolean; data: { comparisons: AssessmentRow[]; matrix: MatrixRow[] } };

type RecFilter = "all" | Rec;

type ComparisonForm = {
  process: string;
  buildCostUsd: string;
  buildTimeline: string;
  buildRisk: Risk;
  buildControl: string;
  buyCostUsd: string;
  buyTimeline: string;
  buyRisk: Risk;
  buyControl: string;
  recommendation: Rec;
  rationale: string;
};

const EMPTY_COMPARISON: ComparisonForm = {
  process: "",
  buildCostUsd: "",
  buildTimeline: "6–9 months",
  buildRisk: "Medium",
  buildControl: "Full — custom prompts, data, governance hooks",
  buyCostUsd: "",
  buyTimeline: "4–8 weeks",
  buyRisk: "Low",
  buyControl: "Limited — vendor roadmap",
  recommendation: "BUY",
  rationale: "",
};

function toComparison(r: AssessmentRow): Comparison {
  return {
    process: r.process,
    build: { cost: r.buildCostUsd, timeline: r.buildTimeline, risk: r.buildRisk, control: r.buildControl },
    buy:   { cost: r.buyCostUsd,   timeline: r.buyTimeline,   risk: r.buyRisk,   control: r.buyControl },
    recommendation: r.recommendation,
    rationale: r.rationale,
  };
}

function comparisonToForm(c: Comparison): ComparisonForm {
  return {
    process: c.process,
    buildCostUsd: String(c.build.cost),
    buildTimeline: c.build.timeline,
    buildRisk: c.build.risk,
    buildControl: c.build.control,
    buyCostUsd: String(c.buy.cost),
    buyTimeline: c.buy.timeline,
    buyRisk: c.buy.risk,
    buyControl: c.buy.control,
    recommendation: c.recommendation,
    rationale: c.rationale,
  };
}

function formToPayload(f: ComparisonForm) {
  return {
    process: f.process.trim(),
    buildCostUsd: Number(f.buildCostUsd),
    buildTimeline: f.buildTimeline.trim(),
    buildRisk: f.buildRisk,
    buildControl: f.buildControl.trim(),
    buyCostUsd: Number(f.buyCostUsd),
    buyTimeline: f.buyTimeline.trim(),
    buyRisk: f.buyRisk,
    buyControl: f.buyControl.trim(),
    recommendation: f.recommendation,
    rationale: f.rationale.trim(),
  };
}

export default function BuildVsBuy() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<BuildVsBuyResponse>({ queryKey: ["/api/build-vs-buy"] });
  const [filter, setFilter] = useState<RecFilter>("all");
  const [compOpen, setCompOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [compForm, setCompForm] = useState<ComparisonForm>(EMPTY_COMPARISON);
  const [matrixForm, setMatrixForm] = useState<MatrixRow[]>(DEFAULT_MATRIX);

  const comparisons = useMemo(
    () => (data?.data.comparisons ?? []).map(toComparison),
    [data?.data.comparisons],
  );
  const matrix = data?.data.matrix ?? [];

  const saveComparison = useMutation({
    mutationFn: (body: ReturnType<typeof formToPayload>) =>
      apiRequest("POST", "/api/build-vs-buy", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/build-vs-buy"] });
      setCompOpen(false);
      setCompForm(EMPTY_COMPARISON);
      toast({ title: "Assessment saved", description: "Process comparison updated." });
    },
    onError: (e: unknown) => {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Could not save comparison.",
        variant: "destructive",
      });
    },
  });

  const saveMatrix = useMutation({
    mutationFn: (factors: MatrixRow[]) =>
      apiRequest("POST", "/api/build-vs-buy/matrix", { factors }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/build-vs-buy"] });
      setMatrixOpen(false);
      toast({ title: "Matrix saved", description: "Weighted factors updated." });
    },
    onError: (e: unknown) => {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Could not save matrix.",
        variant: "destructive",
      });
    },
  });

  const buildCount = comparisons.filter(c => c.recommendation === "BUILD").length;
  const buyCount = comparisons.filter(c => c.recommendation === "BUY").length;
  const recommendedSpend = comparisons.reduce(
    (a, c) => a + (c.recommendation === "BUILD" ? c.build.cost : c.buy.cost),
    0,
  );
  const buildPathSpend = comparisons.reduce((a, c) => a + c.build.cost, 0);
  const buyPathSpend = comparisons.reduce((a, c) => a + c.buy.cost, 0);
  const savingsVsAllBuy = buyPathSpend - recommendedSpend;

  const list = useMemo(
    () => comparisons.filter(c => filter === "all" || c.recommendation === filter),
    [comparisons, filter],
  );

  const { selected: active, select: selectComparison, id: activeProcess } = useListSelection(
    list,
    (c) => c.process,
  );

  const dominant = buildCount === buyCount ? null : buildCount > buyCount ? "BUILD" : "BUY";

  function openNewComparison() {
    setCompForm(EMPTY_COMPARISON);
    setCompOpen(true);
  }

  function openEditComparison(c: Comparison) {
    setCompForm(comparisonToForm(c));
    setCompOpen(true);
  }

  function openMatrixEditor() {
    setMatrixForm(matrix.length > 0 ? matrix.map(r => ({ ...r })) : DEFAULT_MATRIX.map(r => ({ ...r })));
    setMatrixOpen(true);
  }

  function submitComparison() {
    if (!compForm.process.trim()) {
      toast({ title: "Process name required", variant: "destructive" });
      return;
    }
    const payload = formToPayload(compForm);
    if (!Number.isFinite(payload.buildCostUsd) || !Number.isFinite(payload.buyCostUsd)) {
      toast({ title: "Invalid costs", description: "Enter numeric year-1 costs for build and buy.", variant: "destructive" });
      return;
    }
    if (!payload.rationale) {
      toast({ title: "Rationale required", variant: "destructive" });
      return;
    }
    saveComparison.mutate(payload);
  }

  return (
    <Layout
      title="Build vs Buy Analysis"
      kicker="Insights / Build vs Buy"
      headerRight={
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="blue" className="gap-1.5">
            <GitBranch className="h-3 w-3" />
            {isLoading ? "Loading…" : isError ? "Unavailable" : `${comparisons.length} processes`}
          </Pill>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-secondary-on-dark"
            onClick={openMatrixEditor}
            data-testid="btn-edit-matrix"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
            Edit matrix
          </button>
          <button
            type="button"
            className="aeos-btn aeos-btn--topbar aeos-btn-primary-on-dark"
            onClick={openNewComparison}
            data-testid="btn-add-comparison"
          >
            <Plus className="h-3.5 w-3.5" />
            Add process
          </button>
        </div>
      }
    >
      <div className="mb-5">
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          For each process, should we build a custom AI solution or buy from a vendor? Add assessments
          and tune the weighted decision matrix — your assessments are saved for this workspace.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Pill tone="blue">Weighted decision matrix</Pill>
          <Pill tone="slate">Year-1 cost · Risk · Control</Pill>
        </div>
      </div>

      {isError && (
        <div className="rounded-none border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive mb-6">
          Could not load your build vs buy assessments. Try refreshing the page — if the problem persists, contact your administrator.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <KpiCard tone="primary" icon={<GitBranch className="h-4 w-4" />} label="PROCESSES REVIEWED" value={String(comparisons.length)} sub="Across business areas" />
        <KpiCard tone="green" icon={<Wrench className="h-4 w-4" />} label="BUILD RECOMMENDED" value={String(buildCount)} sub="Custom AI worth owning" />
        <KpiCard tone="slate" icon={<Package className="h-4 w-4" />} label="BUY RECOMMENDED" value={String(buyCount)} sub="Vendor product preferred" />
        <KpiCard tone="orange" icon={<Lightbulb className="h-4 w-4" />} label="RECOMMENDED MIX" value={usd(recommendedSpend, { decimals: 0 })} sub="Estimated year-1 cost" />
      </div>

      {dominant && comparisons.length > 0 && (
        <div className="aeos-cognition-hero aeos-cognition-total mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-muted-foreground">Portfolio lean</div>
            <div className="text-sm font-semibold text-foreground mt-1">
              {dominant === "BUILD" ? "Build-first" : "Buy-first"} strategy across {comparisons.length} processes
            </div>
          </div>
          <Pill tone={dominant === "BUILD" ? "green" : "blue"}>
            <StatusDot tone={dominant === "BUILD" ? "green" : "blue"} />
            {dominant} weighted winner
          </Pill>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-4 sm:gap-5 items-start mb-6 min-w-0">
        <SectionCard
          className="min-w-0"
          kicker="Process comparison"
          title="Build custom vs buy vendor"
          padding={false}
          action={
            <div className="aeos-content-segment" role="tablist" aria-label="Recommendation filter">
              {(["all", "BUILD", "BUY"] as const).map(f => (
                <button key={f} type="button" role="tab" onClick={() => setFilter(f)} className="aeos-content-segment-btn" data-active={filter === f ? "true" : "false"} aria-selected={filter === f}>
                  {f === "all" ? "All" : f === "BUILD" ? "Build" : "Buy"}
                  <span className="ml-1 tabular-nums opacity-70">({f === "all" ? comparisons.length : f === "BUILD" ? buildCount : buyCount})</span>
                </button>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[32rem] xl:min-w-0">
            <thead className="text-[10px] uppercase tracking-[.16em] text-muted-foreground border-b bg-muted/30">
              <tr>
                <Th>Process</Th>
                <Th>Rec</Th>
                <Th>Build cost</Th>
                <Th>Buy cost</Th>
                <Th>Δ cost</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground text-sm">Loading assessments…</td></tr>
              )}
              {!isLoading && list.map(c => {
                const recCost = c.recommendation === "BUILD" ? c.build.cost : c.buy.cost;
                const altCost = c.recommendation === "BUILD" ? c.buy.cost : c.build.cost;
                const delta = altCost - recCost;
                return (
                  <tr
                    key={c.process}
                    className={`border-b last:border-0 cursor-pointer hover:bg-muted/40 transition-colors ${activeProcess === c.process ? "bg-primary/5" : ""} ${c.recommendation === "BUILD" ? "border-l-2 border-l-[hsl(142_70%_42%)]" : "border-l-2 border-l-[hsl(213_84%_56%)]"}`}
                    onClick={() => selectComparison(c)}
                  >
                    <Td><span className="font-medium text-foreground max-w-[12rem] sm:max-w-none truncate block" title={c.process}>{c.process}</span></Td>
                    <Td>
                      <Pill tone={c.recommendation === "BUILD" ? "green" : "blue"}>
                        {c.recommendation === "BUILD" ? <Wrench className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                        {c.recommendation}
                      </Pill>
                    </Td>
                    <Td className="tabular-nums">{usd(c.build.cost, { decimals: 0 })}</Td>
                    <Td className="tabular-nums">{usd(c.buy.cost, { decimals: 0 })}</Td>
                    <Td className={`tabular-nums font-semibold ${delta >= 0 ? "text-[hsl(142_70%_30%)]" : "text-[hsl(0_72%_44%)]"}`}>
                      {delta >= 0 ? "+" : ""}{usd(delta, { decimals: 0 })}
                    </Td>
                  </tr>
                );
              })}
              {!isLoading && list.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground text-sm">
                    {comparisons.length === 0
                      ? <>No assessments yet — click <span className="font-medium text-foreground">Add process</span> in the header.</>
                      : "No processes for this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </SectionCard>

        <SectionCard className="h-fit min-w-0" kicker={active ? "Assessment detail" : "Detail"} title={active ? active.process : "Select a process"}>
          {!active ? (
            <p className="text-sm text-muted-foreground">
              Click any row to compare build vs buy factors, or add a process with the header button.
            </p>
          ) : (
            <div className="space-y-4">
              <Block title="Recommendation" tone={active.recommendation === "BUILD" ? "green" : "blue"}>
                <Pill tone={active.recommendation === "BUILD" ? "green" : "blue"}>
                  {active.recommendation === "BUILD" ? <Wrench className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                  {active.recommendation} recommended
                </Pill>
                <p className="text-xs text-muted-foreground leading-relaxed mt-2">{active.rationale}</p>
              </Block>
              <Block title="Build custom" tone="blue">
                <KV k="Year-1 cost" v={usd(active.build.cost, { decimals: 0 })} />
                <KV k="Timeline" v={active.build.timeline} />
                <KV k="Risk" v={<RiskPill r={active.build.risk} />} />
                <KV k="Control" v={active.build.control} />
              </Block>
              <Block title="Buy vendor" tone="green">
                <KV k="Year-1 cost" v={usd(active.buy.cost, { decimals: 0 })} />
                <KV k="Timeline" v={active.buy.timeline} />
                <KV k="Risk" v={<RiskPill r={active.buy.risk} />} />
                <KV k="Control" v={active.buy.control} />
              </Block>
              <button type="button" className="aeos-btn aeos-btn-secondary w-full" onClick={() => openEditComparison(active)} data-testid="btn-edit-comparison">
                <Pencil className="h-3.5 w-3.5" />
                Edit assessment
              </button>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        className="min-w-0"
        kicker="Decision matrix"
        title="What matters most — weighted factors"
        action={
          <button type="button" className="aeos-btn aeos-btn-secondary aeos-btn--sm" onClick={openMatrixEditor}>
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        }
      >
        <p className="text-sm text-muted-foreground mb-5 max-w-2xl leading-relaxed">
          For every factor, the bar shows which option scores higher on a 1–5 scale. Weights roll into the build vs buy recommendation.
        </p>
        {matrix.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No matrix yet — click <span className="font-medium text-foreground">Edit matrix</span> in the header to add default factors.
          </p>
        )}
        <div className="space-y-5">
          {matrix.map(r => (
            <MatrixBar key={r.factor} row={r} />
          ))}
        </div>
      </SectionCard>

      <ComparisonDialog
        open={compOpen}
        onOpenChange={setCompOpen}
        form={compForm}
        setForm={setCompForm}
        onSubmit={submitComparison}
        saving={saveComparison.isPending}
      />

      <MatrixDialog
        open={matrixOpen}
        onOpenChange={setMatrixOpen}
        rows={matrixForm}
        setRows={setMatrixForm}
        onSubmit={() => saveMatrix.mutate(matrixForm)}
        saving={saveMatrix.isPending}
      />
    </Layout>
  );
}

function ComparisonDialog({
  open, onOpenChange, form, setForm, onSubmit, saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  form: ComparisonForm;
  setForm: React.Dispatch<React.SetStateAction<ComparisonForm>>;
  onSubmit: () => void;
  saving: boolean;
}) {
  const set = <K extends keyof ComparisonForm>(k: K, v: ComparisonForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.process ? `Edit — ${form.process}` : "Add process assessment"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <Field label="Process name" id="bvb-process">
            <Input id="bvb-process" value={form.process} onChange={e => set("process", e.target.value)} placeholder="e.g. Ticket triage" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Build cost (USD)" id="bvb-build-cost">
              <Input id="bvb-build-cost" type="number" value={form.buildCostUsd} onChange={e => set("buildCostUsd", e.target.value)} placeholder="180000" />
            </Field>
            <Field label="Buy cost (USD)" id="bvb-buy-cost">
              <Input id="bvb-buy-cost" type="number" value={form.buyCostUsd} onChange={e => set("buyCostUsd", e.target.value)} placeholder="95000" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Build timeline" id="bvb-build-tl">
              <Input id="bvb-build-tl" value={form.buildTimeline} onChange={e => set("buildTimeline", e.target.value)} />
            </Field>
            <Field label="Buy timeline" id="bvb-buy-tl">
              <Input id="bvb-buy-tl" value={form.buyTimeline} onChange={e => set("buyTimeline", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <RiskSelect label="Build risk" value={form.buildRisk} onChange={v => set("buildRisk", v)} />
            <RiskSelect label="Buy risk" value={form.buyRisk} onChange={v => set("buyRisk", v)} />
          </div>
          <Field label="Build control" id="bvb-build-ctrl">
            <Input id="bvb-build-ctrl" value={form.buildControl} onChange={e => set("buildControl", e.target.value)} />
          </Field>
          <Field label="Buy control" id="bvb-buy-ctrl">
            <Input id="bvb-buy-ctrl" value={form.buyControl} onChange={e => set("buyControl", e.target.value)} />
          </Field>
          <Field label="Recommendation" id="bvb-rec">
            <Select value={form.recommendation} onValueChange={v => set("recommendation", v as Rec)}>
              <SelectTrigger id="bvb-rec"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BUILD">BUILD</SelectItem>
                <SelectItem value="BUY">BUY</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Rationale" id="bvb-rationale">
            <Textarea id="bvb-rationale" value={form.rationale} onChange={e => set("rationale", e.target.value)} rows={3} placeholder="Why this recommendation for this process…" />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <button type="button" className="aeos-btn aeos-btn-secondary" onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className="aeos-btn aeos-btn-primary" onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MatrixDialog({
  open, onOpenChange, rows, setRows, onSubmit, saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: MatrixRow[];
  setRows: React.Dispatch<React.SetStateAction<MatrixRow[]>>;
  onSubmit: () => void;
  saving: boolean;
}) {
  function update(i: number, patch: Partial<MatrixRow>) {
    setRows(prev => prev.map((r, j) => j === i ? { ...r, ...patch } : r));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit decision matrix</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">Scores are 1–5 per factor. Weights should sum to ~1.0.</p>
        <div className="space-y-4 py-2">
          {rows.map((r, i) => (
            <div key={r.factor} className="rounded-none border p-3 space-y-2">
              <div className="text-xs font-semibold">{r.factor}</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Field label="Weight" id={`mw-${i}`}>
                  <Input id={`mw-${i}`} type="number" step="0.05" min="0" max="1" value={r.weight} onChange={e => update(i, { weight: Number(e.target.value) })} />
                </Field>
                <Field label="Build" id={`mb-${i}`}>
                  <Input id={`mb-${i}`} type="number" min="1" max="5" value={r.build} onChange={e => update(i, { build: Number(e.target.value) })} />
                </Field>
                <Field label="Buy" id={`my-${i}`}>
                  <Input id={`my-${i}`} type="number" min="1" max="5" value={r.buy} onChange={e => update(i, { buy: Number(e.target.value) })} />
                </Field>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <button type="button" className="aeos-btn aeos-btn-secondary" onClick={() => onOpenChange(false)}>Cancel</button>
          <button type="button" className="aeos-btn aeos-btn-primary" onClick={onSubmit} disabled={saving}>{saving ? "Saving…" : "Save matrix"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MatrixBar({ row: r }: { row: MatrixRow }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mb-1.5">
        <div className="flex items-center gap-1 text-xs font-medium min-w-0">
          <span className="truncate">{r.factor}</span>
          {FACTOR_EXPLAINER[r.factor] && <InfoTip text={FACTOR_EXPLAINER[r.factor]} />}
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">weight · {num(r.weight, 2)}</span>
      </div>
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <span className="text-[11px] tabular-nums w-10 sm:w-14 text-right font-semibold text-[hsl(213_84%_42%)] shrink-0">{r.build}</span>
        <div className="flex-1 flex items-center gap-px h-3 aeos-cognition-contribution-track min-w-0">
          <div className="flex-1 flex justify-end h-full overflow-hidden">
            <div className="aeos-cognition-contribution-fill bg-[hsl(213_84%_56%)]" style={{ width: `${(r.build / 5) * 100}%` }} />
          </div>
          <div className="flex-1 flex justify-start h-full overflow-hidden">
            <div className="aeos-cognition-contribution-fill bg-[hsl(142_70%_42%)]" style={{ width: `${(r.buy / 5) * 100}%` }} />
          </div>
        </div>
        <span className="text-[11px] tabular-nums w-10 sm:w-14 font-semibold text-[hsl(142_70%_32%)] shrink-0">{r.buy}</span>
      </div>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[11px]">{label}</Label>
      {children}
    </div>
  );
}

function RiskSelect({ label, value, onChange }: { label: string; value: Risk; onChange: (v: Risk) => void }) {
  return (
    <Field label={label} id={`risk-${label}`}>
      <Select value={value} onValueChange={v => onChange(v as Risk)}>
        <SelectTrigger id={`risk-${label}`}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Low">Low</SelectItem>
          <SelectItem value="Medium">Medium</SelectItem>
          <SelectItem value="High">High</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 sm:px-5 py-2.5 font-semibold whitespace-nowrap">{children}</th>;
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 sm:px-5 py-2.5 ${className ?? ""}`}>{children}</td>;
}

function Block({ title, tone, children }: { title: string; tone: "blue" | "green" | "orange" | "amber"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    blue: "border-[hsl(213_94%_82%)] bg-[hsl(213_100%_97%)]",
    green: "border-[hsl(142_72%_82%)] bg-[hsl(142_72%_97%)]",
    orange: "border-[hsl(25_95%_80%)] bg-[hsl(25_100%_97%)]",
    amber: "border-[hsl(38_96%_82%)] bg-[hsl(38_100%_97%)]",
  };
  return (
    <div className={`rounded-none border-l-4 px-3 py-2 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-[.16em] font-semibold text-foreground/70 mb-1">{title}</div>
      <div className="text-xs">{children}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-0.5 sm:gap-3 py-0.5 min-w-0">
      <span className="text-muted-foreground sm:w-24 shrink-0">{k}</span>
      <span className="font-medium break-words min-w-0">{v}</span>
    </div>
  );
}

function RiskPill({ r }: { r: Risk }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">
            <Pill tone={r === "Low" ? "green" : r === "Medium" ? "amber" : "red"}>{r}</Pill>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">{RISK_EXPLAINER[r]}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info size={12} className="text-muted-foreground cursor-help shrink-0 inline" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
