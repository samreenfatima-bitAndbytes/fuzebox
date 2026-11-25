export const MODEL_OPTIONS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
] as const;

export const STATUS_OPTIONS = ["active", "inactive", "error"] as const;

export const SKILL_OPTIONS = [
  "billing_support",
  "refund_processing",
  "technical_support",
  "api_troubleshooting",
  "account_management",
  "password_reset",
  "general_support",
  "order_status",
  "code_generation",
  "code_review",
  "data_analysis",
  "research",
  "planning",
] as const;

export const PERMISSION_OPTIONS = [
  "access_billing_system",
  "process_refund",
  "read_logs",
  "access_diagnostics",
  "read_account",
  "write_account",
  "read_orders",
  "read_docs",
  "filesystem:read",
  "filesystem:write",
  "network:http",
  "db:read",
  "db:write",
] as const;

export const DEFAULT_COST_IN = 0.0008;
export const DEFAULT_COST_OUT = 0.004;

export const TASK_TYPES = [
  "general_inquiry",
  "billing_inquiry",
  "refund_request",
  "technical_support",
  "api_troubleshooting",
  "password_reset",
  "account_management",
  "order_status",
] as const;

export const EXTRA_PERMISSIONS = [
  "filesystem:read",
  "filesystem:write",
  "network:http",
  "terminal:shell",
  "db:read",
  "db:write",
] as const;

export const SCENARIO_STATUS_OPTIONS = ["draft", "active", "archived"] as const;

export const SCENARIO_STATUS_SELECT_OPTIONS: {
  value: (typeof SCENARIO_STATUS_OPTIONS)[number];
  label: string;
  hint: string;
}[] = [
  {
    value: "draft",
    label: "Draft",
    hint: "Still configuring — not listed as a runnable workflow.",
  },
  {
    value: "active",
    label: "Active",
    hint: "Published — included in health checks, UoP library, and runnable scenario lists.",
  },
  {
    value: "archived",
    label: "Archived",
    hint: "Retired — kept for reference but excluded from active operational surfaces.",
  },
];

/** Shared filter dropdown options (value is string; parse numbers where needed). */
export const TIME_RANGE_OPTIONS = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "30", label: "Last 30 days" },
  { value: "0", label: "All time" },
] as const;

export const OUTCOME_FILTER_OPTIONS = [
  { value: "All", label: "All" },
  { value: "success", label: "success" },
  { value: "escalated", label: "escalated" },
  { value: "failure", label: "failure" },
] as const;

export const THROUGHPUT_GRANULARITY_OPTIONS = [
  { value: "day", label: "By day" },
  { value: "hour", label: "By hour" },
  { value: "week", label: "By week" },
] as const;

export const SORT_DIRECTION_OPTIONS = [
  { value: "Desc", label: "Descending" },
  { value: "Asc", label: "Ascending" },
] as const;

export const DEFAULT_HUMAN_BASELINE_MINS = 60;
export const DEFAULT_MANUAL_HOURLY_USD = 75;

/** Shown when a workflow cannot start without customer message text. */
export const WORKFLOW_EMPTY_INPUT_REASON =
  "Request text is required to start a workflow.";
