"use client";

export const RUN_REVIEW_PAGE_INFO =
  "Inspect pipeline runs, spot weak agents, tune training parameters, and compare baseline vs tuned outcomes — without leaving this tab.";

export const RUN_REVIEW_RUNS_INFO =
  "Filter by outcome and search the request text. Click any run to open the training studio in a modal with Summary, Steps, Tune & Train, and Compare for that workflow.";

export const RUN_REVIEW_TELEMETRY_INFO =
  "Aggregated from recent V1 tasks per agent. Completion and escalation bars surface risk at a glance; the row below shows quality and speed.";

export const RUN_REVIEW_OUTCOME_FILTER_TIP =
  "Limit the list to successful runs, escalations, or failures.";

export const RUN_REVIEW_SEARCH_TIP =
  "Matches against the stored input text for each workflow.";

export const STUDIO_TIP_ORIGINAL_REQUEST =
  "The exact customer or user message that started this workflow. Use it to remember context when you tune parameters or compare before/after runs.";

export const STUDIO_TIP_BASELINE =
  "End-to-end V1 pipeline results for this run (before any tuned re-run). Total latency sums every step; cost is estimated from tokens. Confidence reflects the classifier when present.";

export const STUDIO_TIP_STEPS_OVERVIEW =
  "Each row is one agent in pipeline order (1, then 2, then 3). Open the Steps tab for raw outputs, escalation flags, and per-step metrics.";

export const STUDIO_TIP_CONFIDENCE_THRESHOLD =
  "Below this the classifier escalates. Lower = fewer escalations, less precision.";

export const STUDIO_TIP_PROMPT_PRECISION =
  "How tightly the JSON output schema is enforced.";

export const STUDIO_TIP_SENTIMENT_WEIGHT =
  "How heavily negative sentiment influences priority routing.";

export const STUDIO_TIP_DATA_PREFETCH =
  "Pre-fetch historical task volume + avg priority before scoring.";

export const STUDIO_TIP_TONE_VARIANT =
  "Tone instruction injected into the drafter system prompt.";

export const STUDIO_TIP_FALLBACK_DEPTH =
  "How many agents to try before escalating on routing failure.";

export const STUDIO_TIP_DELTA_COST =
  "V2 tuned minus V1 baseline.";

export const STUDIO_TIP_DELTA_LATENCY =
  "V2 tuned minus V1 baseline.";

export const STUDIO_TIP_TUOP =
  "Agent-handled / total tasks.";

export const STUDIO_TIP_ROP =
  "Return on Pipeline vs $75 manual baseline.";

const WORKFLOW_STEPS = [
  "Pick a run",
  "Open it to review, tune, and compare",
  "Use Agent live telemetry tab for context",
] as const;

function InfoIcon() {
  return (
    <svg
      className="fb-rr-infotip-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
    </svg>
  );
}

export function StudioFieldLabel({
  label,
  tip,
}: {
  label: string;
  tip?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {tip ? <RunReviewInfoTip text={tip} label={label} /> : null}
    </span>
  );
}

export function RunReviewInfoTip({
  text,
  label = "More information",
}: {
  text: string;
  label?: string;
}) {
  return (
    <span className="fb-rr-infotip">
      <button
        type="button"
        className="fb-rr-infotip-btn"
        aria-label={label}
      >
        <InfoIcon />
      </button>
      <span className="fb-rr-infotip-panel" role="tooltip">
        {text}
      </span>
    </span>
  );
}

export function RunReviewSectionTitle({
  title,
  tip,
  id,
}: {
  title: string;
  tip: string;
  id?: string;
}) {
  return (
    <h2 id={id} className="fb-rr-tel-section-title">
      <span className="fb-rr-tel-heading-text">{title}</span>
      <RunReviewInfoTip text={tip} label={`About ${title}`} />
    </h2>
  );
}

export function RunReviewPageHeader() {
  return (
    <header className="fb-rr-page-header">
      <ol className="fb-rr-flow" aria-label="Suggested workflow">
        {WORKFLOW_STEPS.map((step, i) => (
          <li key={step}>
            <span className="fb-rr-flow-num" aria-hidden>
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </header>
  );
}
