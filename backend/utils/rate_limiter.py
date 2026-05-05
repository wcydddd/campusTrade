"""
Rate limiter: in-memory sliding window (IP + user dimension).
No external dependencies (Redis / slowapi) required.
"""

import time
import asyncio
from collections import defaultdict
from typing import Optional

from fastapi import Request, HTTPException, status


class _SlidingWindowCounter:
    """Per-key sliding window rate limiter stored in memory."""

    def __init__(self):
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()

    async def is_limited(self, key: str, max_hits: int, window_seconds: int) -> bool:
        now = time.time()
        cutoff = now - window_seconds
        async with self._lock:
            self._hits[key] = [t for t in self._hits[key] if t > cutoff]
            if len(self._hits[key]) >= max_hits:
                return True
            self._hits[key].append(now)
            return False

    async def cleanup(self):
        """Remove expired entries (call periodically if needed)."""
        now = time.time()
        async with self._lock:
            empty_keys = [k for k, v in self._hits.items() if not v or v[-1] < now - 3600]
            for k in empty_keys:
                del self._hits[k]


_counter = _SlidingWindowCounter()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


async def check_rate_limit(
    request: Request,
    *,
    scope: str,
    max_hits: int,
    window_seconds: int,
    user_key: Optional[str] = None,
):
    """
    Check rate limit by IP (always) and optionally by user key.
    Raises 429 if either dimension exceeds the limit.
    """
    ip = _get_client_ip(request)
    ip_key = f"rl:{scope}:ip:{ip}"

    if await _counter.is_limited(ip_key, max_hits, window_seconds):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Please try again later.",
        )

    if user_key:
        ukey = f"rl:{scope}:user:{user_key}"
        if await _counter.is_limited(ukey, max_hits, window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please try again later.",
            )


# ── Login-specific: failure tracking + lockout (MongoDB-backed) ──

LOGIN_MAX_FAILURES = 5
LOGIN_LOCKOUT_SECONDS = 900  # 15 minutes


async def record_login_failure(db, email: str, ip: str):
    """Increment failure counter in MongoDB. Returns current failure count."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    result = await db.login_attempts.find_one_and_update(
        {"email": email},
        {
            "$inc": {"failures": 1},
            "$set": {"last_failure_at": now, "last_ip": ip},
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
        return_document=True,
    )
    return result.get("failures", 1)


async def check_login_lockout(db, email: str):
    """Raise 429 if account is locked out due to too many failures."""
    from datetime import datetime, timezone
    record = await db.login_attempts.find_one({"email": email})
    if not record:
        return
    failures = record.get("failures", 0)
    if failures < LOGIN_MAX_FAILURES:
        return
    last_failure = record.get("last_failure_at")
    if last_failure:
        if last_failure.tzinfo is None:
            last_failure = last_failure.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        elapsed = (now - last_failure).total_seconds()
        if elapsed < LOGIN_LOCKOUT_SECONDS:
            remaining = int(LOGIN_LOCKOUT_SECONDS - elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account temporarily locked due to too many failed attempts. Try again in {remaining}s.",
            )
        else:
            await reset_login_failures(db, email)


async def reset_login_failures(db, email: str):
    """Clear failure counter after successful login or lockout expiry."""
    await db.login_attempts.delete_one({"email": email})
