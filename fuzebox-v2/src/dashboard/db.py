"""PostgreSQL storage layer for the Agent Performance Dashboard."""

import hashlib
import hmac
import json
import os
import secrets
import uuid
import random
import re
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Optional

import psycopg2
import psycopg2.extras
import psycopg2.pool

from src.events import build_event, verify_event
from .models import (
    Agent, AgentStatus, Organization, TaskRecord, TaskResult, SpanRecord,
    WorkflowRecord, ScenarioConfig, ScenarioStatus, TeamConfig, CostConfig,
    PipelineStep, User, UserRole,
)

def database_url() -> str:
    """Read at connect time so container env overrides .env loaded later."""
    return os.environ.get(
    "DATABASE_URL",
        "postgresql://fuzebox:fuzebox_secret@localhost:5432/fuzebox_db",
)


DATABASE_URL = database_url()

TRUST_LEVEL_MAX = 4


def _parse_iso_datetime(value: str) -> datetime:
    """Parse ISO timestamps as naive UTC for consistent sorting."""
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt
TRUST_PROMOTION_DAYS = {
    0: 0,     # T0 immediately at onboarding
    1: 7,     # T1 after 1 week
    2: 30,    # T2 after 1 month
    3: 90,    # T3 after 3 months
    4: 180,   # T4 after 6 months
}


# ── Schema ─────────────────────────────────────────────────────────────────────

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS organizations (
    org_id                  TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    slug                    TEXT NOT NULL UNIQUE,
    created_at              TEXT NOT NULL,
    is_active               INTEGER DEFAULT 1,
    deployment_health_url   TEXT
);

CREATE TABLE IF NOT EXISTS agents (
    agent_id           TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    description        TEXT DEFAULT '',
    skills             TEXT DEFAULT '[]',
    permissions        TEXT DEFAULT '[]',
    "group"            TEXT DEFAULT 'default',
    status             TEXT DEFAULT 'active',
    cost_per_1k_input  DOUBLE PRECISION DEFAULT 0.003,
    cost_per_1k_output DOUBLE PRECISION DEFAULT 0.015,
    vendor             TEXT DEFAULT 'anthropic',
    model_name         TEXT DEFAULT 'gpt-4',
    registered_at      TEXT NOT NULL,
    trust_level        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS canonical_events (
    event_id           TEXT PRIMARY KEY,
    event_version      TEXT NOT NULL,
    received_at        TEXT NOT NULL,
    vendor             TEXT NOT NULL,
    source             TEXT NOT NULL,
    source_event_type  TEXT NOT NULL,
    org_id             TEXT NOT NULL,
    agent_id           TEXT NOT NULL,
    request_id         TEXT,
    customer_id        TEXT,
    model              TEXT,
    input_tokens       INTEGER DEFAULT 0,
    output_tokens      INTEGER DEFAULT 0,
    trust_level        INTEGER DEFAULT 0,
    quality_score      DOUBLE PRECISION,
    raw_payload        TEXT NOT NULL,
    payload_hash       TEXT NOT NULL,
    hmac_signature     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
    task_id              TEXT PRIMARY KEY,
    agent_id             TEXT NOT NULL,
    workflow_id          TEXT,
    task_type            TEXT NOT NULL,
    description          TEXT DEFAULT '',
    required_skills      TEXT DEFAULT '[]',
    required_permissions TEXT DEFAULT '[]',
    result               TEXT NOT NULL DEFAULT 'success',
    started_at           TEXT NOT NULL,
    completed_at         TEXT,
    latency_ms           DOUBLE PRECISION,
    input_tokens         INTEGER DEFAULT 0,
    output_tokens        INTEGER DEFAULT 0,
    total_tokens         INTEGER DEFAULT 0,
    cost_usd             DOUBLE PRECISION DEFAULT 0.0,
    quality_score        DOUBLE PRECISION,
    metadata             TEXT DEFAULT '{}',
    FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE TABLE IF NOT EXISTS spans (
    span_id        TEXT PRIMARY KEY,
    trace_id       TEXT NOT NULL,
    parent_span_id TEXT,
    agent_id       TEXT NOT NULL,
    operation      TEXT NOT NULL,
    started_at     TEXT NOT NULL,
    ended_at       TEXT,
    duration_ms    DOUBLE PRECISION,
    status         TEXT DEFAULT 'OK',
    attributes     TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS workflows (
    workflow_id    TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT DEFAULT '',
    agent_ids      TEXT DEFAULT '[]',
    task_ids       TEXT DEFAULT '[]',
    started_at     TEXT NOT NULL,
    completed_at   TEXT,
    result         TEXT DEFAULT 'success',
    total_cost_usd DOUBLE PRECISION DEFAULT 0.0,
    metadata       TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS users (
    user_id         TEXT PRIMARY KEY,
    username        TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    role            TEXT DEFAULT 'operator',
    is_active       INTEGER DEFAULT 1,
    created_at      TEXT NOT NULL,
    last_login      TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username    ON users(username);

CREATE TABLE IF NOT EXISTS scenarios (
    scenario_id TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    status      TEXT DEFAULT 'draft',
    team        TEXT DEFAULT '{}',
    pipeline    TEXT DEFAULT '[]',
    cost        TEXT DEFAULT '{}',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    metadata    TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_tasks_agent       ON tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_started     ON tasks(started_at);
CREATE INDEX IF NOT EXISTS idx_tasks_type        ON tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_workflow    ON tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_spans_trace       ON spans(trace_id);
CREATE INDEX IF NOT EXISTS idx_spans_agent       ON spans(agent_id);
CREATE INDEX IF NOT EXISTS idx_workflows_started ON workflows(started_at);
CREATE INDEX IF NOT EXISTS idx_scenarios_status  ON scenarios(status);
CREATE INDEX IF NOT EXISTS idx_scenarios_created ON scenarios(created_at);
CREATE INDEX IF NOT EXISTS idx_events_org        ON canonical_events(org_id);
CREATE INDEX IF NOT EXISTS idx_events_agent      ON canonical_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_received   ON canonical_events(received_at);
"""

# ── Connection pool ────────────────────────────────────────────────────────────

_pool: Optional[psycopg2.pool.ThreadedConnectionPool] = None


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None or _pool.closed:
        _pool = psycopg2.pool.ThreadedConnectionPool(1, 10, database_url())
    return _pool


class _ConnAdapter:
    """Wraps a psycopg2 connection+cursor to match the sqlite3 connection interface."""

    def __init__(self, pg_conn):
        self._conn = pg_conn
        self._cur = pg_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    def execute(self, sql, params=()):
        self._cur.execute(sql, params)
        return self._cur

    def executescript(self, sql):
        for stmt in sql.split(";"):
            stmt = stmt.strip()
            if stmt:
                self._cur.execute(stmt)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._cur.close()


@contextmanager
def get_connection():
    pool = _get_pool()
    pg_conn = pool.getconn()
    pg_conn.autocommit = False
    conn = _ConnAdapter(pg_conn)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
        pool.putconn(pg_conn)


# ── Init & migrations ──────────────────────────────────────────────────────────

def init_db():
    with get_connection() as conn:
        _run_migrations(conn)
        conn.executescript(SCHEMA_SQL)


def _run_migrations(conn) -> None:
    """Apply incremental schema migrations."""

    # Fresh install: no legacy tables yet — SCHEMA_SQL creates the current schema.
    agents_table = conn.execute("""
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'agents'
    """).fetchone()
    if not agents_table:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS organizations (
                org_id                  TEXT PRIMARY KEY,
                name                    TEXT NOT NULL,
                slug                    TEXT NOT NULL UNIQUE,
                created_at              TEXT NOT NULL,
                is_active               INTEGER DEFAULT 1,
                deployment_health_url   TEXT
            )
        """)
        return

    # Create organizations table (kept for signup code that remains in codebase)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS organizations (
            org_id                  TEXT PRIMARY KEY,
            name                    TEXT NOT NULL,
            slug                    TEXT NOT NULL UNIQUE,
            created_at              TEXT NOT NULL,
            is_active               INTEGER DEFAULT 1,
            deployment_health_url   TEXT
        )
    """)

    # Ensure trust_level exists for upgraded installations
    trust_exists = conn.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'trust_level'
    """).fetchone()
    if not trust_exists:
        try:
            conn.execute('ALTER TABLE "agents" ADD COLUMN trust_level INTEGER DEFAULT 0')
        except Exception:
            pass

    # Ensure vendor exists and defaults to anthropic for all existing agents.
    vendor_exists = conn.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'agents' AND column_name = 'vendor'
    """).fetchone()
    if not vendor_exists:
        try:
            conn.execute('ALTER TABLE "agents" ADD COLUMN vendor TEXT DEFAULT \'anthropic\'')
        except Exception:
            pass
    try:
        conn.execute("UPDATE agents SET vendor = 'anthropic' WHERE vendor IS DISTINCT FROM 'anthropic'")
    except Exception:
        pass

    dep_health_exists = conn.execute("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'organizations' AND column_name = 'deployment_health_url'
    """).fetchone()
    if not dep_health_exists:
        try:
            conn.execute(
                "ALTER TABLE organizations ADD COLUMN deployment_health_url TEXT"
            )
        except Exception:
            pass

    _migrate_aeos_schema(conn)

    # Old scenarios migration: drop table if it used the old 'config' blob schema
    try:
        row = conn.execute("""
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'scenarios' AND column_name = 'config'
        """).fetchone()
        if row:
            conn.execute("DROP TABLE IF EXISTS scenarios")
    except Exception:
        pass


# ── Organisation CRUD ──────────────────────────────────────────────────────────

def create_org(org: Organization) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO organizations (org_id, name, slug, created_at, is_active) "
            "VALUES (%s, %s, %s, %s, %s)",
            (org.org_id, org.name, org.slug, org.created_at.isoformat(),
             int(org.is_active)),
        )


def get_org_by_id(org_id: str) -> Optional[Organization]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM organizations WHERE org_id = %s", (org_id,)
        ).fetchone()
    return _row_to_org(row) if row else None


