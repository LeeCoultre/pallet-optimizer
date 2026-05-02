"""FastAPI dependencies — Clerk JWT auth.

The `Authorization: Bearer <jwt>` header is verified against Clerk's
public JWKS. On first request from a new user, a row is lazy-created
in our users table (Clerk owns the auth, we own the role + audit log).

INITIAL_ADMIN_EMAIL env var picks the bootstrap admin: the first user
to sign in with that email gets role='admin'. Everyone else starts as
'user'; flip them via the admin panel later.
"""

import os
from datetime import datetime, timezone
from typing import Optional

import jwt as pyjwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.clerk import (
    display_name,
    fetch_clerk_user,
    primary_email,
    verify_jwt,
)
from backend.database import get_db
from backend.orm import User, UserRole


async def _provision_user(clerk_id: str, db: AsyncSession) -> User:
    """First-login lazy-create. Pulls email/name from Clerk Backend API
    once, stores them locally so subsequent requests don't roundtrip."""
    try:
        cu = await fetch_clerk_user(clerk_id)
    except Exception as e:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            f"Could not fetch Clerk user: {e}",
        )
    email = primary_email(cu)
    if not email:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Clerk user has no primary email"
        )
    name = display_name(cu)
    initial_admin = (os.getenv("INITIAL_ADMIN_EMAIL") or "").strip().lower()
    is_admin = email.lower() == initial_admin and bool(initial_admin)

    user = User(
        clerk_id=clerk_id,
        email=email,
        name=name,
        role=UserRole.admin if is_admin else UserRole.user,
        last_login_at=datetime.now(timezone.utc),
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:
        # Race: another request just created the same row. Pick up theirs.
        await db.rollback()
        user = (
            await db.execute(select(User).where(User.clerk_id == clerk_id))
        ).scalar_one()
    else:
        await db.refresh(user)
    return user


async def get_current_user(
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Missing Bearer token"
        )
    token = authorization[len("Bearer "):]
    try:
        payload = verify_jwt(token)
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}"
        )

    clerk_id = payload.get("sub")
    if not clerk_id:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Token missing 'sub'"
        )

    user = (
        await db.execute(select(User).where(User.clerk_id == clerk_id))
    ).scalar_one_or_none()
    if user is None:
        user = await _provision_user(clerk_id, db)
    return user


async def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user
