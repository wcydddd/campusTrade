from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import datetime
from bson import ObjectId
from typing import Optional, List

from utils.database import get_database
from models.message import MessageCreate, MessageResponse
from models.conversation import ConversationResponse
from utils.permission import require_verified_user

router = APIRouter(tags=["Messages & Conversations"])


def _oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="Invalid ObjectId")
    return ObjectId(id_str)


def _msg_response(doc: dict) -> MessageResponse:
    return MessageResponse(
        id=str(doc["_id"]),
        conversation_id=str(doc["conversation_id"]) if doc.get("conversation_id") else None,
        from_user_id=str(doc["from_user_id"]),
        to_user_id=str(doc["to_user_id"]),
        content=doc["content"],
        product_id=str(doc["product_id"]) if doc.get("product_id") else None,
        read_at=doc.get("read_at"),
        created_at=doc["created_at"],
    )


def _conv_response(doc: dict, unread: int = 0) -> ConversationResponse:
    return ConversationResponse(
        id=str(doc["_id"]),
        participants=[str(p) for p in doc["participants"]],
        product_id=str(doc["product_id"]) if doc.get("product_id") else None,
        last_message=doc.get("last_message"),
        last_message_at=doc.get("last_message_at"),
        unread_count=unread,
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


async def _get_or_create_conversation(db, user1_oid, user2_oid, product_oid=None):
    """Find existing conversation between two users (optionally about a product), or create one."""
    query = {
        "participants": {"$all": [user1_oid, user2_oid]},
    }
    if product_oid:
        query["product_id"] = product_oid

    conv = await db.conversations.find_one(query)
    if conv:
        return conv

    now = datetime.utcnow()
    doc = {
        "participants": [user1_oid, user2_oid],
        "product_id": product_oid,
        "last_message": None,
        "last_message_at": now,
        "created_at": now,
        "updated_at": now,
    }
    res = await db.conversations.insert_one(doc)
    doc["_id"] = res.inserted_id
    return doc


# =====================================================
# GET /conversations - 获取当前用户的所有会话
# =====================================================
@router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])

    convs = await db.conversations.find(
        {"participants": uid}
    ).sort("last_message_at", -1).to_list(length=100)

    results = []
    for conv in convs:
        unread = await db.messages.count_documents({
            "conversation_id": conv["_id"],
            "to_user_id": uid,
            "read_at": None,
        })
        results.append(_conv_response(conv, unread))
    return results


# =====================================================
# GET /conversations/{id}/messages - 获取某会话的消息（分页）
# =====================================================
@router.get("/conversations/{conv_id}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(
    conv_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])
    cid = _oid(conv_id)

    conv = await db.conversations.find_one({"_id": cid})
    if not conv or uid not in conv["participants"]:
        raise HTTPException(status_code=404, detail="Conversation not found")

    skip = (page - 1) * page_size
    docs = await db.messages.find(
        {"conversation_id": cid}
    ).sort("created_at", -1).skip(skip).limit(page_size).to_list(length=page_size)

    return [_msg_response(d) for d in docs]


# =====================================================
# POST /messages - 发送消息（自动创建/复用会话）
# =====================================================
@router.post("/messages", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def send_message(
    payload: MessageCreate,
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()
    from_oid = _oid(current_user["user_id"])
    to_oid = _oid(payload.to_user_id)

    if from_oid == to_oid:
        raise HTTPException(status_code=400, detail="Cannot send message to yourself")

    receiver = await db.users.find_one({"_id": to_oid})
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver not found")

    product_oid = _oid(payload.product_id) if payload.product_id else None
    conv = await _get_or_create_conversation(db, from_oid, to_oid, product_oid)

    now = datetime.utcnow()
    doc = {
        "conversation_id": conv["_id"],
        "from_user_id": from_oid,
        "to_user_id": to_oid,
        "content": payload.content,
        "product_id": product_oid,
        "read_at": None,
        "created_at": now,
    }
    res = await db.messages.insert_one(doc)
    doc["_id"] = res.inserted_id

    # Update conversation summary
    await db.conversations.update_one(
        {"_id": conv["_id"]},
        {"$set": {
            "last_message": payload.content[:100],
            "last_message_at": now,
            "updated_at": now,
        }}
    )

    # Create notification for receiver
    await db.notifications.insert_one({
        "user_id": to_oid,
        "type": "new_message",
        "title": "New message",
        "body": payload.content[:100],
        "related_id": str(conv["_id"]),
        "is_read": False,
        "created_at": now,
    })

    # Push to WebSocket if recipient is online
    from routes.ws import manager
    ws_payload = {
        "type": "new_message",
        "conversation_id": str(conv["_id"]),
        "message": _msg_response(doc).model_dump(mode="json"),
    }
    await manager.send_to_user(str(to_oid), ws_payload)

    return _msg_response(doc)


# =====================================================
# GET /messages - 兼容旧接口（按 other_user_id 拉消息）
# =====================================================
@router.get("/messages", response_model=List[MessageResponse])
async def get_messages(
    other_user_id: Optional[str] = Query(None),
    product_id: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(require_verified_user),
):
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

    docs = await db.messages.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(length=limit)
    return [_msg_response(d) for d in docs]


# =====================================================
# POST /messages/{id}/read - 标记单条消息已读
# =====================================================
@router.post("/messages/{msg_id}/read")
async def mark_message_read(
    msg_id: str,
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])
    mid = _oid(msg_id)

    msg = await db.messages.find_one({"_id": mid})
    if not msg or msg["to_user_id"] != uid:
        raise HTTPException(status_code=404, detail="Message not found")

    if msg.get("read_at") is None:
        now = datetime.utcnow()
        await db.messages.update_one({"_id": mid}, {"$set": {"read_at": now}})

        # Notify sender via WebSocket
        from routes.ws import manager
        await manager.send_to_user(str(msg["from_user_id"]), {
            "type": "message_read",
            "message_id": str(mid),
            "conversation_id": str(msg["conversation_id"]),
            "read_at": now.isoformat(),
        })

    return {"ok": True}


# =====================================================
# POST /conversations/{id}/read_all - 标记会话所有消息已读
# =====================================================
@router.post("/conversations/{conv_id}/read_all")
async def mark_conversation_read(
    conv_id: str,
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()
    uid = _oid(current_user["user_id"])
    cid = _oid(conv_id)

    conv = await db.conversations.find_one({"_id": cid})
    if not conv or uid not in conv["participants"]:
        raise HTTPException(status_code=404, detail="Conversation not found")

    now = datetime.utcnow()
    result = await db.messages.update_many(
        {"conversation_id": cid, "to_user_id": uid, "read_at": None},
        {"$set": {"read_at": now}},
    )

    return {"ok": True, "marked_count": result.modified_count}
