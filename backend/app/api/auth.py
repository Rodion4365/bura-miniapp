import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session
from app.schemas import TelegramUser, UserOut
from app.services.auth import get_or_create_user
from app.settings import settings

router = APIRouter()
logger = logging.getLogger(__name__)

settings.log_status()
logger.info("Telegram authorization environment check completed")


@router.post("/auth/telegram", response_model=UserOut)
async def authorize_telegram(
    telegram_user: TelegramUser, session: AsyncSession = Depends(get_async_session)
) -> UserOut:
    user = await get_or_create_user(session, telegram_user)
    return UserOut.model_validate(user)
