"""
JWT Bearer Token Authentication.

Public API
──────────
    AuthContext          — dataclass returned by require_auth / require_admin
    register_org()       — create a new organisation + first admin user (kept, inactive)
    authenticate_user()  — verify credentials, return User or None
    create_access_token()— mint a signed JWT
    require_auth         — FastAPI dependency → AuthContext
    require_admin        — FastAPI dependency → AuthContext (admin only)
    ensure_admin_exists()— bootstrap: create default admin on first run
"""

import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

load_dotenv()

# ── Config ─────────────────────────────────────────────────────────────────────

JWT_SECRET       = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM    = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

ADMIN_USERNAME   = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD   = os.getenv("ADMIN_PASSWORD", "changeme")
ECL_API_KEY      = os.getenv("ECL_API_KEY", "")

if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET is not set in .env.\n"
        "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
    )


# ── Auth context (returned by FastAPI dependencies) ────────────────────────────

@dataclass
class AuthContext:
    username: str
    role:     str

    def is_admin(self) -> bool:
        return self.role == "admin"


# ── Password helpers ───────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


# ── Slug helper ────────────────────────────────────────────────────────────────

def _make_slug(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower().strip())
    return slug.strip("-") or "org"


# ── Organisation registration ──────────────────────────────────────────────────

def register_org(org_name: str, username: str, password: str) -> tuple["AuthContext", str, datetime]:
    """
    Create a new organisation and its first admin user in one atomic step.

    Returns (AuthContext, access_token, expires_at).
    Raises ValueError if the username or slug already exists.
    """
    from src.dashboard import db
    from src.dashboard.models import Organization, User, UserRole

    if db.user_exists(username):
        raise ValueError(f"Username '{username}' is already taken.")

    slug = _make_slug(org_name)
    # Make slug unique by appending a short suffix if needed
    base_slug = slug
    suffix = 1
    while db.org_slug_exists(slug):
        slug = f"{base_slug}-{suffix}"
        suffix += 1

    org_id = f"org-{str(uuid.uuid4())[:8]}"  # internal only, not sent to r-Potential
    org = Organization(
        org_id     = org_id,
        name       = org_name.strip(),
        slug       = slug,
        created_at = datetime.utcnow(),
        is_active  = True,
    )
    db.create_org(org)

    admin = User(
        user_id         = str(uuid.uuid4())[:12],
        username        = username.strip(),
        hashed_password = hash_password(password),
        role            = UserRole.ADMIN,
        is_active       = True,
        created_at      = datetime.utcnow(),
    )
    db.create_user(admin)

    token, expires_at = create_access_token(username, UserRole.ADMIN.value)
    ctx = AuthContext(username=username, role=UserRole.ADMIN.value)
    return ctx, token, expires_at


# ── First-run bootstrap ────────────────────────────────────────────────────────

def ensure_admin_exists() -> None:
    """
    Called once at server startup.
    Creates the default organisation and admin account if neither exist.
    """
    from src.dashboard import db
    from src.dashboard.models import Organization, User, UserRole

    # Create default org if none exist
    if not db.get_all_orgs():
        default_org = Organization(
            org_id     = "org-default",  # internal only, not sent to r-Potential
            name       = "Default Organization",
            slug       = "default",
            created_at = datetime.utcnow(),
            is_active  = True,
        )
        db.create_org(default_org)
        print("  [Auth] Default organisation created (org-default).")

    # Create admin user only when the configured username does not already exist
    # anywhere (username is globally unique in DB schema).
    if not db.user_exists(ADMIN_USERNAME):
        admin = User(
            user_id         = str(uuid.uuid4())[:12],
            username        = ADMIN_USERNAME,
            hashed_password = hash_password(ADMIN_PASSWORD),
            role            = UserRole.ADMIN,
            is_active       = True,
        )
        db.create_user(admin)
        print(f"\n  [Auth] First run — admin account created.")
        print(f"  [Auth] Username: {ADMIN_USERNAME}")
        print(f"  [Auth] Password: {ADMIN_PASSWORD}")
        if ADMIN_PASSWORD == "changeme":
            print("  [Auth] WARNING: default password detected — change it immediately.\n")
    else:
        print(f"  [Auth] Admin username '{ADMIN_USERNAME}' already exists; bootstrap skipped.")


# ── Authentication ─────────────────────────────────────────────────────────────

def authenticate_user(username: str, password: str):
    """
    Verify credentials.  Returns the User object on success, None on failure.
    Also records last_login timestamp.
    """
    from src.dashboard import db

    user = db.get_user_by_username(username)
    if not user or not user.is_active:
        return None
    if not verify_password(password, user.hashed_password):
        return None

    db.record_last_login(username)
    return user


# ── Token creation ─────────────────────────────────────────────────────────────

def create_access_token(username: str, role: str) -> tuple[str, datetime]:
    """Mint a signed JWT carrying role.  Returns (token, expires_at)."""
    expires_at = datetime.utcnow() + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {
        "sub":  username,
        "role": role,
        "exp":  expires_at,
        "iat":  datetime.utcnow(),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, expires_at


# ── FastAPI dependencies ───────────────────────────────────────────────────────

_bearer_scheme = HTTPBearer()

_UNAUTHORIZED = HTTPException(
    status_code = status.HTTP_401_UNAUTHORIZED,
    detail      = "Invalid or expired token. Call POST /auth/token to obtain a new one.",
    headers     = {"WWW-Authenticate": "Bearer"},
)


def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> AuthContext:
    """FastAPI dependency. Validates Bearer token and returns AuthContext. Raises HTTP 401 on failure."""
    from src.dashboard import db

    try:
        payload  = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise _UNAUTHORIZED
        user = db.get_user_by_username(username)
        if not user or not user.is_active:
            raise _UNAUTHORIZED
        return AuthContext(username=username, role=user.role.value)
    except JWTError:
        raise _UNAUTHORIZED


def require_admin(auth: AuthContext = Depends(require_auth)) -> AuthContext:
    """FastAPI dependency — like require_auth but also asserts admin role."""
    if not auth.is_admin():
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "Admin role required.",
        )
    return auth


def require_operator(auth: AuthContext = Depends(require_auth)) -> AuthContext:
    """Dashboard mutations — admin and operator only (not readonly)."""
    if auth.role == "readonly":
        raise HTTPException(
            status_code = status.HTTP_403_FORBIDDEN,
            detail      = "Operator role or higher required.",
        )
    return auth
