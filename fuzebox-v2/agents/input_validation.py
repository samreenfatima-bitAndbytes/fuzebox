"""Shared guards for workflow input text."""

WORKFLOW_EMPTY_INPUT_REASON = (
    "Request text is required to start a workflow."
)
WORKFLOW_EMPTY_INPUT_CODE = "empty_input_text"


class EmptyInputTextError(ValueError):
    """Raised when a workflow cannot start without customer message text."""


def require_workflow_input_text(text: str | None) -> str:
    """Return stripped input text or raise if missing/blank."""
    normalized = (text or "").strip()
    if not normalized:
        raise EmptyInputTextError(WORKFLOW_EMPTY_INPUT_REASON)
    return normalized
