from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class TelegramUser(BaseModel):
    id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    photo_url: str | None = None

    model_config = ConfigDict(populate_by_name=True, alias_generator=None)


class UserOut(BaseModel):
    id: int
    telegram_user_id: str
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    photo_url: str | None = None

    model_config = ConfigDict(from_attributes=True)
