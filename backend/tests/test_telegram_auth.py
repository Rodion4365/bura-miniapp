from contextlib import asynccontextmanager

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.database import AsyncSessionMaker, Base, data_engine
from app.models import User
from app.schemas import TelegramUser
from app.services.auth import get_or_create_user


@pytest_asyncio.fixture(autouse=True, scope="module")
async def prepare_db():
    async with data_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with data_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.mark.asyncio
async def test_get_or_create_user_accepts_context_manager():
    @asynccontextmanager
    async def session_cm():
        async with AsyncSessionMaker() as session:
            yield session

    telegram_user = TelegramUser(id=123, username="alice")

    user = await get_or_create_user(session_cm(), telegram_user)
    assert user.telegram_user_id == "123"

    user_again = await get_or_create_user(session_cm(), telegram_user)
    assert user_again.id == user.id

    async with AsyncSessionMaker() as session:
        fetched = await session.execute(select(User).where(User.telegram_user_id == "123"))
        assert fetched.scalar_one().username == "alice"
