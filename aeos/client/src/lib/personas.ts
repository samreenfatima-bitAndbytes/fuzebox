// Diversified VIP Sigma persona — shared across the new pages.
// Same agents/processes appear consistently so the dashboard tells one story.

export const PROCESSES = [
  { id: "sba",        name: "Sports Betting Analyst",     coverage: 0.43, sigma: 3.4, weeklyRoi: 1426 },
  { id: "claims",     name: "Auto Insurance Claims",      coverage: 0.61, sigma: 4.1, weeklyRoi: 2840 },
  { id: "loan",       name: "Commercial Loan Origination",coverage: 0.38, sigma: 3.8, weeklyRoi: 1190 },
  { id: "dealer",     name: "Dealer Service Triage",      coverage: 0.55, sigma: 3.6, weeklyRoi: 1980 },
  { id: "loyalty",    name: "Player Loyalty & Retention", coverage: 0.49, sigma: 3.9, weeklyRoi: 2210 },
  { id: "aml",        name: "AML / KYC Screening",        coverage: 0.72, sigma: 4.4, weeklyRoi: 3120 },
  { id: "resort",     name: "Resort Operations",          coverage: 0.34, sigma: 3.2, weeklyRoi:  890 },
] as const;
export type ProcessId = typeof PROCESSES[number]["id"];

export const AGENTS = [
  // Sports Betting Analyst
  { id: "odds_analysis",      name: "Odds Analysis Agent",          processId: "sba",     model: "gpt-4o",            framework: "CrewAI",  sigma: 4.2, success: 0.91, costPerRun: 0.018, p95Latency: 1420, runs: 1240, dpmo:  6210 },
  { id: "line_comparison",    name: "Line Comparison Agent",         processId: "sba",     model: "gpt-4o",            framework: "CrewAI",  sigma: 3.4, success: 0.74, costPerRun: 0.022, p95Latency: 1680, runs:  892, dpmo: 22700 },
  { id: "rec_writer",         name: "Recommendation Writer Agent",   processId: "sba",     model: "claude-sonnet-4-6", framework: "CrewAI",  sigma: 2.9, success: 0.61, costPerRun: 0.041, p95Latency: 2340, runs:  634, dpmo: 50000 },
  // Auto Insurance Claims
  { id: "fnol_triage",        name: "FNOL Triage Agent",             processId: "claims",  model: "claude-sonnet-4-6", framework: "LangChain", sigma: 4.4, success: 0.96, costPerRun: 0.034, p95Latency: 1180, runs: 2210, dpmo:  3050 },
  { id: "damage_estimator",   name: "Damage Estimator Agent",        processId: "claims",  model: "gpt-4o",            framework: "LangChain", sigma: 4.0, success: 0.92, costPerRun: 0.028, p95Latency: 1390, runs: 1840, dpmo:  6210 },
  { id: "subrogation",        name: "Subrogation Recovery Agent",    processId: "claims",  model: "claude-opus-4",     framework: "Bespoke",   sigma: 3.7, success: 0.85, costPerRun: 0.062, p95Latency: 2010, runs:  548, dpmo: 16800 },
  // Commercial Loan
  { id: "loan_underwriter",   name: "Loan Underwriter Agent",        processId: "loan",    model: "claude-opus-4",     framework: "Bespoke",   sigma: 3.8, success: 0.88, costPerRun: 0.071, p95Latency: 2580, runs:  482, dpmo: 10700 },
  { id: "covenant_check",     name: "Covenant Check Agent",          processId: "loan",    model: "gpt-4o-mini",       framework: "LangChain", sigma: 4.1, success: 0.94, costPerRun: 0.011, p95Latency:  840, runs:  912, dpmo:  4660 },
  // Dealer
  { id: "service_triage",     name: "Service Triage Agent",          processId: "dealer",  model: "gpt-4o-mini",       framework: "CrewAI",  sigma: 3.6, success: 0.83, costPerRun: 0.012, p95Latency:  920, runs: 1108, dpmo: 22700 },
  { id: "estimate_composer",  name: "Estimate Composer Agent",       processId: "dealer",  model: "gpt-4o",            framework: "CrewAI",  sigma: 3.5, success: 0.81, costPerRun: 0.024, p95Latency: 1540, runs:  834, dpmo: 27000 },
  // Loyalty
  { id: "vip_segmenter",      name: "VIP Segmenter Agent",           processId: "loyalty", model: "claude-sonnet-4-6", framework: "Bespoke",   sigma: 4.0, success: 0.90, costPerRun: 0.038, p95Latency: 1290, runs:  672, dpmo:  6210 },
  { id: "comp_offer",         name: "Comp Offer Composer",           processId: "loyalty", model: "gpt-4o",            framework: "CrewAI",  sigma: 3.7, success: 0.86, costPerRun: 0.026, p95Latency: 1110, runs:  548, dpmo: 13900 },
  // AML/KYC
  { id: "aml_screener",       name: "AML Screener Agent",            processId: "aml",     model: "claude-sonnet-4-6", framework: "Bespoke",   sigma: 4.5, success: 0.97, costPerRun: 0.044, p95Latency: 1620, runs: 1860, dpmo:  2330 },
  { id: "sanctions_match",    name: "Sanctions Match Agent",         processId: "aml",     model: "gpt-4o-mini",       framework: "LangChain", sigma: 4.3, success: 0.95, costPerRun: 0.009, p95Latency:  410, runs: 2840, dpmo:  4660 },
  // Resort
  { id: "folio_reconciler",   name: "Folio Reconciler Agent",        processId: "resort",  model: "gpt-4o-mini",       framework: "LangChain", sigma: 3.2, success: 0.78, costPerRun: 0.014, p95Latency:  730, runs:  430, dpmo: 50000 },
] as const;
export type Agent = typeof AGENTS[number];

export const REVIEWERS = [
  "Marcus Webb", "Priya Sharma", "Sarah Chen", "James Park",
  "Maria Lopez", "David Chen", "Elena Kowalski",
] as const;
