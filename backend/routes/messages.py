from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import datetime
from bson import ObjectId
from typing import List

from utils.database import get_database
from models.message import MessageCreate, MessageResponse, ConversationResponse
from utils.permission import require_verified_user

router = APIRouter(prefix="/messages", tags=["Messages"])


def _oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="Invalid ObjectId")
    return ObjectId(id_str)


def _to_response(doc: dict) -> MessageResponse:
    return MessageResponse(
        id=str(doc["_id"]),
        from_user_id=str(doc["from_user_id"]),
        to_user_id=str(doc["to_user_id"]),
        content=doc["content"],
        product_id=str(doc["product_id"]) if doc.get("product_id") else None,
        read=doc.get("read", False),
        created_at=doc["created_at"],
    )


# =====================================================
# GET /messages — message list (with optional filters)
# =====================================================

@router.get("", response_model=List[MessageResponse])
async def get_messages(
    other_user_id: str | None = Query(None),
    product_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(require_verified_user),
):
    """Get messages for the current user, optionally filtered by conversation partner or product."""
    db = get_database()
    uid = _oid(current_user["user_id"])

    if other_user_id:
        other_oid = _oid(other_user_id)
        query = {
            "$or": [
                {"from_user_id": uid, "to_user_id": other_oid},
                {"from_user_id": other_oid, "to_user_id": uid},
            ]
        }
    else:
        query = {"$or": [{"from_user_id": uid}, {"to_user_id": uid}]}

    if product_id:
        query["product_id"] = _oid(product_id)

    cursor = (
        db.messages.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
    )
    docs = await cursor.to_list(length=limit)
    return [_to_response(d) for d in docs]


# =====================================================
# POST /messages — send a message (REST fallback)
# =====================================================

