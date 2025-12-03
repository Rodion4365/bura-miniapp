from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import AbstractAsyncContextManager, aclosing

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import ExpiredSignatureError, InvalidTokenError

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.models import User
from app.schemas import TelegramUser
from app.settings import get_settings


logger = logging.getLogger(__name__)
_bearer_scheme = HTTPBearer(auto_error=False)
get_session = get_async_session


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Extract and validate the current user from a bearer token."""

    if credentials is None:
        logger.warning("[get_current_user] No Authorization header or wrong scheme")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    masked = credentials.credentials[:10] + "..." if credentials.credentials else "<empty>"
    logger.info("[get_current_user] Got bearer token: %s", masked)

    settings = get_settings()
    if not settings.secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="SECRET_KEY is not configured",
        )

    try:
        user = await _resolve_user_from_token(credentials.credentials, session, settings.secret_key)
    except HTTPException as exc:
        logger.warning("[get_current_user] Token rejected: %s", exc.detail)
        raise

    logger.info("[get_current_user] Authenticated user id=%s", user.id)
    return user


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


async def _resolve_user_from_token(token: str, session: AsyncSession, secret_key: str) -> User:
    try:
        payload = jwt.decode(token, secret_key, algorithms=[get_settings().algorithm])
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token_expired")
    except InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    subject = payload.get("sub")
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_subject")

    try:
        user_id = int(subject)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_subject")

    async for real_session in _unwrap_session(session):
        result = await real_session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")
        return user

    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="session_unavailable")