def get_org_by_slug(slug: str) -> Optional[Organization]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM organizations WHERE slug = %s", (slug,)
        ).fetchone()
    return _row_to_org(row) if row else None


def org_slug_exists(slug: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM organizations WHERE slug = %s", (slug,)
        ).fetchone()
    return row is not None


def get_all_orgs() -> list[Organization]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM organizations ORDER BY name"
        ).fetchall()
    return [_row_to_org(r) for r in rows]


def _row_to_org(row) -> Organization:
    return Organization(
        org_id     = row["org_id"],
        name       = row["name"],
        slug       = row["slug"],
        created_at = datetime.fromisoformat(row["created_at"]),
        is_active  = bool(row["is_active"]),
        deployment_health_url = row["deployment_health_url"],
    )


def _migrate_aeos_schema(conn) -> None:
    """AEOS parity: event chain columns, ledger_rows, equation_snapshots."""
    for col, ddl in (
        ("workflow_id", "TEXT"),
        ("audit_hash", "TEXT"),
        ("prev_event_hash", "TEXT"),
        ("wall_ms", "DOUBLE PRECISION DEFAULT 0"),
        ("vendor_cost_usd", "DOUBLE PRECISION DEFAULT 0"),
        ("passed_thresholds", "BOOLEAN DEFAULT TRUE"),
    ):
        exists = conn.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'canonical_events' AND column_name = %s
            """,
            (col,),
        ).fetchone()
        if not exists:
            try:
                conn.execute(
                    f"ALTER TABLE canonical_events ADD COLUMN {col} {ddl}"
                )
            except Exception:
                pass

    conn.execute("""
        CREATE TABLE IF NOT EXISTS ledger_rows (
            decision_id          TEXT PRIMARY KEY,
            org_id               TEXT,
            agent_id             TEXT NOT NULL,
            workflow_id          TEXT,
            status               TEXT NOT NULL DEFAULT 'closed',
            created_at           TEXT NOT NULL,
            closed_at            TEXT,
            tech_variance_sigma  DOUBLE PRECISION,
            actual_cost_usd      DOUBLE PRECISION
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS equation_snapshots (
            id            SERIAL PRIMARY KEY,
            org_id        TEXT,
            agent_id      TEXT NOT NULL,
            workflow_id   TEXT,
            computed_at   TEXT NOT NULL,
            cuow          DOUBLE PRECISION,
            abt           DOUBLE PRECISION,
            mer           DOUBLE PRECISION,
            ctr           DOUBLE PRECISION,
            tv            DOUBLE PRECISION
        )
    """)
    try:
        conn.execute(
            """
            UPDATE canonical_events
            SET audit_hash = COALESCE(audit_hash, payload_hash),
                wall_ms = COALESCE(NULLIF(wall_ms, 0),
                    CAST((raw_payload::json->>'latency_ms') AS DOUBLE PRECISION)),
                vendor_cost_usd = COALESCE(NULLIF(vendor_cost_usd, 0),
                    CAST((raw_payload::json->>'cost_usd') AS DOUBLE PRECISION)),
                workflow_id = COALESCE(workflow_id, raw_payload::json->>'workflow_id'),
                passed_thresholds = COALESCE(passed_thresholds,
                    LOWER(COALESCE(raw_payload::json->>'result', 'success')) = 'success')
            WHERE audit_hash IS NULL OR workflow_id IS NULL
            """
        )
    except Exception:
        pass

    conn.execute("""
        CREATE TABLE IF NOT EXISTS coverage_manifest (
            id                  SERIAL PRIMARY KEY,
            org_id              TEXT NOT NULL,
            hyperscaler         TEXT NOT NULL,
            surface             TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'covered',
            activated_at        TEXT,
            last_telemetry_at   TEXT,
            signed_at           TEXT,
            signature           TEXT,
            UNIQUE (org_id, hyperscaler, surface)
        )
    """)
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_coverage_manifest_org "
            "ON coverage_manifest (org_id)"
        )
    except Exception:
        pass

    conn.execute("""
        CREATE TABLE IF NOT EXISTS agent_deployments (
            id                  SERIAL PRIMARY KEY,
            deployment_id       TEXT NOT NULL UNIQUE,
            org_id              TEXT NOT NULL DEFAULT 'org-default',
            name                TEXT NOT NULL,
            code_language       TEXT NOT NULL,
            agent_kind          TEXT NOT NULL,
            classification      TEXT NOT NULL DEFAULT 'AI-Primary',
            trust_tier          TEXT NOT NULL DEFAULT 'T0_unverified',
            rop_target          DOUBLE PRECISION NOT NULL DEFAULT 3.0,
            recursive_depth     INTEGER NOT NULL DEFAULT 2,
            reuse_from_uop      TEXT,
            raw_code            TEXT NOT NULL,
            manifest_json       TEXT NOT NULL,
            uop_instructions    TEXT NOT NULL,
            validation_status   TEXT NOT NULL DEFAULT 'valid',
            validation_notes    TEXT,
            status              TEXT NOT NULL DEFAULT 'deployed',
            signature           TEXT NOT NULL,
            published_at        TEXT NOT NULL,
            published_by        TEXT NOT NULL DEFAULT 'operator',
            webhook_url         TEXT,
            webhook_secret        TEXT
        )
    """)
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_agent_deployments_org "
            "ON agent_deployments (org_id, published_at DESC)"
        )
    except Exception:
        pass

    conn.execute("""
        CREATE TABLE IF NOT EXISTS governance_decisions (
            decision_id       TEXT PRIMARY KEY,
            org_id            TEXT,
            event_id          TEXT NOT NULL,
            decision          TEXT NOT NULL,
            human_review      TEXT NOT NULL,
            policy_outcome    TEXT,
            rationale         TEXT,
            actor             TEXT,
            fired_at          TEXT NOT NULL,
            prev_trust_tier   TEXT,
            new_trust_tier    TEXT,
            workflow_id       TEXT
        )
    """)
    try:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_governance_decisions_event "
            "ON governance_decisions (event_id, fired_at DESC)"
        )
    except Exception:
        pass

    conn.execute("""
        CREATE TABLE IF NOT EXISTS governance_rules (
            id                  TEXT PRIMARY KEY,
            org_id              TEXT NOT NULL DEFAULT 'org-default',
            name                TEXT NOT NULL,
            description         TEXT NOT NULL DEFAULT '',
            task_type           TEXT NOT NULL,
            enforcement_action  TEXT NOT NULL DEFAULT 'WARN',
            is_active           BOOLEAN NOT NULL DEFAULT TRUE,
            reference_code      TEXT,
            created_at          TEXT NOT NULL,
            updated_at          TEXT NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS api_keys (
            id                  SERIAL PRIMARY KEY,
            org_id              TEXT NOT NULL DEFAULT 'org-default',
            label               TEXT NOT NULL,
            key_hash            TEXT NOT NULL,
            key_prefix          TEXT NOT NULL,
            created_at          TEXT NOT NULL,
            revoked_at          TEXT
        )
    """)


def _coverage_signing_secret() -> str:
    return (
        os.getenv("CANONICAL_EVENT_SECRET")
        or os.getenv("JWT_SECRET")
        or "dev-secret-change-in-production"
    )


def coverage_manifest_signature(hyperscaler: str, surface: str) -> str:
    """AEOS parity: HMAC-SHA256 over coverage:hyperscaler:surface."""
    msg = f"coverage:{hyperscaler}:{surface}".encode()
    return hmac.new(
        _coverage_signing_secret().encode(),
        msg,
        hashlib.sha256,
    ).hexdigest()


def _row_to_coverage(row) -> dict:
    return {
        "hyperscaler": row["hyperscaler"],
        "surface": row["surface"],
        "status": row["status"],
        "activatedAt": row.get("activated_at"),
        "lastTelemetryAt": row.get("last_telemetry_at"),
        "signedAt": row.get("signed_at"),
        "signature": row.get("signature"),
    }


def list_coverage_manifest(org_id: Optional[str] = None) -> list[dict]:
    org_id = org_id or _default_org_id()
    if not org_id:
        return []
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM coverage_manifest
            WHERE org_id = %s
            ORDER BY hyperscaler, surface
            """,
            (org_id,),
        ).fetchall()
    return [_row_to_coverage(r) for r in rows]


def upsert_coverage_manifest(
    hyperscaler: str,
    surface: str,
    status: str,
    *,
    org_id: Optional[str] = None,
    activated_at: Optional[str] = None,
    last_telemetry_at: Optional[str] = None,
    signed_at: Optional[str] = None,
) -> dict:
    org_id = org_id or _default_org_id()
    if not org_id:
        raise ValueError("No organization configured for coverage manifest")
    hs = hyperscaler.strip().lower()
    surf = surface.strip()
    if not hs or not surf:
        raise ValueError("hyperscaler and surface are required")
    status = status.strip().lower()
    if status not in {"covered", "degraded", "gap"}:
        raise ValueError("status must be covered, degraded, or gap")

    now = datetime.utcnow().isoformat()
    activated = activated_at or now
    signed = signed_at or now
    signature = coverage_manifest_signature(hs, surf)

    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO coverage_manifest
                (org_id, hyperscaler, surface, status, activated_at,
                 last_telemetry_at, signed_at, signature)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (org_id, hyperscaler, surface) DO UPDATE SET
                status = EXCLUDED.status,
                last_telemetry_at = COALESCE(EXCLUDED.last_telemetry_at, coverage_manifest.last_telemetry_at),
                signed_at = EXCLUDED.signed_at,
                signature = EXCLUDED.signature
            """,
            (
                org_id,
                hs,
                surf,
                status,
                activated,
                last_telemetry_at,
                signed,
                signature,
            ),
        )
        row = conn.execute(
            """
            SELECT * FROM coverage_manifest
            WHERE org_id = %s AND hyperscaler = %s AND surface = %s
            """,
            (org_id, hs, surf),
        ).fetchone()
    return _row_to_coverage(row)


def update_coverage_telemetry(
    hyperscaler: str,
    surface: str,
    last_telemetry_at: str,
    *,
    org_id: Optional[str] = None,
) -> None:
    org_id = org_id or _default_org_id()
    if not org_id:
        return
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE coverage_manifest
            SET last_telemetry_at = %s
            WHERE org_id = %s AND hyperscaler = %s AND surface = %s
            """,
            (last_telemetry_at, org_id, hyperscaler.strip().lower(), surface.strip()),
        )


