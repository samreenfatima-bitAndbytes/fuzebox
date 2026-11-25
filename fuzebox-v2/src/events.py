"""
Canonical Event v1
──────────────────
Every agent interaction — regardless of originating vendor — is normalised into
this envelope before being persisted.

Integrity guarantee
  payload_hash   = SHA-256( canonical_json(raw_payload) )
  hmac_signature = HMAC-SHA256( CANONICAL_EVENT_SECRET,
                    event_id + "\\n" + received_at_iso + "\\n" + org_id + "\\n" +
                    agent_id + "\\n" + vendor + "\\n" + payload_hash )

Any consumer can call verify_event() to detect tampering.
"""

import hashlib
import hmac as _hmac
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field

# ── Shared signing secret ───────────────────────────────────────────────────────

_SECRET = os.environ.get("CANONICAL_EVENT_SECRET", "dev-secret-change-in-production")

# ── Vendor constants ────────────────────────────────────────────────────────────

VENDOR_ANTHROPIC = "anthropic"
VENDOR_OPENAI    = "openai"
VENDOR_COPILOT   = "copilot"
VENDOR_INTERNAL  = "internal"
VENDOR_UNKNOWN   = "unknown"


def detect_vendor(source: str, metadata: Optional[dict] = None) -> str:
    """Infer vendor from source string or metadata hints."""
    src  = (source or "").lower()
    meta = metadata or {}

    if any(k in src for k in ("anthropic", "claude")):
        return VENDOR_ANTHROPIC
    if any(k in src for k in ("openai", "gpt", "chatgpt", "azure")):
        return VENDOR_OPENAI
    if "copilot" in src:
        return VENDOR_COPILOT
    if src in ("api", "internal", "dashboard", "sample_test", "webhook"):
        return VENDOR_INTERNAL

    # Fallback: check model hint in metadata
    model = str(meta.get("model", "")).lower()
    if "claude" in model:
        return VENDOR_ANTHROPIC
    if any(k in model for k in ("gpt", "o1", "o3")):
        return VENDOR_OPENAI

    return VENDOR_UNKNOWN


# ── Signing primitives ──────────────────────────────────────────────────────────

def _payload_hash(raw_payload: dict) -> str:
    """SHA-256 of the canonical (sorted-keys, compact) JSON of the payload."""
    canonical = json.dumps(raw_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _signing_bytes(
    event_id:    str,
    received_at: str,
    org_id:      str,
    agent_id:    str,
    vendor:      str,
    ph:          str,
) -> bytes:
    return "\n".join([event_id, received_at, org_id, agent_id, vendor, ph]).encode()


def _sign(data: bytes, secret: str) -> str:
    return _hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()


# ── Model ───────────────────────────────────────────────────────────────────────

class CanonicalEvent(BaseModel):
    """Normalised, HMAC-signed envelope for every agent interaction."""

    event_id:          str      = Field(default_factory=lambda: str(uuid.uuid4()))
    event_version:     str      = "1"
    received_at:       datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    # Provenance
    vendor:            str
    source:            str
    source_event_type: str = "request"

    # Identity
    org_id:            str
    agent_id:          str
    request_id:        Optional[str]   = None
    customer_id:       Optional[str]   = None

    # Economics (populated on completion; 0 at receipt time)
    model:             Optional[str]   = None
    input_tokens:      int             = 0
    output_tokens:     int             = 0

    # Trust snapshot at time of event
    trust_level:       int             = 0

    # Quality (populated on completion)
    quality_score:     Optional[float] = None

    # Integrity
    raw_payload:       dict
    payload_hash:      str
    hmac_signature:    str


# ── Public API ──────────────────────────────────────────────────────────────────

def build_event(
    *,
    org_id:            str,
    agent_id:          str,
    source:            str,
    raw_payload:       dict,
    request_id:        Optional[str]   = None,
    customer_id:       Optional[str]   = None,
    model:             Optional[str]   = None,
    input_tokens:      int             = 0,
    output_tokens:     int             = 0,
    trust_level:       int             = 0,
    quality_score:     Optional[float] = None,
    source_event_type: str             = "request",
    secret:            str             = _SECRET,
) -> CanonicalEvent:
    """Create, sign, and return a CanonicalEvent."""
    event_id    = str(uuid.uuid4())
    received_at = datetime.now(timezone.utc)
    vendor      = detect_vendor(source, raw_payload.get("metadata"))
    ph          = _payload_hash(raw_payload)
    sig         = _sign(
        _signing_bytes(event_id, received_at.isoformat(), org_id, agent_id, vendor, ph),
        secret,
    )
    return CanonicalEvent(
        event_id          = event_id,
        received_at       = received_at,
        vendor            = vendor,
        source            = source,
        source_event_type = source_event_type,
        org_id            = org_id,
        agent_id          = agent_id,
        request_id        = request_id,
        customer_id       = customer_id,
        model             = model,
        input_tokens      = input_tokens,
        output_tokens     = output_tokens,
        trust_level       = trust_level,
        quality_score     = quality_score,
        raw_payload       = raw_payload,
        payload_hash      = ph,
        hmac_signature    = sig,
    )


def verify_event(event: CanonicalEvent, secret: str = _SECRET) -> bool:
    """Return True iff the event's HMAC signature is valid."""
    ph = _payload_hash(event.raw_payload)
    expected = _sign(
        _signing_bytes(
            event.event_id,
            event.received_at.isoformat(),
            event.org_id,
            event.agent_id,
            event.vendor,
            ph,
        ),
        secret,
    )
    return _hmac.compare_digest(event.hmac_signature, expected)
