"""
messages 路由测试。
覆盖：发送消息 / 消息列表 / 会话聚合 / 未读计数 / 标记已读。

要点：
  - 路由会调 ws.manager.send_personal 推 WebSocket，conftest 中已 mock 为 noop
  - require_verified_user 守卫所有接口
"""
from datetime import datetime, timedelta
from bson import ObjectId


def _make_msg_doc(from_id, to_id, content, *, read=False, product_id=None,
                  created_at=None):
    """直接构造 messages 集合的文档（绕过 send_message，加快测试准备）。"""
    return {
        "from_user_id": from_id,
        "to_user_id": to_id,
        "content": content,
        "product_id": product_id,
        "read": read,
        "created_at": created_at or datetime.utcnow(),
    }


# =====================================================
# POST /messages —— 发送消息
# =====================================================
class TestSendMessage:
    async def test_send_message_success(
        self, client, db, buyer_user, seller_user, auth_headers
    ):
        resp = await client.post(
            "/messages",
            headers=auth_headers(buyer_user),
            json={"to_user_id": seller_user["id"], "content": "Hi there"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["from_user_id"] == buyer_user["id"]
        assert body["to_user_id"] == seller_user["id"]
        assert body["content"] == "Hi there"
        assert body["read"] is False

        # DB 中确实留下了一条
        msg = await db.messages.find_one({"_id": ObjectId(body["id"])})
        assert msg is not None

    async def test_send_message_with_product_link(
        self, client, db, buyer_user, seller_user, auth_headers, make_product
    ):
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/messages",
            headers=auth_headers(buyer_user),
            json={
                "to_user_id": seller_user["id"],
                "content": "Is this still available?",
                "product_id": product["id"],
            },
        )
        assert resp.status_code == 200
        assert resp.json()["product_id"] == product["id"]

    async def test_cannot_send_message_to_self(
        self, client, buyer_user, auth_headers
    ):
        resp = await client.post(
            "/messages",
            headers=auth_headers(buyer_user),
            json={"to_user_id": buyer_user["id"], "content": "talking to me"},
        )
        assert resp.status_code == 400

    async def test_send_to_nonexistent_user_returns_404(
        self, client, buyer_user, auth_headers
    ):
        resp = await client.post(
            "/messages",
            headers=auth_headers(buyer_user),
            json={"to_user_id": str(ObjectId()), "content": "hi"},
        )
        assert resp.status_code == 404

    async def test_empty_content_rejected(
        self, client, buyer_user, seller_user, auth_headers
    ):
        """content 至少 1 个字符（Pydantic min_length=1）。"""
        resp = await client.post(
            "/messages",
            headers=auth_headers(buyer_user),
            json={"to_user_id": seller_user["id"], "content": ""},
        )
        assert resp.status_code == 422
        
    async def test_send_requires_verified_user(
        self, client, unverified_user, seller_user, auth_headers
    ):
        resp = await client.post(
            "/messages",
            headers=auth_headers(unverified_user),
            json={"to_user_id": seller_user["id"], "content": "hi"},
        )
        assert resp.status_code == 403


# =====================================================
# GET /messages —— 消息列表
# =====================================================
class TestGetMessages:
    async def test_list_returns_messages_to_and_from_user(
        self, client, db, buyer_user, seller_user, auth_headers
    ):
        # 双向各一条
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], seller_user["_id"], "buyer to seller"
        ))
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], buyer_user["_id"], "seller reply"
        ))

        resp = await client.get(
            "/messages", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        contents = {m["content"] for m in resp.json()}
        assert contents == {"buyer to seller", "seller reply"}

    async def test_list_filtered_by_other_user_id(
        self,
        client,
        db,
        buyer_user,
        seller_user,
        admin_user,
        auth_headers,
    ):
        # 与 seller 的对话
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], seller_user["_id"], "to seller"
        ))
        # 与 admin 的对话
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], admin_user["_id"], "to admin"
        ))

        resp = await client.get(
            f"/messages?other_user_id={seller_user['id']}",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 200
        contents = [m["content"] for m in resp.json()]
        assert contents == ["to seller"]

    async def test_list_filtered_by_product_id(
        self, client, db, buyer_user, seller_user, auth_headers, make_product
    ):
        p1 = await make_product(seller_user, title="A")
        p2 = await make_product(seller_user, title="B")
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], seller_user["_id"], "about A",
            product_id=p1["_id"],
        ))
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], seller_user["_id"], "about B",
            product_id=p2["_id"],
        ))

        resp = await client.get(
            f"/messages?product_id={p1['id']}",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 200
        contents = [m["content"] for m in resp.json()]
        assert contents == ["about A"]

    async def test_list_does_not_leak_others_messages(
        self,
        client,
        db,
        buyer_user,
        seller_user,
        admin_user,
        auth_headers,
    ):
        """seller 与 admin 的对话不应出现在 buyer 的列表里。"""
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], admin_user["_id"], "private chat"
        ))

        resp = await client.get(
            "/messages", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_requires_authentication(self, client):
        resp = await client.get("/messages")
        assert resp.status_code in (401, 403)


# =====================================================
# GET /messages/conversations —— 会话列表（聚合）
# =====================================================
class TestListConversations:
    async def test_returns_one_row_per_partner(
        self,
        client,
        db,
        buyer_user,
        seller_user,
        admin_user,
        auth_headers,
    ):
        # buyer 与 seller 有 2 条消息，与 admin 有 1 条
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], seller_user["_id"], "msg1",
            created_at=datetime.utcnow() - timedelta(minutes=10),
        ))
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], buyer_user["_id"], "msg2 latest",
            created_at=datetime.utcnow(),
        ))
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], admin_user["_id"], "to admin",
            created_at=datetime.utcnow() - timedelta(minutes=5),
        ))

        resp = await client.get(
            "/messages/conversations", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        # 应聚合为 2 个会话（与 seller / 与 admin 各一个）
        assert len(body) == 2
        # 按最新时间倒序：seller 在前
        assert body[0]["other_user_id"] == seller_user["id"]
        assert body[0]["last_message"] == "msg2 latest"

    async def test_unread_count_only_counts_incoming(
        self, client, db, buyer_user, seller_user, auth_headers
    ):
        # buyer 发出去的消息（未读）不算在 buyer 的未读里
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], seller_user["_id"], "I sent", read=False,
        ))
        # seller 发给 buyer 的未读消息（应被计入）
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], buyer_user["_id"], "unread incoming",
            read=False,
        ))
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], buyer_user["_id"], "another unread",
            read=False,
        ))

        resp = await client.get(
            "/messages/conversations", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["unread_count"] == 2

    async def test_empty_when_no_messages(
        self, client, buyer_user, auth_headers
    ):
        resp = await client.get(
            "/messages/conversations", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        assert resp.json() == []


# =====================================================
# GET /messages/unread-count
# =====================================================
class TestUnreadCount:
    async def test_returns_correct_unread_count(
        self, client, db, buyer_user, seller_user, auth_headers
    ):
        # 两条未读发给 buyer
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], buyer_user["_id"], "u1", read=False,
        ))
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], buyer_user["_id"], "u2", read=False,
        ))
        # 一条已读
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], buyer_user["_id"], "read", read=True,
        ))
        # 一条 buyer 自己发出的（不应计入）
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], seller_user["_id"], "outgoing", read=False,
        ))

        resp = await client.get(
            "/messages/unread-count", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 2

    async def test_zero_when_no_messages(
        self, client, buyer_user, auth_headers
    ):
        resp = await client.get(
            "/messages/unread-count", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 0


# =====================================================
# POST /messages/conversations/{other_user_id}/read
# =====================================================
class TestMarkConversationRead:
    async def test_marks_incoming_messages_as_read(
        self, client, db, buyer_user, seller_user, auth_headers
    ):
        # 三条 seller→buyer 的未读
        for i in range(3):
            await db.messages.insert_one(_make_msg_doc(
                seller_user["_id"], buyer_user["_id"], f"u{i}", read=False,
            ))

        resp = await client.post(
            f"/messages/conversations/{seller_user['id']}/read",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["marked"] == 3
        assert body["total_unread"] == 0

        # DB 中所有相关消息都应为已读
        unread = await db.messages.count_documents({
            "from_user_id": seller_user["_id"],
            "to_user_id": buyer_user["_id"],
            "read": False,
        })
        assert unread == 0

    async def test_does_not_mark_outgoing_as_read(
        self, client, db, buyer_user, seller_user, auth_headers
    ):
        """buyer 自己发出的消息不应被本接口改成"已读"。"""
        await db.messages.insert_one(_make_msg_doc(
            buyer_user["_id"], seller_user["_id"], "outgoing", read=False,
        ))

        resp = await client.post(
            f"/messages/conversations/{seller_user['id']}/read",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 200
        assert resp.json()["marked"] == 0

    async def test_mark_read_filtered_by_product(
        self, client, db, buyer_user, seller_user, auth_headers, make_product
    ):
        p1 = await make_product(seller_user, title="A")
        p2 = await make_product(seller_user, title="B")
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], buyer_user["_id"], "about A",
            product_id=p1["_id"], read=False,
        ))
        await db.messages.insert_one(_make_msg_doc(
            seller_user["_id"], buyer_user["_id"], "about B",
            product_id=p2["_id"], read=False,
        ))

        resp = await client.post(
            f"/messages/conversations/{seller_user['id']}/read"
            f"?product_id={p1['id']}",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 200
        # 只标记 product A 的消息已读
        assert resp.json()["marked"] == 1
        # B 的还是未读
        b_unread = await db.messages.find_one({
            "product_id": p2["_id"], "read": False,
        })
        assert b_unread is not None

    async def test_mark_read_invalid_user_id(
        self, client, buyer_user, auth_headers
    ):
        resp = await client.post(
            "/messages/conversations/not-a-valid-id/read",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 400
