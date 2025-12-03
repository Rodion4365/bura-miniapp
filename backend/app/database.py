import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./app.db")


data_engine = create_async_engine(DATABASE_URL, future=True)
AsyncSessionMaker = async_sessionmaker(data_engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionMaker() as session:
        yield session


async def init_db() -> None:
    async with data_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