DEFAULT_COVERAGE_SURFACES = ("task_completion", "webhook")


def ensure_default_coverage_manifest(org_id: Optional[str] = None) -> int:
    """Seed manifest rows from agent vendors (idempotent). Returns rows inserted."""
    org_id = org_id or _default_org_id()
    if not org_id:
        return 0
    agents = get_all_agents()
    vendors = {
        (a.vendor or "anthropic").strip().lower() or "anthropic"
        for a in agents
    }
    if not vendors:
        vendors = {"anthropic"}

    inserted = 0
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        for vendor in sorted(vendors):
            for surface in DEFAULT_COVERAGE_SURFACES:
                existing = conn.execute(
                    """
                    SELECT 1 FROM coverage_manifest
                    WHERE org_id = %s AND hyperscaler = %s AND surface = %s
                    """,
                    (org_id, vendor, surface),
                ).fetchone()
                if existing:
                    continue
                conn.execute(
                    """
                    INSERT INTO coverage_manifest
                        (org_id, hyperscaler, surface, status, activated_at,
                         signed_at, signature)
                    VALUES (%s, %s, %s, 'covered', %s, %s, %s)
                    """,
                    (
                        org_id,
                        vendor,
                        surface,
                        now,
                        now,
                        coverage_manifest_signature(vendor, surface),
                    ),
                )
                inserted += 1
    return inserted


def _default_org_id() -> Optional[str]:
    orgs = get_all_orgs()
    if not orgs:
        return None
    for org in orgs:
        if org.org_id == "org-default":
            return org.org_id
    return orgs[0].org_id


def get_deployment_health_url() -> Optional[str]:
    org_id = _default_org_id()
    if not org_id:
        return None
    with get_connection() as conn:
        row = conn.execute(
            "SELECT deployment_health_url FROM organizations WHERE org_id = %s",
            (org_id,),
        ).fetchone()
    if not row:
        return None
    url = row.get("deployment_health_url")
    return url.strip() if url else None


def set_deployment_health_url(url: Optional[str]) -> None:
    org_id = _default_org_id()
    if not org_id:
        return
    normalized = url.strip() if url else None
    with get_connection() as conn:
        conn.execute(
            "UPDATE organizations SET deployment_health_url = %s WHERE org_id = %s",
            (normalized, org_id),
        )


def _row_to_deployment(row) -> dict:
    return {
        "id": row["id"],
        "deploymentId": row["deployment_id"],
        "name": row["name"],
        "codeLanguage": row["code_language"],
        "agentKind": row["agent_kind"],
        "classification": row["classification"],
        "trustTier": row["trust_tier"],
        "ropTarget": float(row["rop_target"] or 0),
        "recursiveDepth": int(row["recursive_depth"] or 0),
        "reuseFromUop": row.get("reuse_from_uop"),
        "rawCode": row["raw_code"],
        "manifestJson": row["manifest_json"],
        "uopInstructions": row["uop_instructions"],
        "validationStatus": row["validation_status"],
        "validationNotes": row.get("validation_notes"),
        "status": row["status"],
        "signature": row["signature"],
        "publishedAt": row["published_at"],
        "publishedBy": row["published_by"],
        "webhookUrl": row.get("webhook_url"),
    }


