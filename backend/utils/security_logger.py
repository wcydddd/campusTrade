"""
Writes security-related events to the MongoDB `security_events` collection.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import Request
from utils.database import get_database


def _get_client_ip(request: Optional[Request]) -> str:
    if request is None:
        return "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


async def log_security_event(
    event_type: str,
    *,
    email: Optional[str] = None,
    user_id: Optional[str] = None,
    request: Optional[Request] = None,
    detail: Optional[str] = None,
    extra: Optional[dict] = None,
):
    """
    Record a security event.

    event_type examples:
      login_success, login_failure, login_lockout,
      register, register_rate_limited,
      otp_sent, otp_rate_limited, otp_verify_failure,
      account_banned, account_unbanned
    """
    db = get_database()
    doc = {
        "event": event_type,
        "email": email,
        "user_id": user_id,
        "ip": _get_client_ip(request),
        "user_agent": request.headers.get("user-agent") if request else None,
        "detail": detail,
        "created_at": datetime.now(timezone.utc),
    }
    if extra:
        doc.update(extra)
    await db.security_events.insert_one(doc)
