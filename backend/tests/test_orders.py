"""
orders 路由测试。
重点：状态机 (pending → confirmed → completed/cancelled) + 买卖家权限隔离。

订单状态机：
    [创建]  → pending  （商品 reserved）
    [卖家确认] → confirmed （商品 sold）
    [双方完成] → completed （商品 sold）
    [双方取消] → cancelled （商品 available）

非法跳转必须被拒绝：
  - pending 状态下不能直接 complete（必须先 confirm）
  - completed/cancelled 状态下不能再 cancel
  - 只有卖家可以 confirm
  - confirm/complete/cancel 都需要双方任一身份
"""
from bson import ObjectId


# =====================================================
# POST /orders  —— 创建订单（买家发起）
# =====================================================
class TestCreateOrder:
    async def test_create_order_success(
        self, client, db, buyer_user, seller_user, auth_headers, make_product
    ):
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/orders",
            headers=auth_headers(buyer_user),
            json={"product_id": product["id"]},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "pending"
        assert body["buyer_id"] == buyer_user["id"]
        assert body["seller_id"] == seller_user["id"]

        # 创建后商品应被设为 reserved
        p_after = await db.products.find_one({"_id": product["_id"]})
        assert p_after["status"] == "reserved"

    async def test_cannot_order_own_product(
        self, client, seller_user, auth_headers, make_product
    ):
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/orders",
            headers=auth_headers(seller_user),
            json={"product_id": product["id"]},
        )
        assert resp.status_code == 400

    async def test_cannot_order_unavailable_product(
        self, client, buyer_user, seller_user, auth_headers, make_product
    ):
        product = await make_product(seller_user, status="sold")
        resp = await client.post(
            "/orders",
            headers=auth_headers(buyer_user),
            json={"product_id": product["id"]},
        )
        assert resp.status_code == 400

    async def test_cannot_double_order_same_product(
        self,
        client,
        db,
        buyer_user,
        seller_user,
        auth_headers,
        make_product,
        make_user,
    ):
        product = await make_product(seller_user, status="available")
        # 第一次下单
        r1 = await client.post(
            "/orders",
            headers=auth_headers(buyer_user),
            json={"product_id": product["id"]},
        )
        assert r1.status_code == 201

        # 别的买家想下同一商品（此时已 reserved）
        another_buyer = await make_user(
            email="other@university.edu", username="other"
        )
        r2 = await client.post(
            "/orders",
            headers=auth_headers(another_buyer),
            json={"product_id": product["id"]},
        )
        assert r2.status_code == 400

    async def test_create_order_product_not_found(
        self, client, buyer_user, auth_headers
    ):
        resp = await client.post(
            "/orders",
            headers=auth_headers(buyer_user),
            json={"product_id": str(ObjectId())},
        )
        assert resp.status_code == 404

    async def test_create_requires_verified_user(
        self, client, unverified_user, auth_headers, make_product, seller_user
    ):
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/orders",
            headers=auth_headers(unverified_user),
            json={"product_id": product["id"]},
        )
        assert resp.status_code == 403