def list_deployments(org_id: Optional[str] = None, limit: int = 50) -> list[dict]:
    org_id = org_id or _default_org_id() or "org-default"
    limit = max(1, min(limit, 200))
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM agent_deployments
            WHERE org_id = %s
            ORDER BY published_at DESC
            LIMIT %s
            """,
            (org_id, limit),
        ).fetchall()
    return [_row_to_deployment(r) for r in rows]


def get_deployment(deployment_id: str) -> Optional[dict]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM agent_deployments WHERE deployment_id = %s",
            (deployment_id,),
        ).fetchone()
    return _row_to_deployment(row) if row else None


def insert_deployment(
    *,
    deployment_id: str,
    name: str,
    code_language: str,
    agent_kind: str,
    classification: str,
    trust_tier: str,
    rop_target: float,
    recursive_depth: int,
    raw_code: str,
    manifest_json: str,
    uop_instructions: str,
    validation_status: str,
    validation_notes: Optional[str],
    signature: str,
    published_at: str,
    published_by: str,
    org_id: Optional[str] = None,
    reuse_from_uop: Optional[str] = None,
    webhook_url: Optional[str] = None,
    webhook_secret: Optional[str] = None,
    status: str = "deployed",
) -> dict:
    org_id = org_id or _default_org_id() or "org-default"
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO agent_deployments
                (deployment_id, org_id, name, code_language, agent_kind,
                 classification, trust_tier, rop_target, recursive_depth,
                 reuse_from_uop, raw_code, manifest_json, uop_instructions,
                 validation_status, validation_notes, status, signature,
                 published_at, published_by, webhook_url, webhook_secret)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                deployment_id,
                org_id,
                name,
                code_language,
                agent_kind,
                classification,
                trust_tier,
                rop_target,
                recursive_depth,
                reuse_from_uop,
                raw_code,
                manifest_json,
                uop_instructions,
                validation_status,
                validation_notes,
                status,
                signature,
                published_at,
                published_by,
                webhook_url,
                webhook_secret,
            ),
        )
    row = get_deployment(deployment_id)
    if not row:
        raise RuntimeError("deployment insert failed")
    return row


# ── Agent CRUD ────────────────────────────────────────────────────────────────

def upsert_agent(agent: Agent):
    with get_connection() as conn:
        existing = conn.execute(
            "SELECT 1 FROM agents WHERE agent_id = %s", (agent.agent_id,)
        ).fetchone()
        conn.execute(
            """INSERT INTO agents
               (agent_id, name, description, skills, permissions, "group", status,
                cost_per_1k_input, cost_per_1k_output, vendor, model_name, registered_at, trust_level)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (agent_id) DO UPDATE SET
                   name               = EXCLUDED.name,
                   description        = EXCLUDED.description,
                   skills             = EXCLUDED.skills,
                   permissions        = EXCLUDED.permissions,
                   "group"            = EXCLUDED."group",
                   status             = EXCLUDED.status,
                   cost_per_1k_input  = EXCLUDED.cost_per_1k_input,
                   cost_per_1k_output = EXCLUDED.cost_per_1k_output,
                   vendor             = EXCLUDED.vendor,
                   model_name         = EXCLUDED.model_name,
                   registered_at      = EXCLUDED.registered_at,
                   trust_level        = EXCLUDED.trust_level""",
            (agent.agent_id, agent.name, agent.description,
             json.dumps(agent.skills), json.dumps(agent.permissions),
             agent.group, agent.status.value,
             agent.cost_per_1k_input, agent.cost_per_1k_output,
             (agent.vendor or "anthropic"), agent.model_name, agent.registered_at.isoformat(),
             max(0, min(TRUST_LEVEL_MAX, agent.trust_level)))
        )

    try:
        from .ecl_registry import sync_agent_to_ecl
        sync_agent_to_ecl(agent, is_new=existing is None)
    except Exception as exc:
        print(f"  [AEOS] Sync error for {agent.agent_id}: {exc}")


def get_agent(agent_id: str) -> Optional[Agent]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM agents WHERE agent_id = %s", (agent_id,)
        ).fetchone()
    return _row_to_agent(row) if row else None


def get_all_agents() -> list[Agent]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM agents ORDER BY name").fetchall()
    return [_row_to_agent(r) for r in rows]


def delete_agent(agent_id: str) -> None:
    try:
        from .ecl_registry import delete_agent_from_ecl
        delete_agent_from_ecl(agent_id)
    except Exception as exc:
        print(f"  [AEOS] Delete sync error for {agent_id}: {exc}")
    with get_connection() as conn:
        conn.execute("DELETE FROM agents WHERE agent_id = %s", (agent_id,))


def agent_name_exists(name: str, exclude_id: Optional[str] = None) -> bool:
    with get_connection() as conn:
        if exclude_id:
            row = conn.execute(
                "SELECT 1 FROM agents WHERE LOWER(name) = LOWER(%s) AND agent_id != %s",
                (name.strip(), exclude_id),
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT 1 FROM agents WHERE LOWER(name) = LOWER(%s)",
                (name.strip(),),
            ).fetchone()
    return row is not None


def get_agents_by_group(group: str) -> list[Agent]:
    with get_connection() as conn:
        rows = conn.execute(
            'SELECT * FROM agents WHERE "group" = %s ORDER BY name', (group,)
        ).fetchall()
    return [_row_to_agent(r) for r in rows]


def _row_to_agent(row) -> Agent:
    return Agent(
        agent_id=row["agent_id"], name=row["name"], description=row["description"],
        skills=json.loads(row["skills"]), permissions=json.loads(row["permissions"]),
        group=row["group"], status=AgentStatus(row["status"]),
        cost_per_1k_input=row["cost_per_1k_input"],
        cost_per_1k_output=row["cost_per_1k_output"],
        vendor=row.get("vendor") or "anthropic",
        model_name=row["model_name"],
        registered_at=datetime.fromisoformat(row["registered_at"]),
        trust_level=max(0, min(TRUST_LEVEL_MAX, int(row.get("trust_level", 0) or 0))),
    )


# ── Task CRUD ─────────────────────────────────────────────────────────────────

def get_task_by_id(task_id: str) -> Optional[TaskRecord]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM tasks WHERE task_id = %s", (task_id,)
        ).fetchone()
    if not row:
        return None
    return _row_to_task(row)


def complete_operator_placeholder(
    task_id: str,
    request_id: str,
    *,
    success: bool = True,
) -> None:
    """Mark a queued operator task row as dispatched/completed."""
    from .models import TaskResult

    with get_connection() as conn:
        row = conn.execute(
            "SELECT started_at, metadata FROM tasks WHERE task_id = %s",
            (task_id,),
        ).fetchone()
        if not row:
            return
        started_at = datetime.fromisoformat(row["started_at"])
        now = datetime.utcnow()
        if started_at.tzinfo is not None:
            started_at = started_at.replace(tzinfo=None)
        latency_ms = max(1.0, (now - started_at).total_seconds() * 1000)
        existing = json.loads(row["metadata"] or "{}")
        existing["dispatch_request_id"] = request_id
        existing["operator_dispatched"] = True
        conn.execute(
            """UPDATE tasks
               SET result = %s, completed_at = %s, latency_ms = %s, metadata = %s
               WHERE task_id = %s""",
            (
                TaskResult.SUCCESS.value if success else TaskResult.FAILURE.value,
                now.isoformat(),
                round(latency_ms, 2),
                json.dumps(existing),
                task_id,
            ),
        )


def update_task_metadata(task_id: str, metadata_patch: dict) -> None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT metadata FROM tasks WHERE task_id = %s", (task_id,)
        ).fetchone()
        if not row:
            return
        existing = json.loads(row["metadata"] or "{}")
        existing.update(metadata_patch)
        conn.execute(
            "UPDATE tasks SET metadata = %s WHERE task_id = %s",
            (json.dumps(existing), task_id)
        )


def insert_task(task: TaskRecord):
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO tasks
               (task_id, agent_id, workflow_id, task_type, description,
                required_skills, required_permissions, result, started_at, completed_at,
                latency_ms, input_tokens, output_tokens, total_tokens,
                cost_usd, quality_score, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (task.task_id, task.agent_id, task.workflow_id, task.task_type,
             task.description, json.dumps(task.required_skills),
             json.dumps(task.required_permissions),
             task.result.value, task.started_at.isoformat(),
             task.completed_at.isoformat() if task.completed_at else None,
             task.latency_ms, task.input_tokens, task.output_tokens, task.total_tokens,
             task.cost_usd, task.quality_score, json.dumps(task.metadata))
        )
        _capture_task_event(conn, task=task)


def _trust_level_from_tenure_days(days: int) -> int:
    level = 0
    for candidate, min_days in TRUST_PROMOTION_DAYS.items():
        if days >= min_days:
            level = max(level, candidate)
    return max(0, min(TRUST_LEVEL_MAX, level))


def _capture_task_event(conn, task: TaskRecord) -> None:
    # Unknown/system task rows should not affect trust/event pipeline.
    if not task.agent_id or task.agent_id == "unknown":
        return

    agent_row = conn.execute(
        "SELECT agent_id, registered_at, trust_level, vendor, model_name FROM agents WHERE agent_id = %s",
        (task.agent_id,),
    ).fetchone()
    if not agent_row:
        return

    ecl_api_key = os.getenv("ECL_API_KEY", "")
    registered_at = datetime.fromisoformat(agent_row["registered_at"])
    now = task.completed_at or datetime.utcnow()
    # Agents store naive UTC; seeded tasks may be timezone-aware.
    if registered_at.tzinfo is not None:
        registered_at = registered_at.replace(tzinfo=None)
    if now.tzinfo is not None:
        now = now.replace(tzinfo=None)
    tenure_days = max(0, (now - registered_at).days)
    current_level = int(agent_row.get("trust_level", 0) or 0)
    promoted_level = max(current_level, _trust_level_from_tenure_days(tenure_days))

    if promoted_level > current_level:
        conn.execute(
            "UPDATE agents SET trust_level = %s WHERE agent_id = %s",
            (promoted_level, task.agent_id),
        )

    workflow_id = task.workflow_id or "unassigned"
    prev_row = conn.execute(
        """
        SELECT payload_hash FROM canonical_events
        WHERE workflow_id = %s OR (raw_payload::json->>'workflow_id') = %s
        ORDER BY received_at DESC LIMIT 1
        """,
        (workflow_id, workflow_id),
    ).fetchone()
    prev_hash = prev_row["payload_hash"] if prev_row else None

    raw_payload = {
        "task_id": task.task_id,
        "workflow_id": workflow_id,
        "task_type": task.task_type,
        "description": task.description,
        "result": task.result.value,
        "started_at": task.started_at.isoformat(),
        "completed_at": task.completed_at.isoformat() if task.completed_at else None,
        "latency_ms": task.latency_ms,
        "input_tokens": task.input_tokens,
        "output_tokens": task.output_tokens,
        "total_tokens": task.total_tokens,
        "cost_usd": task.cost_usd,
        "quality_score": task.quality_score,
        "metadata": task.metadata,
        "ctx": {
            "workflowId": workflow_id,
            "vendorCostUsd": float(task.cost_usd or 0),
        },
        "prevEventHash": prev_hash,
    }
    event_source = str(agent_row.get("vendor") or "anthropic")
    event = build_event(
        org_id=ecl_api_key,
        agent_id=task.agent_id,
        source=event_source,
        source_event_type="task_completion",
        raw_payload=raw_payload,
        request_id=(task.metadata or {}).get("request_id"),
        model=agent_row.get("model_name"),
        input_tokens=task.input_tokens,
        output_tokens=task.output_tokens,
        trust_level=promoted_level,
        quality_score=task.quality_score,
    )
    if not verify_event(event):
        raise ValueError(f"Canonical event signature verification failed for task {task.task_id}")

    raw_payload["auditHash"] = event.payload_hash
    passed = str(task.result.value).lower() == "success"
    wall_ms = float(task.latency_ms or 0)
    cost_usd = float(task.cost_usd or 0)
    received_iso = event.received_at.isoformat()

    conn.execute(
        """INSERT INTO canonical_events
           (event_id, event_version, received_at, vendor, source, source_event_type,
            org_id, agent_id, request_id, customer_id, model, input_tokens, output_tokens,
            trust_level, quality_score, raw_payload, payload_hash, hmac_signature,
            workflow_id, audit_hash, prev_event_hash, wall_ms, vendor_cost_usd, passed_thresholds)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                   %s, %s, %s, %s, %s, %s)""",
        (
            event.event_id, event.event_version, received_iso,
            event.vendor, event.source, event.source_event_type,
            event.org_id, event.agent_id, event.request_id, event.customer_id,
            event.model, event.input_tokens, event.output_tokens,
            event.trust_level, event.quality_score, json.dumps(raw_payload),
            event.payload_hash, event.hmac_signature,
            workflow_id, event.payload_hash, prev_hash, wall_ms, cost_usd, passed,
        ),
    )

    success_rate = 1.0 if passed else 0.0
    sigma = round(success_rate * 4.1, 2)
    cuow = cost_usd if cost_usd > 0 else 0.001
    mer = round(success_rate / cuow, 2) if cuow else 0.0
    org_id = _default_org_id() or event.org_id

    conn.execute(
        """
        INSERT INTO ledger_rows
            (decision_id, org_id, agent_id, workflow_id, status, created_at, closed_at,
             tech_variance_sigma, actual_cost_usd)
        VALUES (%s, %s, %s, %s, 'closed', %s, %s, %s, %s)
        ON CONFLICT (decision_id) DO UPDATE SET
            tech_variance_sigma = EXCLUDED.tech_variance_sigma,
            actual_cost_usd = EXCLUDED.actual_cost_usd
        """,
        (
            task.task_id, org_id, task.agent_id, workflow_id,
            received_iso, received_iso, sigma, cost_usd,
        ),
    )
    conn.execute(
        """
        INSERT INTO equation_snapshots
            (org_id, agent_id, workflow_id, computed_at, cuow, abt, mer, ctr, tv)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            org_id, task.agent_id, workflow_id, received_iso,
            cuow, 1.0, mer, 0.0, cost_usd,
        ),
    )


