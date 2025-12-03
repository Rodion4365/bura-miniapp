from __future__ import annotations

import hashlib
import logging
import os
from functools import lru_cache

from pydantic_settings import BaseSettings
from pydantic import Field

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    secret_key: str = Field(default="CHANGE_ME", alias="SECRET_KEY")
    algorithm: str = "HS256"

    class Config:
        env_file = ".env"
        extra = "ignore"

    def masked_secret(self) -> str:
        if not self.secret_key:
            return "<empty>"
        if len(self.secret_key) <= 4:
            return "***"
        return f"{self.secret_key[:2]}***{self.secret_key[-2:]}"

    def log_status(self) -> None:
        env_name = os.getenv("RENDER_SERVICE_NAME") or os.getenv("RENDER_EXTERNAL_URL") or os.getenv(
            "ENV", "unknown"
        )
        secret_hash = hashlib.sha256(self.secret_key.encode()).hexdigest()[:8]
        logger.info(
            "Auth settings: secret_key=%s (hash=%s), env=%s",
            self.masked_secret(),
            secret_hash,
            env_name,
        )


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    settings.log_status()
    return settings


settings = get_settings()
