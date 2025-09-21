import hmac, hashlib, os
from urllib.parse import parse_qsl
from typing import Dict
from dotenv import load_dotenv

load_dotenv()
BOT_TOKEN = os.getenv("BOT_TOKEN","")

def _get_secret_key() -> bytes:
    return hashlib.sha256(("WebAppData"+BOT_TOKEN).encode()).digest()

def verify_init_data(init_data: str) -> Dict[str,str]:
    if not BOT_TOKEN:
        raise ValueError("BOT_TOKEN is not configured on the server")
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    provided_hash = pairs.pop("hash", None)
    if not provided_hash:
        raise ValueError("No hash provided")
    data_pairs = [f"{k}={pairs[k]}" for k in sorted(pairs.keys())]
    data_check_string = "\n".join(data_pairs)
    secret_key = _get_secret_key()
    h = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    if h != provided_hash:
        raise ValueError("initData hash mismatch")
    return pairs
