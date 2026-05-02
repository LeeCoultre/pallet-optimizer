"""FastAPI dependencies.

Sprint 1 auth stub: caller passes X-User-Id (UUID) header. The same
dependency signature stays in Sprint 2; only its body swaps to JWT.
"""

from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.orm import User, UserRole


async def get_current_user(
    x_user_id: UUID = Header(..., alias="X-User-Id"),
    db: AsyncSession = Depends(get_db),
) -> User:
    user = (
        await db.execute(select(User).where(User.id == x_user_id))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    return user


async def require_admin(
    user: User = Depends(get_current_user),
) -> User:
    if user.role != UserRole.admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user
