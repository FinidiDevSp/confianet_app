from __future__ import annotations

import base64
from hashlib import sha256
from typing import Final

from cryptography.fernet import Fernet

from .settings import settings


def _derive_key(seed: str) -> bytes:
    # Derive a 32-byte key from the provided seed
    digest = sha256(seed.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


_KEY: Final[bytes] = _derive_key(settings.mfa_encrypt_seed or settings.jwt_secret)
_FERNET: Final[Fernet] = Fernet(_KEY)


def encrypt_str(plain: str) -> str:
    return _FERNET.encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_str(token: str) -> str:
    return _FERNET.decrypt(token.encode("utf-8")).decode("utf-8")

