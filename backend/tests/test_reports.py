"""
reports 路由测试。
路由只有 1 个接口（POST /reports），但有几条业务约束要验证：
  - 只能举报别人的商品（不能举报自己的）
  - 同一用户对同一商品只能有 1 条 pending 举报
  - 商品必须存在
  - 用户必须已验证邮箱
"""
from bson import ObjectId


# =====================================================
# POST /reports
# =====================================================
class TestCreateReport:
    PAYLOAD_BASE = {"reason": "spam", "description": "Just a test report"}

    async def test_create_report_success(
        self, client, db, buyer_user, seller_user, auth_headers, make_product
    ):
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/reports",
            headers=auth_headers(buyer_user),
            json={"product_id": product["id"], **self.PAYLOAD_BASE},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["ok"] is True

        # DB 中应有一条记录
        report = await db.reports.find_one({
            "product_id": product["_id"],
            "reporter_id": buyer_user["_id"],
        })
        assert report is not None
        assert report["status"] == "pending"
        assert report["reason"] == "spam"

    async def test_cannot_report_own_product(
        self, client, seller_user, auth_headers, make_product
    ):
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/reports",
            headers=auth_headers(seller_user),
            json={"product_id": product["id"], **self.PAYLOAD_BASE},
        )
        assert resp.status_code == 400

    async def test_cannot_create_duplicate_pending_report(
        self,
        client,
        db,
        buyer_user,
        seller_user,
        auth_headers,
        make_product,
    ):
        product = await make_product(seller_user, status="available")
        # 第一次成功
        r1 = await client.post(
            "/reports",
            headers=auth_headers(buyer_user),
            json={"product_id": product["id"], **self.PAYLOAD_BASE},
        )
        assert r1.status_code == 201

        # 同一用户对同一商品再次举报
        r2 = await client.post(
            "/reports",
            headers=auth_headers(buyer_user),
            json={"product_id": product["id"], **self.PAYLOAD_BASE},
        )
        assert r2.status_code == 400

        # DB 中仍只有 1 条 pending 举报
        count = await db.reports.count_documents({
            "product_id": product["_id"],
            "reporter_id": buyer_user["_id"],
            "status": "pending",
        })
        assert count == 1

    async def test_report_nonexistent_product(
        self, client, buyer_user, auth_headers
    ):
        resp = await client.post(
            "/reports",
            headers=auth_headers(buyer_user),
            json={"product_id": str(ObjectId()), **self.PAYLOAD_BASE},
        )
        assert resp.status_code == 404

    async def test_report_invalid_product_id(
        self, client, buyer_user, auth_headers
    ):
        resp = await client.post(
            "/reports",
            headers=auth_headers(buyer_user),
            json={"product_id": "not-an-objectid", **self.PAYLOAD_BASE},
        )
        assert resp.status_code == 400

    async def test_unverified_user_cannot_report(
        self, client, unverified_user, seller_user, auth_headers, make_product
    ):
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/reports",
            headers=auth_headers(unverified_user),
            json={"product_id": product["id"], **self.PAYLOAD_BASE},
        )
        assert resp.status_code == 403

    async def test_invalid_reason_rejected(
        self, client, buyer_user, seller_user, auth_headers, make_product
    ):
        """reason 必须是 ReportReason 枚举内的值。"""
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/reports",
            headers=auth_headers(buyer_user),
            json={
                "product_id": product["id"],
                "reason": "definitely_not_a_valid_reason",
                "description": "...",
            },
        )
        assert resp.status_code == 422


# =====================================================
# 跨模块集成：举报 → admin 通知
# =====================================================
class TestReportNotificationSideEffect:
    async def test_report_notifies_all_admins(
        self,
        client,
        buyer_user,
        seller_user,
        admin_user,
        auth_headers,
        make_product,
        notification_spy,
    ):
        """提交举报后，所有 admin 各应收到一条 admin_report 通知（跨模块）。"""
        product = await make_product(seller_user, status="available")
        resp = await client.post(
            "/reports",
            headers=auth_headers(buyer_user),
            json={"product_id": product["id"], "reason": "spam"},
        )
        assert resp.status_code == 201

        admin_calls = [c for c in notification_spy if c["ntype"] == "admin_report"]
        assert len(admin_calls) == 1
        assert admin_calls[0]["user_id"] == admin_user["id"]
