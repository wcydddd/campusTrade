from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from datetime import datetime
from bson import ObjectId

from utils.database import get_database
from models.message import MessageCreate, MessageResponse
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
        created_at=doc["created_at"],
    )


@router.get("", response_model=List[MessageResponse])
async def get_messages(
    # 可选：只拉与某个用户的对话
    other_user_id: Optional[str] = Query(None),
    # 可选：只拉某个商品相关消息（聊天窗口按商品聚合时很有用）
    product_id: Optional[str] = Query(None),
    # 分页
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    # ✅ Verified-only messaging access（更符合“消息功能仅限验证用户”）
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

    cursor = (
        db.messages.find(query)
        .sort("created_at", -1)  # 最新在前
        .skip(skip)
        .limit(limit)
    )
    docs = await cursor.to_list(length=limit)
    return [_to_response(d) for d in docs]


@router.post("", response_model=MessageResponse, status_code=status.HTTP_200_OK)
async def send_message(
    payload: MessageCreate,
    # ✅ Aim 1.3：只有 verified user 才能发消息；未验证 -> 403（由 require_verified_user 负责）
    current_user: dict = Depends(require_verified_user),
):
    db = get_database()

    from_oid = _oid(current_user["user_id"])
    to_oid = _oid(payload.to_user_id)

    if from_oid == to_oid:
        raise HTTPException(status_code=400, detail="Cannot send message to yourself")

    # 可选但推荐：检查接收者存在，避免发给不存在用户
    receiver = await db.users.find_one({"_id": to_oid})
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver not found")

    doc = {
        "from_user_id": from_oid,
        "to_user_id": to_oid,
        "content": payload.content,
        "product_id": _oid(payload.product_id) if payload.product_id else None,
        "created_at": datetime.utcnow(),
    }

    res = await db.messages.insert_one(doc)
    doc["_id"] = res.inserted_id

    # “recipient notified”如果你们后续做 websocket/轮询，这里可以留 hook
    return _to_response(doc)