"""Users — list (open) and current-user (auth-stub).

GET /api/users is intentionally open: the frontend dropdown needs to
show available users *before* the user picks one. Email and role are
withheld here; full info is only returned by GET /api/me.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.deps import get_current_user
from backend.orm import User
from backend.schemas import UserListItem, UserResponse

router = APIRouter(prefix="/api", tags=["users"])


@router.get("/users", response_model=list[UserListItem])
async def list_users(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(select(User).order_by(User.name))
    ).scalars().all()
    return [UserListItem.model_validate(u) for u in rows]


@router.get("/me", response_model=UserResponse)
async def get_me(me: User = Depends(get_current_user)):
    return UserResponse.model_validate(me)