def get_canonical_events(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    limit: int = 500,
) -> list[dict]:
    """Return canonical events as dictionaries, newest first."""
    clauses, params = [], []
    if start_date:
        clauses.append("received_at >= %s")
        params.append(start_date.isoformat())
    if end_date:
        clauses.append("received_at <= %s")
        params.append(end_date.isoformat())
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM canonical_events{where} ORDER BY received_at DESC LIMIT %s",
            (*params, max(1, int(limit))),
        ).fetchall()

    events: list[dict] = []
    for row in rows:
        payload = row.get("raw_payload")
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except Exception:
                payload = {}
        events.append(
            {
                "event_id": row["event_id"],
                "event_version": row["event_version"],
                "received_at": datetime.fromisoformat(row["received_at"]),
                "vendor": row["vendor"],
                "source": row["source"],
                "source_event_type": row["source_event_type"],
                "org_id": row["org_id"],
                "agent_id": row["agent_id"],
                "request_id": row["request_id"],
                "customer_id": row["customer_id"],
                "model": row["model"],
                "input_tokens": int(row.get("input_tokens", 0) or 0),
                "output_tokens": int(row.get("output_tokens", 0) or 0),
                "trust_level": int(row.get("trust_level", 0) or 0),
                "quality_score": row.get("quality_score"),
                "raw_payload": payload if isinstance(payload, dict) else {},
                "payload_hash": row["payload_hash"],
                "hmac_signature": row["hmac_signature"],
                "workflow_id": row.get("workflow_id"),
                "audit_hash": row.get("audit_hash"),
                "prev_event_hash": row.get("prev_event_hash"),
                "wall_ms": float(row.get("wall_ms") or 0),
                "vendor_cost_usd": float(row.get("vendor_cost_usd") or 0),
                "passed_thresholds": bool(row.get("passed_thresholds", True)),
            }
        )
    return events


def get_canonical_event_by_id(event_id: str) -> Optional[dict]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM canonical_events WHERE event_id = %s",
            (event_id,),
        ).fetchone()
    if not row:
        return None
    payload = row.get("raw_payload")
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except Exception:
            payload = {}
    return {
        "event_id": row["event_id"],
        "received_at": datetime.fromisoformat(row["received_at"]),
        "org_id": row.get("org_id"),
        "agent_id": row["agent_id"],
        "source_event_type": row.get("source_event_type"),
        "trust_level": int(row.get("trust_level", 0) or 0),
        "quality_score": row.get("quality_score"),
        "workflow_id": row.get("workflow_id"),
        "passed_thresholds": bool(row.get("passed_thresholds", True)),
        "raw_payload": payload if isinstance(payload, dict) else {},
    }


def update_canonical_event_review(
    event_id: str,
    human_review: str,
    *,
    reviewer_name: Optional[str] = None,
    human_user_id: Optional[str] = None,
    policy_outcome: Optional[str] = None,
) -> bool:
    event = get_canonical_event_by_id(event_id)
    if not event:
        return False
    payload = dict(event.get("raw_payload") or {})
    ctx = dict(payload.get("ctx") or {})
    ctx["humanReview"] = human_review
    if reviewer_name:
        ctx["reviewerName"] = reviewer_name
    if human_user_id:
        ctx["humanUserId"] = human_user_id
    if policy_outcome:
        ctx["policyOutcome"] = policy_outcome
        payload["policyOutcome"] = policy_outcome
    payload["humanReview"] = human_review
    payload["ctx"] = ctx
    with get_connection() as conn:
        conn.execute(
            "UPDATE canonical_events SET raw_payload = %s WHERE event_id = %s",
            (json.dumps(payload), event_id),
        )
    return True


def insert_governance_decision(
    *,
    decision_id: str,
    event_id: str,
    decision: str,
    human_review: str,
    fired_at: str,
    actor: str,
    org_id: Optional[str] = None,
    policy_outcome: Optional[str] = None,
    rationale: Optional[str] = None,
    prev_trust_tier: Optional[str] = None,
    new_trust_tier: Optional[str] = None,
    workflow_id: Optional[str] = None,
) -> dict:
    org_id = org_id or _default_org_id() or "org-default"
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO governance_decisions
                (decision_id, org_id, event_id, decision, human_review,
                 policy_outcome, rationale, actor, fired_at,
                 prev_trust_tier, new_trust_tier, workflow_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                decision_id,
                org_id,
                event_id,
                decision,
                human_review,
                policy_outcome,
                rationale,
                actor,
                fired_at,
                prev_trust_tier,
                new_trust_tier,
                workflow_id,
            ),
        )
    return {
        "decisionId": decision_id,
        "eventId": event_id,
        "decision": decision,
        "humanReview": human_review,
        "firedAt": fired_at,
        "actor": actor,
    }


def _row_to_governance_rule(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row.get("description") or "",
        "taskType": row["task_type"],
        "enforcementAction": row["enforcement_action"],
        "isActive": bool(row.get("is_active", True)),
        "referenceCode": row.get("reference_code"),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def list_governance_rules(org_id: Optional[str] = None) -> list[dict]:
    org_id = org_id or _default_org_id() or "org-default"
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM governance_rules
            WHERE org_id = %s
            ORDER BY id
            """,
            (org_id,),
        ).fetchall()
    return [_row_to_governance_rule(r) for r in rows]


def get_governance_rule(rule_id: str) -> Optional[dict]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM governance_rules WHERE id = %s",
            (rule_id,),
        ).fetchone()
    return _row_to_governance_rule(row) if row else None


def insert_governance_rule(
    *,
    rule_id: str,
    name: str,
    task_type: str,
    enforcement_action: str,
    description: str = "",
    reference_code: Optional[str] = None,
    org_id: Optional[str] = None,
) -> dict:
    org_id = org_id or _default_org_id() or "org-default"
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO governance_rules
                (id, org_id, name, description, task_type,
                 enforcement_action, is_active, reference_code,
                 created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE, %s, %s, %s)
            """,
            (
                rule_id,
                org_id,
                name,
                description,
                task_type,
                enforcement_action,
                reference_code,
                now,
                now,
            ),
        )
    row = get_governance_rule(rule_id)
    if not row:
        raise RuntimeError("rule insert failed")
    return row


def patch_governance_rule(
    rule_id: str,
    *,
    is_active: Optional[bool] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    enforcement_action: Optional[str] = None,
) -> Optional[dict]:
    existing = get_governance_rule(rule_id)
    if not existing:
        return None
    if enforcement_action is not None:
        enforcement_action = enforcement_action.upper()
        if enforcement_action not in {"BLOCK", "WARN", "LOG"}:
            raise ValueError("enforcement_action must be BLOCK, WARN, or LOG")
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE governance_rules
            SET is_active = COALESCE(%s, is_active),
                name = COALESCE(%s, name),
                description = COALESCE(%s, description),
                enforcement_action = COALESCE(%s, enforcement_action),
                updated_at = %s
            WHERE id = %s
            """,
            (
                is_active,
                name,
                description,
                enforcement_action,
                now,
                rule_id,
            ),
        )
    return get_governance_rule(rule_id)


def list_api_keys(org_id: Optional[str] = None) -> list[dict]:
    org_id = org_id or _default_org_id() or "org-default"
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT id, label, key_prefix, created_at, revoked_at
            FROM api_keys
            WHERE org_id = %s
            ORDER BY created_at DESC
            """,
            (org_id,),
        ).fetchall()
    return [
        {
            "id": r["id"],
            "label": r["label"],
            "keyPrefix": r["key_prefix"],
            "createdAt": r["created_at"],
            "revokedAt": r.get("revoked_at"),
        }
        for r in rows
    ]


def create_api_key(label: str, org_id: Optional[str] = None) -> tuple[str, dict]:
    org_id = org_id or _default_org_id() or "org-default"
    raw_key = f"fbx_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    prefix = raw_key[:12]
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        row = conn.execute(
            """
            INSERT INTO api_keys (org_id, label, key_hash, key_prefix, created_at)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, label, key_prefix, created_at, revoked_at
            """,
            (org_id, label, key_hash, prefix, now),
        ).fetchone()
    meta = {
        "id": row["id"],
        "label": row["label"],
        "keyPrefix": row["key_prefix"],
        "createdAt": row["created_at"],
        "revokedAt": row.get("revoked_at"),
    }
    return raw_key, meta


def revoke_api_key(key_id: int) -> bool:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        cur = conn.execute(
            "UPDATE api_keys SET revoked_at = %s WHERE id = %s AND revoked_at IS NULL",
            (now, key_id),
        )
    return cur.rowcount > 0


