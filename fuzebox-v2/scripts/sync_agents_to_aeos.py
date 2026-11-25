#!/usr/bin/env python3
"""Push all fuzebox-v2 agents to the AEOS agent registry."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.dashboard import db
from src.dashboard.ecl_registry import sync_all_agents_to_ecl


def main() -> int:
    agents = db.get_all_agents()
    if not agents:
        print("No agents in fuzebox-v2 registry.")
        return 0
    print(f"Syncing {len(agents)} agent(s) to AEOS…")
    ok = sync_all_agents_to_ecl(agents)
    print(f"Done: {ok}/{len(agents)} synced.")
    return 0 if ok == len(agents) else 1


if __name__ == "__main__":
    raise SystemExit(main())
