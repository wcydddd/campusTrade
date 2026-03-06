from fastapi import APIRouter, Depends, HTTPException, Query
from bson import ObjectId

from utils.database import get_database
from models.notification import NotificationResponse
from utils.permission import require_verified_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="Invalid ObjectId")
    return ObjectId(id_str)


def _notif_response(doc: dict) -> NotificationResponse:
    return NotificationResponse(
        id=str(doc["_id"]),
        user_id=str(doc["user_id"]),
        type=doc["type"],
        title=doc["title"],
        body=doc["body"],
        related_id=doc.get("related_id"),
        is_read=doc.get("is_read", False),
        created_at=doc["created_at"],
    )


# =====================================================
# GET /notifications - 获取通知列表
# =====================================================
@router.get("", response_model=list[NotificationResponse])
async def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])

    query = {"user_id": uid}
    if unread_only:
        query["is_read"] = False

    docs = await db.notifications.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit)
    return [_notif_response(d) for d in docs]


# =====================================================
# GET /notifications/unread-count - 未读数量
# =====================================================
@router.get("/unread-count")
async def get_unread_count(
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])
    count = await db.notifications.count_documents({"user_id": uid, "is_read": False})
    return {"unread_count": count}


# =====================================================
# POST /notifications/{id}/read - 标记单条通知已读
# =====================================================
@router.post("/{notif_id}/read")
async def mark_notification_read(
    notif_id: str,
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])
    nid = _oid(notif_id)

    n = await db.notifications.find_one({"_id": nid})
    if not n or n["user_id"] != uid:
        raise HTTPException(status_code=404, detail="Notification not found")

    await db.notifications.update_one({"_id": nid}, {"$set": {"is_read": True}})
    return {"ok": True}


# =====================================================
# POST /notifications/read-all - 全部标已读
# =====================================================
@router.post("/read-all")
async def mark_all_read(
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])
    result = await db.notifications.update_many(
        {"user_id": uid, "is_read": False},
        {"$set": {"is_read": True}},
    )
    return {"ok": True, "marked_count": result.modified_count}