def list_ledger_rows(limit: int = 500) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM ledger_rows
            ORDER BY created_at DESC LIMIT %s
            """,
            (max(1, int(limit)),),
        ).fetchall()
    return [dict(r) for r in rows]


def list_equation_snapshots_by_agent() -> list[dict]:
    """Latest equation snapshot per agent."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT ON (agent_id) *
            FROM equation_snapshots
            ORDER BY agent_id, computed_at DESC
            """
        ).fetchall()
    return [dict(r) for r in rows]


def get_tasks(agent_id: Optional[str] = None, task_type: Optional[str] = None,
              start_date: Optional[datetime] = None, end_date: Optional[datetime] = None,
              workflow_id: Optional[str] = None) -> list[TaskRecord]:
    clauses, params = [], []
    if agent_id:
        clauses.append("agent_id = %s")
        params.append(agent_id)
    if task_type:
        clauses.append("task_type = %s")
        params.append(task_type)
    if workflow_id:
        clauses.append("workflow_id = %s")
        params.append(workflow_id)
    if start_date:
        clauses.append("started_at >= %s")
        params.append(start_date.isoformat())
    if end_date:
        clauses.append("started_at <= %s")
        params.append(end_date.isoformat())

    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM tasks{where} ORDER BY started_at DESC", params
        ).fetchall()
    return [_row_to_task(r) for r in rows]


def _row_to_task(row) -> TaskRecord:
    return TaskRecord(
        task_id=row["task_id"], agent_id=row["agent_id"],
        workflow_id=row["workflow_id"], task_type=row["task_type"],
        description=row["description"],
        required_skills=json.loads(row["required_skills"]),
        required_permissions=json.loads(row["required_permissions"]),
        result=TaskResult(row["result"]),
        started_at=_parse_iso_datetime(row["started_at"]),
        completed_at=_parse_iso_datetime(row["completed_at"]) if row["completed_at"] else None,
        latency_ms=row["latency_ms"], input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"], total_tokens=row["total_tokens"],
        cost_usd=row["cost_usd"], quality_score=row["quality_score"],
        metadata=json.loads(row["metadata"])
    )


# ── Span CRUD ─────────────────────────────────────────────────────────────────

def insert_span(span: SpanRecord):
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO spans
               (span_id, trace_id, parent_span_id, agent_id, operation,
                started_at, ended_at, duration_ms, status, attributes)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (span.span_id, span.trace_id, span.parent_span_id,
             span.agent_id, span.operation, span.started_at.isoformat(),
             span.ended_at.isoformat() if span.ended_at else None,
             span.duration_ms, span.status, json.dumps(span.attributes))
        )


def get_spans(trace_id: Optional[str] = None, agent_id: Optional[str] = None) -> list[SpanRecord]:
    clauses, params = [], []
    if trace_id:
        clauses.append("trace_id = %s")
        params.append(trace_id)
    if agent_id:
        clauses.append("agent_id = %s")
        params.append(agent_id)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM spans{where} ORDER BY started_at", params
        ).fetchall()
    return [_row_to_span(r) for r in rows]


def get_unique_trace_ids(limit: int = 50) -> list[str]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT trace_id FROM spans "
            "GROUP BY trace_id ORDER BY MAX(started_at) DESC LIMIT %s",
            (limit,)
        ).fetchall()
    return [r["trace_id"] for r in rows]


def _row_to_span(row) -> SpanRecord:
    return SpanRecord(
        span_id=row["span_id"], trace_id=row["trace_id"],
        parent_span_id=row["parent_span_id"], agent_id=row["agent_id"],
        operation=row["operation"],
        started_at=datetime.fromisoformat(row["started_at"]),
        ended_at=datetime.fromisoformat(row["ended_at"]) if row["ended_at"] else None,
        duration_ms=row["duration_ms"], status=row["status"],
        attributes=json.loads(row["attributes"])
    )


# ── Workflow CRUD ─────────────────────────────────────────────────────────────

def insert_workflow(wf: WorkflowRecord):
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO workflows
               (workflow_id, name, description, agent_ids, task_ids,
                started_at, completed_at, result, total_cost_usd, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (wf.workflow_id, wf.name, wf.description,
             json.dumps(wf.agent_ids), json.dumps(wf.task_ids),
             wf.started_at.isoformat(),
             wf.completed_at.isoformat() if wf.completed_at else None,
             wf.result.value, wf.total_cost_usd, json.dumps(wf.metadata))
        )


def get_workflows(start_date: Optional[datetime] = None,
                  end_date: Optional[datetime] = None) -> list[WorkflowRecord]:
    clauses, params = [], []
    if start_date:
        clauses.append("started_at >= %s")
        params.append(start_date.isoformat())
    if end_date:
        clauses.append("started_at <= %s")
        params.append(end_date.isoformat())
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM workflows{where} ORDER BY started_at DESC", params
        ).fetchall()
    return [_row_to_workflow(r) for r in rows]


def _row_to_workflow(row) -> WorkflowRecord:
    return WorkflowRecord(
        workflow_id=row["workflow_id"], name=row["name"],
        description=row["description"],
        agent_ids=json.loads(row["agent_ids"]),
        task_ids=json.loads(row["task_ids"]),
        started_at=_parse_iso_datetime(row["started_at"]),
        completed_at=_parse_iso_datetime(row["completed_at"]) if row["completed_at"] else None,
        result=TaskResult(row["result"]),
        total_cost_usd=row["total_cost_usd"],
        metadata=json.loads(row["metadata"])
    )


def get_workflow_by_request_id(request_id: str) -> Optional[WorkflowRecord]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM workflows WHERE metadata LIKE %s "
            "ORDER BY started_at DESC LIMIT 1",
            (f'%"request_id": "{request_id}"%',)
        ).fetchone()
    return _row_to_workflow(row) if row else None


def get_tasks_by_workflow(workflow_id: str) -> list[TaskRecord]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM tasks WHERE workflow_id = %s ORDER BY started_at ASC",
            (workflow_id,)
        ).fetchall()
    return [_row_to_task(r) for r in rows]


# ── Scenario CRUD ─────────────────────────────────────────────────────────────

def upsert_scenario(scenario: ScenarioConfig) -> None:
    now = datetime.utcnow().isoformat()
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO scenarios
               (scenario_id, name, description, status, team, pipeline, cost,
                created_at, updated_at, metadata)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT(scenario_id) DO UPDATE SET
                   name        = EXCLUDED.name,
                   description = EXCLUDED.description,
                   status      = EXCLUDED.status,
                   team        = EXCLUDED.team,
                   pipeline    = EXCLUDED.pipeline,
                   cost        = EXCLUDED.cost,
                   updated_at  = EXCLUDED.updated_at,
                   metadata    = EXCLUDED.metadata""",
            (
                scenario.scenario_id, scenario.name, scenario.description,
                scenario.status.value,
                json.dumps(scenario.team.model_dump()),
                json.dumps([s.model_dump() for s in scenario.pipeline]),
                json.dumps(scenario.cost.model_dump()),
                scenario.created_at.isoformat(), now,
                json.dumps(scenario.metadata),
            ),
        )


def get_scenario(scenario_id: str) -> Optional[ScenarioConfig]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM scenarios WHERE scenario_id = %s", (scenario_id,)
        ).fetchone()
    return _row_to_scenario(row) if row else None


def get_all_scenarios(status: Optional[str] = None) -> list[ScenarioConfig]:
    clauses, params = [], []
    if status:
        clauses.append("status = %s")
        params.append(status)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM scenarios{where} ORDER BY updated_at DESC", params
        ).fetchall()
    return [_row_to_scenario(r) for r in rows]


def delete_scenario(scenario_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM scenarios WHERE scenario_id = %s", (scenario_id,))


def update_scenario_status(scenario_id: str, status: ScenarioStatus) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE scenarios SET status = %s, updated_at = %s WHERE scenario_id = %s",
            (status.value, datetime.utcnow().isoformat(), scenario_id),
        )


def _row_to_scenario(row) -> ScenarioConfig:
    team_data     = json.loads(row["team"])
    pipeline_data = json.loads(row["pipeline"])
    cost_data     = json.loads(row["cost"])
    return ScenarioConfig(
        scenario_id = row["scenario_id"],
        name        = row["name"],
        description = row["description"],
        status      = ScenarioStatus(row["status"]),
        team        = TeamConfig(**team_data),
        pipeline    = [PipelineStep(**s) for s in pipeline_data],
        cost        = CostConfig(**cost_data),
        created_at  = datetime.fromisoformat(row["created_at"]),
        updated_at  = datetime.fromisoformat(row["updated_at"]),
        metadata    = json.loads(row["metadata"]),
    )


# ── User CRUD ─────────────────────────────────────────────────────────────────

def create_user(user: User) -> None:
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO users
               (user_id, username, hashed_password, role, is_active, created_at, last_login)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (
                user.user_id, user.username, user.hashed_password,
                user.role.value, int(user.is_active),
                user.created_at.isoformat(),
                user.last_login.isoformat() if user.last_login else None,
            ),
        )


def get_user_by_username(username: str) -> Optional[User]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = %s", (username,)
        ).fetchone()
    return _row_to_user(row) if row else None


def get_user_by_id(user_id: str) -> Optional[User]:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE user_id = %s", (user_id,)
        ).fetchone()
    return _row_to_user(row) if row else None


def get_all_users() -> list[User]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
    return [_row_to_user(r) for r in rows]


