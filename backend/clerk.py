"""Clerk auth helpers — JWT validation + user fetch.

We verify session JWTs against Clerk's public JWKS (no roundtrip per
request — keys are cached). When a user signs in for the first time,
the JWT only carries the Clerk user_id (`sub`) and exp/iat — to get
their email and name we hit Clerk's Backend API once with the secret
key, then store them in our own users table (Sprint 2.5).
"""

from __future__ import annotations

import base64
import os
from typing import Any, Optional

import httpx
import jwt
from dotenv import load_dotenv
from jwt import PyJWKClient

# Idempotent — Railway env vars take priority; .env is for local dev.
load_dotenv()


def _derive_instance_url() -> str:
    """Decode the Clerk instance hostname out of the publishable key.

    pk_test_<base64-of-'<host>$'> → 'https://<host>'.
    Clerk sets `iss` to this same URL, and JWKS lives at
    `<host>/.well-known/jwks.json`.
    """
    pk = os.getenv("VITE_CLERK_PUBLISHABLE_KEY") or os.getenv("CLERK_PUBLISHABLE_KEY")
    if not pk:
        raise RuntimeError(
            "VITE_CLERK_PUBLISHABLE_KEY (or CLERK_PUBLISHABLE_KEY) not set"
        )
    # pk_test_xxx → xxx
    parts = pk.split("_", 2)
    if len(parts) < 3:
        raise RuntimeError(f"Unexpected publishable key format: {pk!r}")
    b64 = parts[2]
    pad = "=" * (-len(b64) % 4)
    decoded = base64.b64decode(b64 + pad).decode("utf-8")
    host = decoded.rstrip("$")
    return f"https://{host}"


_INSTANCE_URL = _derive_instance_url()
_ISSUER = _INSTANCE_URL
_JWKS_URL = f"{_INSTANCE_URL}/.well-known/jwks.json"
_JWKS_CLIENT = PyJWKClient(_JWKS_URL)

_SECRET = os.getenv("CLERK_SECRET_KEY")
if not _SECRET:
    raise RuntimeError("CLERK_SECRET_KEY not set")

_async_client = httpx.AsyncClient(
    base_url="https://api.clerk.com/v1",
    headers={"Authorization": f"Bearer {_SECRET}"},
    timeout=10.0,
)


def verify_jwt(token: str) -> dict[str, Any]:
    """Verify a Clerk session JWT against the public JWKS.

    Raises jwt.InvalidTokenError on any failure (bad signature, expired,
    wrong issuer, etc.). Returns the decoded payload.
    """
    signing_key = _JWKS_CLIENT.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        issuer=_ISSUER,
        # Clerk's default session JWT does not set 'aud' — skip the check.
        options={"verify_aud": False},
    )


async def fetch_clerk_user(clerk_user_id: str) -> dict[str, Any]:
    """Fetch a user's profile from Clerk's Backend API."""
    r = await _async_client.get(f"/users/{clerk_user_id}")
    r.raise_for_status()
    return r.json()


def primary_email(clerk_user: dict[str, Any]) -> Optional[str]:
    """Pick the primary email out of Clerk's user JSON."""
    primary_id = clerk_user.get("primary_email_address_id")
    addrs = clerk_user.get("email_addresses") or []
    for a in addrs:
        if a.get("id") == primary_id:
            return a.get("email_address")
    return addrs[0].get("email_address") if addrs else None


def display_name(clerk_user: dict[str, Any]) -> str:
    """Best-effort display name from Clerk profile."""
    first = (clerk_user.get("first_name") or "").strip()
    last = (clerk_user.get("last_name") or "").strip()
    if first or last:
        return f"{first} {last}".strip()
    if clerk_user.get("username"):
        return clerk_user["username"]
    email = primary_email(clerk_user) or ""
    return email.split("@")[0] or "User"