# =====================================================
# GET /orders  —— 订单列表（买家/卖家视角）
# =====================================================
class TestListOrders:
    async def test_default_returns_both_roles(
        self, client, buyer_user, seller_user, auth_headers, make_order, make_user
    ):
        # buyer_user 作为买家有一个订单
        await make_order(buyer=buyer_user, seller=seller_user, status="pending")
        # buyer_user 作为卖家也有一个订单（自己卖东西给别人）
        third = await make_user(email="x@university.edu", username="thirdy")
        await make_order(buyer=third, seller=buyer_user, status="confirmed")

        resp = await client.get("/orders", headers=auth_headers(buyer_user))
        assert resp.status_code == 200
        # 不传 role 应返回两类合计
        assert len(resp.json()) == 2

    async def test_role_buyer_only_returns_purchases(
        self, client, buyer_user, seller_user, auth_headers, make_order, make_user
    ):
        await make_order(buyer=buyer_user, seller=seller_user, status="pending")
        third = await make_user(email="x@university.edu", username="thirdy")
        await make_order(buyer=third, seller=buyer_user, status="confirmed")

        resp = await client.get(
            "/orders?role=buyer", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["buyer_id"] == buyer_user["id"]

    async def test_role_seller_only_returns_sales(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        await make_order(buyer=buyer_user, seller=seller_user, status="pending")
        resp = await client.get(
            "/orders?role=seller", headers=auth_headers(seller_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == 1
        assert body[0]["seller_id"] == seller_user["id"]

    async def test_requires_authentication(self, client):
        resp = await client.get("/orders")
        assert resp.status_code in (401, 403)


# =====================================================
# GET /orders/{id}  —— 订单详情
# =====================================================
class TestOrderDetail:
    async def test_buyer_can_view(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(buyer=buyer_user, seller=seller_user)
        resp = await client.get(
            f"/orders/{order['id']}", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        assert resp.json()["id"] == order["id"]

    async def test_seller_can_view(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(buyer=buyer_user, seller=seller_user)
        resp = await client.get(
            f"/orders/{order['id']}", headers=auth_headers(seller_user)
        )
        assert resp.status_code == 200

    async def test_outsider_cannot_view(
        self,
        client,
        buyer_user,
        seller_user,
        admin_user,
        auth_headers,
        make_order,
    ):
        order, _ = await make_order(buyer=buyer_user, seller=seller_user)
        # admin_user 既不是买家也不是卖家
        resp = await client.get(
            f"/orders/{order['id']}", headers=auth_headers(admin_user)
        )
        assert resp.status_code == 403

    async def test_not_found(self, client, buyer_user, auth_headers):
        resp = await client.get(
            f"/orders/{ObjectId()}", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 404


# =====================================================
# PATCH /orders/{id}/confirm  —— 卖家确认
# =====================================================
class TestConfirmOrder:
    async def test_seller_confirms_pending_order(
        self, client, db, buyer_user, seller_user, auth_headers, make_order
    ):
        order, product = await make_order(
            buyer=buyer_user, seller=seller_user, status="pending"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/confirm",
            headers=auth_headers(seller_user),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "confirmed"

        # 商品被标记为 sold
        p_after = await db.products.find_one({"_id": product["_id"]})
        assert p_after["status"] == "sold"

    async def test_buyer_cannot_confirm(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="pending"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/confirm",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 403

    async def test_cannot_confirm_already_confirmed(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="confirmed"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/confirm",
            headers=auth_headers(seller_user),
        )
        assert resp.status_code == 400

    async def test_cannot_confirm_cancelled(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="cancelled"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/confirm",
            headers=auth_headers(seller_user),
        )
        assert resp.status_code == 400


# =====================================================
# PATCH /orders/{id}/complete  —— 完成订单
# =====================================================
class TestCompleteOrder:
    async def test_buyer_can_complete_confirmed_order(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="confirmed"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/complete",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "completed"

    async def test_seller_can_complete_confirmed_order(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="confirmed"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/complete",
            headers=auth_headers(seller_user),
        )
        assert resp.status_code == 200

    async def test_cannot_complete_pending_order(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        """跳过 confirm 直接 complete 应该失败。"""
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="pending"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/complete",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 400

    async def test_outsider_cannot_complete(
        self,
        client,
        buyer_user,
        seller_user,
        admin_user,
        auth_headers,
        make_order,
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="confirmed"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/complete",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 403


# =====================================================
# PATCH /orders/{id}/cancel  —— 取消订单
# =====================================================
class TestCancelOrder:
    async def test_buyer_can_cancel_pending(
        self, client, db, buyer_user, seller_user, auth_headers, make_order
    ):
        order, product = await make_order(
            buyer=buyer_user, seller=seller_user, status="pending"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/cancel",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"

        # 商品应被恢复为 available（用户可重新下单）
        p_after = await db.products.find_one({"_id": product["_id"]})
        assert p_after["status"] == "available"

    async def test_seller_can_cancel_pending(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="pending"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/cancel",
            headers=auth_headers(seller_user),
        )
        assert resp.status_code == 200

    async def test_can_cancel_confirmed(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="confirmed"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/cancel",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 200

    async def test_cannot_cancel_completed(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/cancel",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 400

    async def test_cannot_cancel_already_cancelled(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="cancelled"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/cancel",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 400


# =====================================================
# PATCH /orders/{id}/{action}  —— action 不合法
# =====================================================
class TestUnknownAction:
    async def test_unknown_action_returns_400(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(buyer=buyer_user, seller=seller_user)
        resp = await client.patch(
            f"/orders/{order['id']}/explode",
            headers=auth_headers(buyer_user),
        )
        assert resp.status_code == 400


# =====================================================
# 端到端：下单 → 确认 → 完成
# =====================================================
class TestFullOrderFlow:
    async def test_happy_path_create_confirm_complete(
        self, client, db, buyer_user, seller_user, auth_headers, make_product
    ):
        product = await make_product(seller_user, status="available")

        # 1. buyer 下单
        r1 = await client.post(
            "/orders",
            headers=auth_headers(buyer_user),
            json={"product_id": product["id"]},
        )
        assert r1.status_code == 201
        order_id = r1.json()["id"]

        # 2. seller 确认
        r2 = await client.patch(
            f"/orders/{order_id}/confirm",
            headers=auth_headers(seller_user),
        )
        assert r2.status_code == 200
        assert r2.json()["status"] == "confirmed"

        # 3. buyer 完成
        r3 = await client.patch(
            f"/orders/{order_id}/complete",
            headers=auth_headers(buyer_user),
        )
        assert r3.status_code == 200
        assert r3.json()["status"] == "completed"

        # 商品最终状态：sold
        p_after = await db.products.find_one({"_id": product["_id"]})
        assert p_after["status"] == "sold"


# =====================================================
# 跨模块集成：订单触发通知
# =====================================================
class TestNotificationSideEffects:
    """验证 orders 模块在状态变更时真的会触发 notifications 模块。"""

    async def test_order_creation_notifies_both_buyer_and_seller(
        self,
        client,
        buyer_user,
        seller_user,
        auth_headers,
        make_product,
        notification_spy,
    ):
        """下单成功后：卖家收到"待确认"通知，买家收到"订单已创建"确认。"""
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/orders",
            headers=auth_headers(buyer_user),
            json={"product_id": product["id"]},
        )
        assert resp.status_code == 201

        # 卖家收到 1 条 order_update
        seller_notifs = [
            c for c in notification_spy
            if c["user_id"] == seller_user["id"]
        ]
        assert len(seller_notifs) == 1
        assert seller_notifs[0]["ntype"] == "order_update"
        assert "pending" in seller_notifs[0]["title"].lower()

        # 买家收到 1 条 system 类型的"订单已创建"
        buyer_notifs = [
            c for c in notification_spy
            if c["user_id"] == buyer_user["id"]
        ]
        assert len(buyer_notifs) == 1
        assert buyer_notifs[0]["ntype"] == "system"

    async def test_seller_confirm_notifies_buyer(
        self,
        client,
        buyer_user,
        seller_user,
        auth_headers,
        make_order,
        notification_spy,
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="pending"
        )
        resp = await client.patch(
            f"/orders/{order['id']}/confirm",
            headers=auth_headers(seller_user),
        )
        assert resp.status_code == 200

        # 买家应收到一条状态变更通知
        buyer_notifs = [
            c for c in notification_spy
            if c["user_id"] == buyer_user["id"]
        ]
        assert len(buyer_notifs) == 1
        assert "confirm" in buyer_notifs[0]["title"].lower()