def update_user_status(user_id: str, is_active: bool) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET is_active = %s WHERE user_id = %s",
            (int(is_active), user_id),
        )


def update_user_role(user_id: str, role: UserRole) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET role = %s WHERE user_id = %s",
            (role.value, user_id),
        )


def update_user_password(user_id: str, hashed_password: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET hashed_password = %s WHERE user_id = %s",
            (hashed_password, user_id),
        )


def record_last_login(username: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET last_login = %s WHERE username = %s",
            (datetime.utcnow().isoformat(), username),
        )


def delete_user(user_id: str) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM users WHERE user_id = %s", (user_id,))


def user_exists(username: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT 1 FROM users WHERE LOWER(username) = LOWER(%s)", (username,)
        ).fetchone()
    return row is not None


def _row_to_user(row) -> User:
    return User(
        user_id         = row["user_id"],
        username        = row["username"],
        hashed_password = row["hashed_password"],
        role            = UserRole(row["role"]),
        is_active       = bool(row["is_active"]),
        created_at      = datetime.fromisoformat(row["created_at"]),
        last_login      = datetime.fromisoformat(row["last_login"]) if row["last_login"] else None,
    )


# ── Demo Data Seeder ──────────────────────────────────────────────────────────

def _insert_demo_canonical_event(
    conn,
    *,
    agent_id: str,
    source_event_type: str,
    ctx: dict,
    received_at: datetime,
    quality_score: float = 0.82,
    passed_thresholds: bool = True,
    workflow_id: Optional[str] = None,
) -> str:
    """Insert a signed canonical event for Quality tab demos (outreach + reviews)."""
    ecl_api_key = os.getenv("ECL_API_KEY", "")
    agent_row = conn.execute(
        "SELECT vendor, model_name, trust_level FROM agents WHERE agent_id = %s",
        (agent_id,),
    ).fetchone()
    vendor = str((agent_row or {}).get("vendor") or "anthropic")
    model = (agent_row or {}).get("model_name")
    trust_level = int((agent_row or {}).get("trust_level", 0) or 0)
    wf_id = workflow_id or f"demo-wf-{agent_id[-4:]}"

    prev_row = conn.execute(
        "SELECT payload_hash FROM canonical_events ORDER BY received_at DESC LIMIT 1"
    ).fetchone()
    prev_hash = prev_row["payload_hash"] if prev_row else None

    raw_payload = {
        "workflow_id": wf_id,
        "ctx": ctx,
        "prevEventHash": prev_hash,
        "qualityConfidence": quality_score,
    }
    event = build_event(
        org_id=ecl_api_key,
        agent_id=agent_id,
        source=vendor,
        source_event_type=source_event_type,
        raw_payload=raw_payload,
        model=model,
        trust_level=trust_level,
        quality_score=quality_score,
    )
    if not verify_event(event):
        raise ValueError(f"Canonical event signature verification failed for {agent_id}")

    raw_payload["auditHash"] = event.payload_hash
    received_iso = received_at.isoformat()
    conn.execute(
        """INSERT INTO canonical_events
           (event_id, event_version, received_at, vendor, source, source_event_type,
            org_id, agent_id, request_id, customer_id, model, input_tokens, output_tokens,
            trust_level, quality_score, raw_payload, payload_hash, hmac_signature,
            workflow_id, audit_hash, prev_event_hash, wall_ms, vendor_cost_usd, passed_thresholds)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                   %s, %s, %s, %s, %s, %s)
           ON CONFLICT (event_id) DO NOTHING""",
        (
            event.event_id,
            event.event_version,
            received_iso,
            event.vendor,
            event.source,
            event.source_event_type,
            event.org_id,
            event.agent_id,
            event.request_id,
            event.customer_id,
            event.model,
            event.input_tokens,
            event.output_tokens,
            event.trust_level,
            event.quality_score,
            json.dumps(raw_payload),
            event.payload_hash,
            event.hmac_signature,
            wf_id,
            event.payload_hash,
            prev_hash,
            1200.0,
            0.0042,
            passed_thresholds,
        ),
    )
    return event.event_id


def _seed_quality_tab_samples(conn) -> dict[str, int]:
    """Outreach drafts + governance queue/history for Tasks & Reviews tabs."""
    now = datetime.utcnow()
    outreach_agents = ["agent-data-01", "agent-search-01", "agent-coder-01"]
    channels = ["LinkedIn", "Email", "Slack"]
    candidates = [
        "Jordan Lee",
        "Samira Patel",
        "Alex Chen",
        "Morgan Blake",
        "Riley Santos",
        "Casey Nguyen",
        "Taylor Brooks",
        "Jamie Ortiz",
    ]
    outreach_count = 0
    for i, name in enumerate(candidates):
        agent_id = outreach_agents[i % len(outreach_agents)]
        captured = now - timedelta(hours=6 + i * 5)
        _insert_demo_canonical_event(
            conn,
            agent_id=agent_id,
            source_event_type="response_draft",
            received_at=captured,
            quality_score=round(0.72 + (i % 5) * 0.05, 2),
            ctx={
                "skill": "response_draft",
                "candidateName": name,
                "channel": channels[i % len(channels)],
                "messageText": (
                    f"Hi {name.split()[0]} — noticed your work on agent orchestration. "
                    "Would love to share how FuzeBox governs fleet outcomes."
                ),
                "status": "Sent" if i % 3 else "Draft",
                "humanReview": "auto" if i % 4 else "queued",
                "personalizationScore": round(0.72 + (i % 5) * 0.05, 2),
                "trustTier": "T2_verified",
            },
        )
        outreach_count += 1

    review_agents = ["agent-reviewer-01", "agent-planner-01", "agent-deploy-01"]
    skills = ["billing_inquiry", "refund_request", "escalation_handling", "response_draft"]
    review_states = [
        ("pending", "human_gate", False),
        ("pending", "blocked", False),
        ("queued", "human_gate", False),
        ("verified", "allowed", True),
        ("verified", "allowed", True),
        ("rejected", "blocked", False),
        ("rejected", "blocked", False),
        ("verified", "allowed", True),
    ]
    review_count = 0
    for i, (human_review, policy, passed) in enumerate(review_states):
        agent_id = review_agents[i % len(review_agents)]
        captured = now - timedelta(hours=2 + i * 8)
        event_id = _insert_demo_canonical_event(
            conn,
            agent_id=agent_id,
            source_event_type=skills[i % len(skills)],
            received_at=captured,
            quality_score=round(0.55 + (i % 4) * 0.1, 2),
            passed_thresholds=passed,
            ctx={
                "skill": skills[i % len(skills)],
                "humanReview": human_review,
                "policyOutcome": policy,
                "reviewerName": "Operations",
                "humanUserId": "demo-reviewer",
                "trustTier": "T1_observed",
            },
        )
        if human_review in ("verified", "rejected"):
            decision = "Advance" if human_review == "verified" else "Reject"
            insert_governance_decision(
                decision_id=f"demo-dec-{i}-{event_id[:8]}",
                event_id=event_id,
                decision=decision,
                human_review=human_review,
                fired_at=captured.isoformat(),
                actor="demo-reviewer",
                policy_outcome=policy,
                rationale=f"Demo seed decision: {decision}",
                prev_trust_tier="T1_observed",
                new_trust_tier="T2_verified" if decision == "Advance" else "T1_observed",
                workflow_id=f"demo-wf-{agent_id[-4:]}",
            )
        review_count += 1

    return {"outreach_events": outreach_count, "review_events": review_count}


