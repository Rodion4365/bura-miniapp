from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import AbstractAsyncContextManager, aclosing

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.schemas import TelegramUser


async def _unwrap_session(
    session: AsyncSession | AsyncGenerator[AsyncSession, None] | AbstractAsyncContextManager,
) -> AsyncGenerator[AsyncSession, None]:
    if isinstance(session, AsyncSession):
        yield session
    elif isinstance(session, AsyncGenerator):
        async with aclosing(session) as session_generator:
            real_session = await anext(session_generator)
            yield real_session
    else:
        async with session as real_session:  # type: ignore[func-returns-value]
            yield real_session


async def get_or_create_user(session: AsyncSession | AbstractAsyncContextManager, telegram_user: TelegramUser) -> User:
    async for real_session in _unwrap_session(session):
        result = await real_session.execute(
            select(User).where(User.telegram_user_id == str(telegram_user.id))
        )
        user = result.scalar_one_or_none()
        if user is None:
            user = User(
                telegram_user_id=str(telegram_user.id),
                username=telegram_user.username,
                first_name=telegram_user.first_name,
                last_name=telegram_user.last_name,
                photo_url=telegram_user.photo_url,
            )
            real_session.add(user)
            await real_session.commit()
            await real_session.refresh(user)
        return user
    raise RuntimeError("Failed to obtain database session")
