from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from datetime import datetime
from bson import ObjectId
from typing import Dict
import json
import logging

from utils.security import decode_token
from utils.database import get_database

logger = logging.getLogger(__name__)

router = APIRouter()


# =====================================================
# ConnectionManager — global singleton
# =====================================================

class ConnectionManager:
    """
    Maintains a mapping of user_id -> WebSocket so that any part of the
    application can push a message to a specific online user.
    """

    def __init__(self):
        self.active: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        old = self.active.get(user_id)
        if old is not None:
            try:
                await old.close(code=status.WS_1008_POLICY_VIOLATION)
            except Exception:
                pass
        self.active[user_id] = websocket
        logger.info("WS connected: %s  (online: %d)", user_id, len(self.active))

    def disconnect(self, user_id: str):
        self.active.pop(user_id, None)
        logger.info("WS disconnected: %s  (online: %d)", user_id, len(self.active))

    async def send_personal(self, user_id: str, data: dict) -> bool:
        """Send a JSON payload to a single user. Returns True if delivered."""
        ws = self.active.get(user_id)
        if ws is None:
            return False
        try:
            await ws.send_json(data)
            return True
        except Exception:
            self.disconnect(user_id)
            return False

    async def broadcast(self, data: dict, *, exclude: str | None = None):
        """Send to every connected user (optionally excluding one)."""
        dead = []
        for uid, ws in self.active.items():
            if uid == exclude:
                continue
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.disconnect(uid)


manager = ConnectionManager()


# =====================================================
# WebSocket endpoint — /ws?token=<JWT>
# =====================================================

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    # ── 1. Extract & verify token ──
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        payload = decode_token(token)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_id: str | None = payload.get("sub")
    if not user_id:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # ── 2. Accept & register ──
    await manager.connect(user_id, websocket)

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type")

            # ── heartbeat ──
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            # ── chat message ──
            if msg_type == "chat":
                await _handle_chat(user_id, data, websocket)
                continue

            # ── mark conversation as read ──
            if msg_type == "read":
                await _handle_read(user_id, data, websocket)
                continue

            # ── unknown type ──
            await websocket.send_json({
                "type": "error",
                "message": f"Unknown message type: {msg_type}",
            })

    except WebSocketDisconnect:
        manager.disconnect(user_id)


# =====================================================
# Message handlers
# =====================================================

async def _handle_chat(from_id: str, data: dict, websocket: WebSocket):
    """
    Expected payload:
        { "type": "chat", "to": "<user_id>", "content": "...", "product_id": "..." }
    Persists the message (read=false) to MongoDB, pushes the chat envelope
    to the recipient, and also sends an unread_update so their badge refreshes.
    """
    to_id = data.get("to")
    content = (data.get("content") or "").strip()
    product_id = data.get("product_id")

    if not to_id or not content:
        await websocket.send_json({
            "type": "error",
            "message": "Fields 'to' and 'content' are required.",
        })
        return

    if to_id == from_id:
        await websocket.send_json({
            "type": "error",
            "message": "Cannot send a message to yourself.",
        })
        return

    db = get_database()
    now = datetime.utcnow()

    doc = {
        "from_user_id": ObjectId(from_id),
        "to_user_id": ObjectId(to_id),
        "content": content,
        "product_id": ObjectId(product_id) if product_id else None,
        "read": False,
        "created_at": now,
    }
    result = await db.messages.insert_one(doc)

    envelope = {
        "type": "chat",
        "message_id": str(result.inserted_id),
        "from": from_id,
        "to": to_id,
        "content": content,
        "product_id": product_id,
        "created_at": now.isoformat(),
    }

    delivered = await manager.send_personal(to_id, envelope)

    # Create a notification for the recipient
    from routes.notifications import create_notification

    sender = await db.users.find_one({"_id": ObjectId(from_id)})
    sender_name = sender.get("username", "Someone") if sender else "Someone"
    notif_link = f"/chat/{from_id}"
    if product_id:
        notif_link += f"?product={product_id}"
    await create_notification(
        user_id=to_id,
        ntype="new_order",
        title="New message",
        body=f"{sender_name}: {content[:80]}",
        link=notif_link,
    )

    # Always push unread count to recipient if they're online
    unread = await db.messages.count_documents({
        "to_user_id": ObjectId(to_id),
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    })
    await manager.send_personal(to_id, {
        "type": "unread_update",
        "unread_count": unread,
    })

    await websocket.send_json({**envelope, "delivered": delivered})


async def _handle_read(user_id: str, data: dict, websocket: WebSocket):
    """
    Expected payload:
        { "type": "read", "other_user_id": "<user_id>", "product_id": "<id>" (optional) }
    Marks messages from other_user -> current user as read (optionally only for one product).
    """
    other_id = data.get("other_user_id")
    if not other_id:
        await websocket.send_json({
            "type": "error",
            "message": "Field 'other_user_id' is required.",
        })
        return

    db = get_database()
    uid = ObjectId(user_id)
    other_oid = ObjectId(other_id)

    filter_query = {
        "from_user_id": other_oid,
        "to_user_id": uid,
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    }
    product_id = data.get("product_id")
    if product_id and ObjectId.is_valid(product_id):
        filter_query["product_id"] = ObjectId(product_id)

    await db.messages.update_many(
        filter_query,
        {"$set": {"read": True}},
    )

    remaining = await db.messages.count_documents({
        "to_user_id": uid,
        "$or": [{"read": {"$exists": False}}, {"read": False}],
    })

    await websocket.send_json({
        "type": "unread_update",
        "unread_count": remaining,
    })

    # 通知发送方：对方已读，发送方界面可把「未读」改为「已读」
    await manager.send_personal(str(other_id), {
        "type": "messages_read",
        "reader_id": str(user_id),
        "product_id": str(product_id) if product_id else None,
    })