def seed_demo_data():
    """Populate the database with realistic demo agent workflow data."""
    init_db()

    agents_def = [
        Agent(agent_id="agent-coder-01", name="CodeGen Alpha",
              description="Primary code generation agent",
              skills=["code_generation", "code_review", "refactoring", "testing"],
              permissions=["read_repo", "write_files", "run_tests", "create_pr"],
              group="engineering", status=AgentStatus.ACTIVE,
              cost_per_1k_input=0.003, cost_per_1k_output=0.015, model_name="claude-sonnet-4-20250514"),
        Agent(agent_id="agent-coder-02", name="CodeGen Beta",
              description="Secondary code generation agent for parallel tasks",
              skills=["code_generation", "debugging", "testing"],
              permissions=["read_repo", "write_files", "run_tests"],
              group="engineering", status=AgentStatus.ACTIVE,
              cost_per_1k_input=0.003, cost_per_1k_output=0.015, model_name="claude-sonnet-4-20250514"),
        Agent(agent_id="agent-reviewer-01", name="Review Sentinel",
              description="Code review and quality assurance agent",
              skills=["code_review", "security_audit", "performance_analysis"],
              permissions=["read_repo", "comment_pr", "approve_pr"],
              group="quality", status=AgentStatus.ACTIVE,
              cost_per_1k_input=0.01, cost_per_1k_output=0.03, model_name="claude-opus-4-20250514"),
        Agent(agent_id="agent-data-01", name="Data Wrangler",
              description="Data extraction, transformation, and analysis agent",
              skills=["data_extraction", "data_transformation", "summarization", "sql_queries"],
              permissions=["read_db", "read_api", "write_files"],
              group="data", status=AgentStatus.ACTIVE,
              cost_per_1k_input=0.0005, cost_per_1k_output=0.0015, model_name="claude-haiku-4-5-20251001"),
        Agent(agent_id="agent-planner-01", name="Orchestrator Prime",
              description="Workflow planning and task delegation agent",
              skills=["planning", "task_decomposition", "resource_allocation", "monitoring"],
              permissions=["read_repo", "assign_tasks", "monitor_agents", "escalate"],
              group="orchestration", status=AgentStatus.ACTIVE,
              cost_per_1k_input=0.01, cost_per_1k_output=0.03, model_name="claude-opus-4-20250514"),
        Agent(agent_id="agent-search-01", name="Research Scout",
              description="Information retrieval and research agent",
              skills=["web_search", "document_analysis", "summarization"],
              permissions=["read_api", "web_access", "read_docs"],
              group="research", status=AgentStatus.ACTIVE,
              cost_per_1k_input=0.0005, cost_per_1k_output=0.0015, model_name="claude-haiku-4-5-20251001"),
        Agent(agent_id="agent-deploy-01", name="Deploy Guardian",
              description="CI/CD and deployment automation agent",
              skills=["ci_cd", "infrastructure", "monitoring", "rollback"],
              permissions=["read_repo", "run_pipeline", "deploy_staging", "deploy_prod"],
              group="devops", status=AgentStatus.ACTIVE,
              cost_per_1k_input=0.003, cost_per_1k_output=0.015, model_name="claude-sonnet-4-20250514"),
        Agent(agent_id="agent-legacy-01", name="Legacy Processor",
              description="Deprecated agent kept for reference",
              skills=["data_extraction"],
              permissions=["read_db"],
              group="data", status=AgentStatus.INACTIVE,
              cost_per_1k_input=0.0005, cost_per_1k_output=0.0015, model_name="claude-haiku-4-5-20251001"),
    ]

    for agent in agents_def:
        upsert_agent(agent)

    task_types = {
        "code_generation": {"skills": ["code_generation"], "perms": ["read_repo", "write_files"],
                            "agents": ["agent-coder-01", "agent-coder-02"]},
        "code_review": {"skills": ["code_review"], "perms": ["read_repo", "comment_pr"],
                        "agents": ["agent-reviewer-01", "agent-coder-01"]},
        "bug_fix": {"skills": ["debugging", "code_generation"], "perms": ["read_repo", "write_files", "run_tests"],
                    "agents": ["agent-coder-01", "agent-coder-02"]},
        "data_extraction": {"skills": ["data_extraction", "sql_queries"], "perms": ["read_db"],
                            "agents": ["agent-data-01"]},
        "data_analysis": {"skills": ["data_transformation", "summarization"], "perms": ["read_db", "write_files"],
                          "agents": ["agent-data-01"]},
        "research": {"skills": ["web_search", "summarization"], "perms": ["web_access", "read_docs"],
                     "agents": ["agent-search-01"]},
        "planning": {"skills": ["planning", "task_decomposition"], "perms": ["assign_tasks"],
                     "agents": ["agent-planner-01"]},
        "deployment": {"skills": ["ci_cd", "infrastructure"], "perms": ["run_pipeline", "deploy_staging"],
                       "agents": ["agent-deploy-01"]},
        "security_audit": {"skills": ["security_audit"], "perms": ["read_repo"],
                           "agents": ["agent-reviewer-01"]},
        "test_generation": {"skills": ["testing", "code_generation"], "perms": ["read_repo", "write_files", "run_tests"],
                            "agents": ["agent-coder-01", "agent-coder-02"]},
        "response_draft": {"skills": ["summarization"], "perms": ["read_api"],
                           "agents": ["agent-data-01", "agent-search-01"]},
    }

    agent_map = {a.agent_id: a for a in agents_def}
    now = datetime.utcnow()
    all_tasks = []
    all_spans = []
    all_workflows = []

    for day_offset in range(30, 0, -1):
        day_start = now - timedelta(days=day_offset)
        num_workflows = random.randint(2, 5)

        for _ in range(num_workflows):
            wf_id = str(uuid.uuid4())[:12]
            wf_start = day_start + timedelta(hours=random.uniform(0, 20))
            wf_task_ids = []
            wf_agent_ids = set()
            wf_cost = 0.0
            trace_id = str(uuid.uuid4())[:16]

            num_tasks = random.randint(2, 6)
            task_offset_ms = 0

            plan_span = SpanRecord(
                trace_id=trace_id, span_id=str(uuid.uuid4())[:12],
                agent_id="agent-planner-01", operation="workflow_planning",
                started_at=wf_start, ended_at=wf_start + timedelta(milliseconds=random.randint(200, 800)),
                duration_ms=random.uniform(200, 800), status="OK",
                attributes={"workflow_id": wf_id, "num_tasks": num_tasks}
            )
            all_spans.append(plan_span)
            parent_span = plan_span.span_id

            for t_idx in range(num_tasks):
                tt = random.choice(list(task_types.keys()))
                tt_def = task_types[tt]
                agent_id = random.choice(tt_def["agents"])
                agent = agent_map[agent_id]
                wf_agent_ids.add(agent_id)

                task_start = wf_start + timedelta(milliseconds=task_offset_ms)
                latency = random.uniform(500, 15000)
                task_end = task_start + timedelta(milliseconds=latency)
                task_offset_ms += latency + random.uniform(100, 500)

                r = random.random()
                if r < 0.72:
                    result = TaskResult.SUCCESS
                    quality = round(random.uniform(0.7, 1.0), 3)
                elif r < 0.85:
                    result = TaskResult.PARTIAL
                    quality = round(random.uniform(0.3, 0.7), 3)
                elif r < 0.95:
                    result = TaskResult.FAILURE
                    quality = round(random.uniform(0.0, 0.3), 3)
                else:
                    result = TaskResult.TIMEOUT
                    quality = 0.0
                    latency = 30000

                input_tokens = random.randint(500, 8000)
                output_tokens = random.randint(200, 4000)
                total_tokens = input_tokens + output_tokens
                cost = (input_tokens / 1000 * agent.cost_per_1k_input +
                        output_tokens / 1000 * agent.cost_per_1k_output)
                cost = round(cost, 6)
                wf_cost += cost

                task_id = str(uuid.uuid4())[:12]
                wf_task_ids.append(task_id)

                task = TaskRecord(
                    task_id=task_id, agent_id=agent_id, workflow_id=wf_id,
                    task_type=tt, description=f"Auto-generated {tt} task",
                    required_skills=tt_def["skills"], required_permissions=tt_def["perms"],
                    result=result, started_at=task_start, completed_at=task_end,
                    latency_ms=round(latency, 2),
                    input_tokens=input_tokens, output_tokens=output_tokens,
                    total_tokens=total_tokens, cost_usd=cost,
                    quality_score=quality,
                    metadata={"workflow_id": wf_id, "task_index": t_idx}
                )
                all_tasks.append(task)

                task_span = SpanRecord(
                    trace_id=trace_id, span_id=str(uuid.uuid4())[:12],
                    parent_span_id=parent_span, agent_id=agent_id,
                    operation=f"execute_{tt}",
                    started_at=task_start, ended_at=task_end,
                    duration_ms=round(latency, 2),
                    status="OK" if result in (TaskResult.SUCCESS, TaskResult.PARTIAL) else "ERROR",
                    attributes={"task_id": task_id, "task_type": tt, "result": result.value}
                )
                all_spans.append(task_span)

                sub_ops = ["initialize", "process", "validate", "finalize"]
                sub_start = task_start
                for sop in sub_ops:
                    sub_dur = latency / len(sub_ops) * random.uniform(0.5, 1.5)
                    sub_end = sub_start + timedelta(milliseconds=sub_dur)
                    sub_span = SpanRecord(
                        trace_id=trace_id, span_id=str(uuid.uuid4())[:12],
                        parent_span_id=task_span.span_id, agent_id=agent_id,
                        operation=f"{tt}.{sop}",
                        started_at=sub_start, ended_at=sub_end,
                        duration_ms=round(sub_dur, 2), status="OK",
                        attributes={"sub_operation": sop}
                    )
                    all_spans.append(sub_span)
                    sub_start = sub_end

            task_results = [t.result for t in all_tasks[-num_tasks:]]
            if all(r == TaskResult.SUCCESS for r in task_results):
                wf_result = TaskResult.SUCCESS
            elif any(r == TaskResult.FAILURE for r in task_results):
                wf_result = TaskResult.FAILURE
            else:
                wf_result = TaskResult.PARTIAL

            wf_end = wf_start + timedelta(milliseconds=task_offset_ms)
            workflow = WorkflowRecord(
                workflow_id=wf_id, name=f"Workflow-{day_offset:02d}-{_}",
                description="Auto-generated workflow",
                agent_ids=list(wf_agent_ids), task_ids=wf_task_ids,
                started_at=wf_start, completed_at=wf_end,
                result=wf_result, total_cost_usd=round(wf_cost, 6),
                metadata={"day_offset": day_offset}
            )
            all_workflows.append(workflow)

    for task in all_tasks:
        insert_task(task)
    for span in all_spans:
        insert_span(span)
    for wf in all_workflows:
        insert_workflow(wf)

    quality_samples = {"outreach_events": 0, "review_events": 0}
    with get_connection() as conn:
        quality_samples = _seed_quality_tab_samples(conn)

    return {
        "agents": len(agents_def),
        "tasks": len(all_tasks),
        "spans": len(all_spans),
        "workflows": len(all_workflows),
        **quality_samples,
    }
