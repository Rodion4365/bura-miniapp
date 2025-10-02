import hmac
import hashlib
import importlib
from urllib.parse import urlencode

import pytest


def _build_init_data(bot_token: str, data: dict) -> str:
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    data_check_string = "\n".join(f"{k}={data[k]}" for k in sorted(data))
    data_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode({**data, "hash": data_hash})


def test_verify_init_data_success(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "123:ABC")
    import auth

    importlib.reload(auth)

    init_pairs = {
        "auth_date": "1700000000",
        "query_id": "AAEAAKZ-Hg",
        "user": '{"id":1,"first_name":"Test"}',
    }

    init_data = _build_init_data("123:ABC", init_pairs)

    assert auth.verify_init_data(init_data) == init_pairs


def test_verify_init_data_invalid_hash(monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "123:ABC")
    import auth

    importlib.reload(auth)

    invalid_data = "auth_date=1&hash=deadbeef"

    with pytest.raises(ValueError, match="hash mismatch"):
        auth.verify_init_data(invalid_data)