@router.post("", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def send_message(
    payload: MessageCreate,
    current_user: dict = Depends(require_verified_user),
):
    """Send a message via REST (the WebSocket path is preferred for real-time)."""
    db = get_database()

    from_oid = _oid(current_user["user_id"])
    to_oid = _oid(payload.to_user_id)

    if from_oid == to_oid:
        raise HTTPException(status_code=400, detail="Cannot send message to yourself")

    receiver = await db.users.find_one({"_id": to_oid})
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver not found")

    doc = {
        "from_user_id": from_oid,
        "to_user_id": to_oid,
        "content": payload.content,
        "product_id": _oid(payload.product_id) if payload.product_id else None,
        "read": False,
        "created_at": datetime.utcnow(),
    }

    res = await db.messages.insert_one(doc)
    doc["_id"] = res.inserted_id

    # Push notification + unread_update (same as WebSocket path)
    try:
        from routes.notifications import create_notification
        from routes.ws import manager

        sender = await db.users.find_one({"_id": from_oid})
        sender_name = sender.get("username", "Someone") if sender else "Someone"
        notif_link = f"/chat/{current_user['user_id']}"
        if payload.product_id:
            notif_link += f"?product={payload.product_id}"
        await create_notification(
            user_id=payload.to_user_id,
            ntype="new_order",
            title="New message",
            body=f"{sender_name}: {payload.content[:80]}",
            link=notif_link,
        )

        unread = await db.messages.count_documents({
            "to_user_id": to_oid,
            "$or": [{"read": {"$exists": False}}, {"read": False}],
        })
        await manager.send_personal(payload.to_user_id, {
            "type": "unread_update",
            "unread_count": unread,
        })
        await manager.send_personal(payload.to_user_id, {
            "type": "chat",
            "message_id": str(res.inserted_id),
            "from": current_user["user_id"],
            "to": payload.to_user_id,
            "content": payload.content,
            "product_id": payload.product_id,
            "created_at": doc["created_at"].isoformat(),
        })
    except Exception:
        pass

    return _to_response(doc)


# =====================================================
# GET /messages/conversations — aggregated conversation list
# =====================================================

@router.get("/conversations", response_model=List[ConversationResponse])
async def list_conversations(
    current_user: dict = Depends(require_verified_user),
):
    """
    Return one row per conversation partner, sorted by latest message time.
    Each row includes the partner's username, last message preview, and how
    many messages from them are still unread.
    """
    db = get_database()
    uid = _oid(current_user["user_id"])

    pipeline = [
        {"$match": {"$or": [{"from_user_id": uid}, {"to_user_id": uid}]}},
        {
            "$addFields": {
                "other_user_id": {
                    "$cond": [
                        {"$eq": ["$from_user_id", uid]},
                        "$to_user_id",
                        "$from_user_id",
                    ]
                },
                "is_incoming_unread": {
                    "$and": [
                        {"$eq": ["$to_user_id", uid]},
                        {"$ne": [{"$ifNull": ["$read", False]}, True]},
                    ]
                },
            }
        },
        {"$sort": {"created_at": -1}},
        {
            "$group": {
                "_id": {
                    "other_user_id": "$other_user_id",
                    "product_id_key": {
                        "$ifNull": [{"$toString": "$product_id"}, "general"],
                    },
                },
                "last_message": {"$first": "$content"},
                "last_time": {"$first": "$created_at"},
                "last_product_id": {"$first": "$product_id"},
                "unread_count": {"$sum": {"$cond": ["$is_incoming_unread", 1, 0]}},
            }
        },
        {"$sort": {"last_time": -1}},
        {
            "$lookup": {
                "from": "users",
                "localField": "_id.other_user_id",
                "foreignField": "_id",
                "as": "user_info",
            }
        },
        {
            "$lookup": {
                "from": "products",
                "localField": "last_product_id",
                "foreignField": "_id",
                "as": "product_info",
            }
        },
        {
            "$addFields": {
                "other_username": {
                    "$ifNull": [
                        {"$arrayElemAt": ["$user_info.username", 0]},
                        "Unknown",
                    ]
                },
                "product_title": {"$arrayElemAt": ["$product_info.title", 0]},
                "product_image": {
                    "$ifNull": [
                        {"$arrayElemAt": ["$product_info.image_url", 0]},
                        {"$arrayElemAt": [
                            {"$arrayElemAt": ["$product_info.images", 0]},
                            0,
                        ]},
                    ]
                },
            }
        },
        {"$project": {"user_info": 0, "product_info": 0}},
    ]

    docs = await db.messages.aggregate(pipeline).to_list(length=200)

    return [
        ConversationResponse(
            other_user_id=str(d["_id"]["other_user_id"]),
            other_username=d["other_username"],
            last_message=d["last_message"],
            last_time=d["last_time"],
            unread_count=d["unread_count"],
            product_id=str(d["last_product_id"]) if d.get("last_product_id") else None,
            product_title=d.get("product_title"),
            product_image=d.get("product_image"),
        )
        for d in docs
    ]


# =====================================================
# GET /messages/unread-count — total unread for badge
# =====================================================

@router.get("/unread-count")
async def get_unread_count(
    current_user: dict = Depends(require_verified_user),
):
    """Return the total number of unread messages for the current user."""
    db = get_database()
    uid = _oid(current_user["user_id"])
    count = await db.messages.count_documents({
        "to_user_id": uid,
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    })
    return {"unread_count": count}


# =====================================================
# POST /messages/conversations/{other_user_id}/read
# =====================================================

@router.post("/conversations/{other_user_id}/read")
async def mark_conversation_read(
    other_user_id: str,
    product_id: str | None = Query(None),
    current_user: dict = Depends(require_verified_user),
):
    """Mark messages FROM other_user TO current_user as read (optionally only for one product)."""
    db = get_database()
    uid = _oid(current_user["user_id"])
    other_oid = _oid(other_user_id)

    filter_query = {
        "from_user_id": other_oid,
        "to_user_id": uid,
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    }
    if product_id:
        filter_query["product_id"] = _oid(product_id)

    result = await db.messages.update_many(
        filter_query,
        {"$set": {"read": True}},
    )

    remaining = await db.messages.count_documents({
        "to_user_id": uid,
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    })

    try:
        from routes.ws import manager
        await manager.send_personal(str(other_user_id), {
            "type": "messages_read",
            "reader_id": str(current_user["user_id"]),
            "product_id": str(product_id) if product_id else None,
        })
    except Exception:
        pass

    return {
        "marked": result.modified_count,
        "total_unread": remaining,
    }
