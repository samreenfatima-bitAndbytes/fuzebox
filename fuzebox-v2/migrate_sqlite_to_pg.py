#!/usr/bin/env python3
"""One-shot migration: copy all data from the existing SQLite database to PostgreSQL.

Usage:
    python migrate_sqlite_to_pg.py

The script reads DATABASE_URL from the environment (or .env file) and the SQLite
database from data/agent_dashboard.db. It is safe to run multiple times — duplicate
rows are skipped via ON CONFLICT DO NOTHING.
"""

import os
import sqlite3
import sys
from pathlib import Path

# Load .env if python-dotenv is available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2-binary is not installed.")
    print("Run: pip install psycopg2-binary")
    sys.exit(1)

SQLITE_PATH = Path(__file__).parent / "data" / "agent_dashboard.db"

# Tables in dependency order (agents before tasks due to FK)
TABLES = ["agents", "users", "scenarios", "workflows", "tasks", "spans"]


def get_pg_url() -> str:
    url = os.environ.get("DATABASE_URL", "")
    if not url:
        print("ERROR: DATABASE_URL is not set.")
        print("Add it to your .env file or export it before running this script.")
        sys.exit(1)
    return url


def migrate_table(sqlite_conn: sqlite3.Connection, pg_cur, table: str) -> int:
    rows = sqlite_conn.execute(f'SELECT * FROM "{table}"').fetchall()
    if not rows:
        return 0

    col_names = [desc[0] for desc in sqlite_conn.execute(f'SELECT * FROM "{table}" LIMIT 0').description]
    placeholders = ", ".join(["%s"] * len(col_names))
    quoted_cols = ", ".join([f'"{c}"' for c in col_names])
    sql = (
        f'INSERT INTO "{table}" ({quoted_cols}) VALUES ({placeholders}) '
        f'ON CONFLICT DO NOTHING'
    )

    count = 0
    for row in rows:
        pg_cur.execute(sql, tuple(row))
        count += 1

    return count


def main():
    if not SQLITE_PATH.exists():
        print(f"SQLite database not found at {SQLITE_PATH}")
        print("Nothing to migrate — starting fresh with PostgreSQL.")
        sys.exit(0)

    pg_url = get_pg_url()

    print("=" * 60)
    print("Fuzebox SQLite → PostgreSQL Migration")
    print("=" * 60)
    print(f"Source: {SQLITE_PATH}")
    print(f"Target: {pg_url}")
    print()

    sqlite_conn = sqlite3.connect(str(SQLITE_PATH))
    sqlite_conn.row_factory = sqlite3.Row

    # Check which tables actually exist in SQLite
    existing = {
        r[0] for r in sqlite_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }

    pg_conn = psycopg2.connect(pg_url)
    pg_cur = pg_conn.cursor()

    total = 0
    for table in TABLES:
        if table not in existing:
            print(f"  {table}: not in SQLite, skipping")
            continue
        print(f"  Migrating {table}...", end=" ", flush=True)
        try:
            count = migrate_table(sqlite_conn, pg_cur, table)
            print(f"{count} rows")
            total += count
        except Exception as exc:
            print(f"ERROR — {exc}")
            pg_conn.rollback()
            sqlite_conn.close()
            pg_cur.close()
            pg_conn.close()
            sys.exit(1)

    pg_conn.commit()
    pg_cur.close()
    pg_conn.close()
    sqlite_conn.close()

    print()
    print(f"Done. {total} rows migrated total.")
    print()
    print("The original SQLite file has NOT been deleted.")
    print(f"You can archive or remove it at: {SQLITE_PATH}")


if __name__ == "__main__":
    main()
