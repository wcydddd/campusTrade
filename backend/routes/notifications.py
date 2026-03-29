from fastapi import APIRouter, Depends, HTTPException, Query, Body
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
from pydantic import BaseModel

from utils.database import get_database
from utils.security import get_current_user
from models.notification import NotificationResponse
from pymongo.errors import DuplicateKeyError


class ReadByLinkBody(BaseModel):
    """Mark all notifications with this chat link (or link starting with it) as read."""
    link: str

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _oid(s: str) -> ObjectId:
    if not ObjectId.is_valid(s):
        raise HTTPException(status_code=400, detail="Invalid ObjectId")
    return ObjectId(s)


def _to_response(doc: dict) -> NotificationResponse:
    return NotificationResponse(
        id=str(doc["_id"]),
        user_id=str(doc["user_id"]),
        type=doc["type"],
        title=doc["title"],
        body=doc["body"],
        read=doc.get("read", False),
        link=doc.get("link"),
        created_at=doc["created_at"],
    )


# =====================================================
# GET /notifications — list for current user
# =====================================================

@router.get("", response_model=List[NotificationResponse])
async def list_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(30, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    """Return notifications for the authenticated user, newest first."""
    db = get_database()
    uid = _oid(current_user["user_id"])

    query = {"user_id": uid}
    if unread_only:
        query["$or"] = [{"read": {"$exists": False}}, {"read": False}]

    docs = (
        await db.notifications
        .find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(length=limit)
    )
    return [_to_response(d) for d in docs]


# =====================================================
# GET /notifications/unread-count
# =====================================================

@router.get("/unread-count")
async def notification_unread_count(
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])
    count = await db.notifications.count_documents({
        "user_id": uid,
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    })
    return {"unread_count": count}


# =====================================================
# POST /notifications/{id}/read — mark one as read
# =====================================================

@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])
    nid = _oid(notification_id)

    result = await db.notifications.update_one(
        {"_id": nid, "user_id": uid},
        {"$set": {"read": True}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")

    remaining = await db.notifications.count_documents({
        "user_id": uid,
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    })
    return {"ok": True, "total_unread": remaining}


# =====================================================
# POST /notifications/read-by-link — mark by chat link (sync with Messages)
# =====================================================

@router.post("/read-by-link")
async def mark_read_by_link(
    body: ReadByLinkBody = Body(...),
    current_user: dict = Depends(get_current_user),
):
    """Mark as read all notifications whose link equals or starts with the given chat link. Used when user opens that chat from Messages so the notification bell stays in sync."""
    import re
    db = get_database()
    uid = _oid(current_user["user_id"])
    link = (body.link or "").strip()
    if not link.startswith("/chat/"):
        remaining = await db.notifications.count_documents({
            "user_id": uid,
            "$or": [{"read": {"$exists": False}}, {"read": False}],
        })
        return {"ok": True, "marked": 0, "total_unread": remaining}

    safe = re.escape(link)
    filter_unread = {"user_id": uid, "$or": [{"read": {"$exists": False}}, {"read": False}]}
    filter_link = {"$or": [{"link": link}, {"link": {"$regex": f"^{safe}\\?"}}]}
    result = await db.notifications.update_many(
        {"$and": [filter_unread, filter_link]},
        {"$set": {"read": True}},
    )
    remaining = await db.notifications.count_documents({
        "user_id": uid,
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    })
    return {"ok": True, "marked": result.modified_count, "total_unread": remaining}


# =====================================================
# POST /notifications/read-all — mark all as read
# =====================================================

@router.post("/read-all")
async def mark_all_read(
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])

    await db.notifications.update_many(
        {
            "user_id": uid,
            "$or": [{"read": {"$exists": False}}, {"read": False}],
        },
        {"$set": {"read": True}},
    )
    return {"ok": True, "total_unread": 0}


# =====================================================
# Helper: create + push a notification (used by other modules)
# =====================================================

async def create_notification(
    user_id: str,
    ntype: str,
    title: str,
    body: str,
    link: Optional[str] = None,
    meta: Optional[dict] = None,
):
    """
    Insert a notification into the DB and push it to the user via WebSocket
    if they are online.  Import `manager` lazily to avoid circular imports.
    """
    db = get_database()
    now = datetime.utcnow()

    doc = {
        "user_id": ObjectId(user_id),
        "type": ntype,
        "title": title,
        "body": body,
        "read": False,
        "link": link,
        "meta": meta or {},
        "created_at": now,
    }
    try:
        result = await db.notifications.insert_one(doc)
    except DuplicateKeyError:
        # Deduplicated by unique index (e.g. same price-drop event)
        return None

    unread = await db.notifications.count_documents({
        "user_id": ObjectId(user_id),
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    })

    payload = {
        "type": "notification",
        "notification": {
            "id": str(result.inserted_id),
            "ntype": ntype,
            "title": title,
            "body": body,
            "link": link,
            "created_at": now.isoformat(),
        },
        "notification_unread": unread,
    }

    from routes.ws import manager
    await manager.send_personal(user_id, payload)
