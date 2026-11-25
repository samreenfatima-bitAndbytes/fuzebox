"""Backfill distributed trace spans from existing workflow tasks.

Usage:
  python seed_traces.py
  docker exec fuzebox-webhook-v2 python seed_traces.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from src.dashboard import db
from src.dashboard.traces_page import backfill_spans_from_workflows


def main() -> None:
    db.init_db()
    before = len(db.get_unique_trace_ids(limit=10_000))
    result = backfill_spans_from_workflows()
    after = len(db.get_unique_trace_ids(limit=10_000))
    print(
        f"✓ Traces: {before} → {after} trace id(s); "
        f"backfilled {result['workflows']} workflow(s), "
        f"{result['spans']} span(s) inserted."
    )
    if after == 0:
        print(
            "No workflows with tasks found. Run: "
            "python seed_scenarios.py --sample-runs 10"
        )


if __name__ == "__main__":
    main()
