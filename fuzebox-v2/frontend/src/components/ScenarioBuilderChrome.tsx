"use client";

const SCENARIO_BUILDER_STEPS = [
  "Register or pick agents",
  "Select agents for the team",
  "Define pipeline steps",
  "Set cost model (optional)",
  "Save as Active, then run with Generate request",
] as const;

export function ScenarioBuilderPageHeader() {
  return (
    <header className="fb-rr-page-header">
      <ol className="fb-rr-flow" aria-label="Suggested workflow">
        {SCENARIO_BUILDER_STEPS.map((step, i) => (
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
