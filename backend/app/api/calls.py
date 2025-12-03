from __future__ import annotations

import logging
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import ExpiredSignatureError, InvalidTokenError

from app.settings import settings

logger = logging.getLogger(__name__)
router = APIRouter()
http_bearer = HTTPBearer(auto_error=False)

async def get_current_user(
    request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(http_bearer)
) -> str:
    authorization_present = request.headers.get("Authorization") is not None
    logger.info("Authorization header present: %s", authorization_present)

    if credentials is None:
        logger.info("HTTPBearer returned no credentials object")
    else:
        token_safe = _short_token(credentials.credentials)
        logger.info("HTTPBearer provided credentials: %s", token_safe if token_safe else "<empty>")

    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="credentials_not_provided")

    logger.info(
        "Token details before decoding: length=%s, preview=%s",
        len(credentials.credentials) if credentials.credentials else 0,
        _short_token(credentials.credentials),
    )

    user_id = _decode_user_id_from_token(credentials.credentials)
    return user_id


@router.get("/api/calls/")
async def get_calls(current_user: str = Depends(get_current_user)):
    return {"user_id": current_user}


def _decode_user_id_from_token(token: str) -> str:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except ExpiredSignatureError:
        logger.warning("Token decode failed: expired signature")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token_expired")
    except InvalidTokenError:
        logger.warning("Token decode failed: invalid token")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    sub = payload.get("sub")
    if not sub:
        logger.warning("Token decode failed: missing subject")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_subject")

    return str(sub)


def _short_token(token: str) -> str:
    if not token:
        return ""
    if len(token) <= 10:
        return token
    return f"{token[:5]}...{token[-5:]}"


settings.log_status()
logger.info("Call authorization environment check completed")
