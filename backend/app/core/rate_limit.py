from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Dict, Tuple


@dataclass
class Bucket:
    attempts: int
    window_start: float
    blocked_until: float


class InMemoryRateLimiter:
    def __init__(self, max_attempts: int = 5, window_seconds: int = 300, block_seconds: int = 900) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.block_seconds = block_seconds
        self.buckets: Dict[str, Bucket] = {}

    def check_and_increment(self, key: str) -> Tuple[bool, str | None]:
        now = time.time()
        b = self.buckets.get(key)
        if b and b.blocked_until > now:
            return False, "Too many attempts, try again later"

        if not b or (now - b.window_start) > self.window_seconds:
            b = Bucket(attempts=0, window_start=now, blocked_until=0)
            self.buckets[key] = b

        b.attempts += 1
        if b.attempts > self.max_attempts:
            b.blocked_until = now + self.block_seconds
            return False, "Too many attempts, try again later"
        return True, None

    def reset(self, key: str) -> None:
        if key in self.buckets:
            del self.buckets[key]


rate_limiter = InMemoryRateLimiter()

