"""Async SQLAlchemy engine, session factory, and FastAPI dependency.

DATABASE_URL is read from the environment. Locally it comes from .env
(via python-dotenv); on Railway it's injected by the platform as a
reference variable from the Postgres service.

The URL Railway gives is `postgresql://...`. We rewrite it to
`postgresql+asyncpg://...` for the async engine used by FastAPI.
Alembic uses its own sync engine (see alembic/env.py) with psycopg2.
"""

import os
from typing import AsyncGenerator

from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

# Locally: load .env from project root. On Railway: no-op (file absent).
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy .env.example to .env and fill it, "
        "or set the variable in your deploy environment."
    )

# Async driver requires the asyncpg dialect prefix.
ASYNC_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    ASYNC_URL,
    echo=False,
    pool_pre_ping=True,   # Railway proxy may drop idle connections
    pool_size=5,
    max_overflow=10,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield a session, ensure cleanup on exit."""
    async with AsyncSessionLocal() as session:
        yield session
