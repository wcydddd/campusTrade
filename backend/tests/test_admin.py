"""
admin 路由测试。

12 个接口，重点是：
  - 权限隔离：所有接口必须仅 admin 可访问（非 admin 必须 403）
  - 用户管理（封禁/解封/改角色/手动验证）
  - 商品管理（下架/恢复/审核）
  - 举报处理（解决/驳回）
"""
from datetime import datetime, timezone, timedelta
from bson import ObjectId


# =====================================================
# 权限隔离：抽样验证非 admin 访问关键接口都是 403
# =====================================================
class TestAdminPermissionIsolation:
    """挑几个有代表性的接口验证非 admin 用户被拦下。"""

    async def test_non_admin_cannot_list_users(
        self, client, verified_user, auth_headers
    ):
        resp = await client.get(
            "/admin/users", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 403

    async def test_non_admin_cannot_ban(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/users/{ObjectId()}/ban",
            headers=auth_headers(verified_user),
            json={"reason": "test"},
        )
        assert resp.status_code == 403

    async def test_non_admin_cannot_takedown(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/products/{ObjectId()}/takedown",
            headers=auth_headers(verified_user),
            json={"reason": "test"},
        )
        assert resp.status_code == 403

    async def test_non_admin_cannot_list_reports(
        self, client, verified_user, auth_headers
    ):
        resp = await client.get(
            "/admin/reports", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 403

    async def test_non_admin_cannot_review_product(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/products/{ObjectId()}/review",
            headers=auth_headers(verified_user),
            json={"action": "approve"},
        )
        assert resp.status_code == 403

    async def test_anonymous_request_blocked(self, client):
        resp = await client.get("/admin/users")
        assert resp.status_code in (401, 403)


# =====================================================
# GET /admin/users  —— 用户列表
# =====================================================
class TestListUsers:
    async def test_list_users_success(
        self,
        client,
        admin_user,
        verified_user,
        auth_headers,
    ):
        resp = await client.get(
            "/admin/users", headers=auth_headers(admin_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 2
        usernames = {u["username"] for u in body["items"]}
        assert {admin_user["username"], verified_user["username"]} <= usernames

    async def test_list_users_search(
        self, client, admin_user, verified_user, auth_headers
    ):
        resp = await client.get(
            f"/admin/users?q={verified_user['username']}",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 200
        body = resp.json()
        usernames = {u["username"] for u in body["items"]}
        assert verified_user["username"] in usernames

    async def test_list_users_pagination(
        self, client, db, admin_user, auth_headers, make_user
    ):
        for i in range(5):
            await make_user(
                email=f"u{i}@university.edu", username=f"u{i}"
            )
        resp = await client.get(
            "/admin/users?page=1&size=2", headers=auth_headers(admin_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["items"]) == 2
        assert body["page"] == 1
        assert body["size"] == 2


# =====================================================
# POST /admin/users/{id}/ban  和 unban
# =====================================================
class TestBanUnbanUser:
    async def test_ban_user_success(
        self, client, db, admin_user, verified_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/users/{verified_user['id']}/ban",
            headers=auth_headers(admin_user),
            json={"reason": "spam"},
        )
        assert resp.status_code == 200

        after = await db.users.find_one({"_id": verified_user["_id"]})
        assert after["banned"] is True
        assert after.get("ban_reason") == "spam"

    async def test_admin_cannot_ban_self(
        self, client, admin_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/users/{admin_user['id']}/ban",
            headers=auth_headers(admin_user),
            json={"reason": "x"},
        )
        assert resp.status_code == 400

    async def test_ban_unknown_user_returns_404(
        self, client, admin_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/users/{ObjectId()}/ban",
            headers=auth_headers(admin_user),
            json={"reason": "x"},
        )
        assert resp.status_code == 404

    async def test_ban_invalid_user_id(
        self, client, admin_user, auth_headers
    ):
        resp = await client.post(
            "/admin/users/not-a-valid-id/ban",
            headers=auth_headers(admin_user),
            json={"reason": "x"},
        )
        assert resp.status_code == 400

    async def test_unban_user_success(
        self, client, db, admin_user, make_user, auth_headers
    ):
        banned = await make_user(
            email="banned@university.edu", username="banned", banned=True
        )
        resp = await client.post(
            f"/admin/users/{banned['id']}/unban",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 200

        after = await db.users.find_one({"_id": banned["_id"]})
        assert after["banned"] is False


# =====================================================
# POST /admin/users/{id}/role
# =====================================================
class TestSetUserRole:
    async def test_set_role_success(
        self, client, db, admin_user, verified_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/users/{verified_user['id']}/role",
            headers=auth_headers(admin_user),
            json={"role": "moderator"},
        )
        assert resp.status_code == 200
        after = await db.users.find_one({"_id": verified_user["_id"]})
        assert after["role"] == "moderator"

    async def test_admin_cannot_change_own_role(
        self, client, admin_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/users/{admin_user['id']}/role",
            headers=auth_headers(admin_user),
            json={"role": "user"},
        )
        assert resp.status_code == 400

    async def test_invalid_role_rejected(
        self, client, admin_user, verified_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/users/{verified_user['id']}/role",
            headers=auth_headers(admin_user),
            json={"role": "superadmin"},
        )
        assert resp.status_code == 400


# =====================================================
# PATCH /admin/users/{id}/verify
# =====================================================
class TestSetUserVerified:
    async def test_admin_can_verify_user(
        self, client, db, admin_user, unverified_user, auth_headers
    ):
        resp = await client.patch(
            f"/admin/users/{unverified_user['id']}/verify",
            headers=auth_headers(admin_user),
            json={"is_verified": True},
        )
        assert resp.status_code == 200
        after = await db.users.find_one({"_id": unverified_user["_id"]})
        assert after["is_verified"] is True

    async def test_admin_can_unverify_user(
        self, client, db, admin_user, verified_user, auth_headers
    ):
        resp = await client.patch(
            f"/admin/users/{verified_user['id']}/verify",
            headers=auth_headers(admin_user),
            json={"is_verified": False},
        )
        assert resp.status_code == 200
        after = await db.users.find_one({"_id": verified_user["_id"]})
        assert after["is_verified"] is False


# =====================================================
# GET /admin/products  和  /admin/products/pending
# =====================================================
class TestAdminListProducts:
    async def test_list_returns_paginated_products(
        self, client, admin_user, verified_user, auth_headers, make_product
    ):
        for i in range(3):
            await make_product(verified_user, title=f"P{i}")
        resp = await client.get(
            "/admin/products", headers=auth_headers(admin_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 3

    async def test_list_filtered_by_status(
        self, client, admin_user, verified_user, auth_headers, make_product
    ):
        await make_product(verified_user, title="LiveOne", status="available")
        await make_product(verified_user, title="HiddenOne", status="removed")
        resp = await client.get(
            "/admin/products?status=removed",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 200
        titles = [p["title"] for p in resp.json()["items"]]
        assert "HiddenOne" in titles
        assert "LiveOne" not in titles

    async def test_pending_list_only_returns_pending(
        self, client, admin_user, verified_user, auth_headers, make_product
    ):
        await make_product(verified_user, title="WaitReview", status="pending")
        await make_product(verified_user, title="Already", status="available")
        resp = await client.get(
            "/admin/products/pending", headers=auth_headers(admin_user)
        )
        assert resp.status_code == 200
        titles = [p["title"] for p in resp.json()["items"]]
        assert "WaitReview" in titles
        assert "Already" not in titles


# =====================================================
# POST /admin/products/{id}/takedown  和  restore
# =====================================================
class TestTakedownRestore:
    async def test_takedown_success(
        self, client, db, admin_user, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="available")
        resp = await client.post(
            f"/admin/products/{product['id']}/takedown",
            headers=auth_headers(admin_user),
            json={"reason": "Inappropriate content"},
        )
        assert resp.status_code == 200

        after = await db.products.find_one({"_id": product["_id"]})
        assert after["status"] == "removed"
        assert after.get("removed_reason") == "Inappropriate content"

    async def test_cannot_takedown_already_removed(
        self, client, admin_user, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="removed")
        resp = await client.post(
            f"/admin/products/{product['id']}/takedown",
            headers=auth_headers(admin_user),
            json={"reason": "again"},
        )
        assert resp.status_code == 400

    async def test_takedown_not_found(
        self, client, admin_user, auth_headers
    ):
        resp = await client.post(
            f"/admin/products/{ObjectId()}/takedown",
            headers=auth_headers(admin_user),
            json={"reason": "x"},
        )
        assert resp.status_code == 404

    async def test_restore_success(
        self, client, db, admin_user, verified_user, auth_headers, make_product
    ):
        # 模拟"先被下架"的状态
        from datetime import datetime
        product = await make_product(verified_user, status="removed")
        await db.products.update_one(
            {"_id": product["_id"]},
            {"$set": {
                "previous_status": "available",
                "removed_at": datetime.utcnow(),
            }},
        )
        resp = await client.post(
            f"/admin/products/{product['id']}/restore",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 200
        after = await db.products.find_one({"_id": product["_id"]})
        assert after["status"] == "available"

    async def test_cannot_restore_non_removed(
        self, client, admin_user, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="available")
        resp = await client.post(
            f"/admin/products/{product['id']}/restore",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 400


# =====================================================
# GET /admin/reports  和  POST /admin/reports/{id}/resolve
# =====================================================
class TestAdminReports:
    async def _make_report(self, db, reporter, product, status="pending"):
        doc = {
            "product_id": product["_id"],
            "reporter_id": reporter["_id"],
            "reason": "spam",
            "description": "test",
            "status": status,
            "created_at": datetime.now(timezone.utc),
        }
        result = await db.reports.insert_one(doc)
        doc["_id"] = result.inserted_id
        doc["id"] = str(result.inserted_id)
        return doc

    async def test_list_reports(
        self,
        client,
        db,
        admin_user,
        buyer_user,
        seller_user,
        auth_headers,
        make_product,
    ):
        product = await make_product(seller_user, status="available")
        await self._make_report(db, buyer_user, product)
        resp = await client.get(
            "/admin/reports", headers=auth_headers(admin_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1

    async def test_list_reports_filter_by_status(
        self,
        client,
        db,
        admin_user,
        buyer_user,
        seller_user,
        auth_headers,
        make_product,
    ):
        product = await make_product(seller_user, status="available")
        await self._make_report(db, buyer_user, product, status="pending")
        await self._make_report(db, buyer_user, product, status="resolved")

        resp = await client.get(
            "/admin/reports?status=resolved",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1

    async def test_resolve_report_takedown_action(
        self,
        client,
        db,
        admin_user,
        buyer_user,
        seller_user,
        auth_headers,
        make_product,
    ):
        product = await make_product(seller_user, status="available")
        report = await self._make_report(db, buyer_user, product)
        resp = await client.post(
            f"/admin/reports/{report['id']}/resolve",
            headers=auth_headers(admin_user),
            json={"status": "takedown", "admin_note": "violates policy"},
        )
        assert resp.status_code == 200

        # 举报被标 resolved
        r_after = await db.reports.find_one({"_id": report["_id"]})
        assert r_after["status"] == "resolved"

        # 商品被下架
        p_after = await db.products.find_one({"_id": product["_id"]})
        assert p_after["status"] == "removed"

    async def test_resolve_report_dismissed_action(
        self,
        client,
        db,
        admin_user,
        buyer_user,
        seller_user,
        auth_headers,
        make_product,
    ):
        product = await make_product(seller_user, status="available")
        report = await self._make_report(db, buyer_user, product)
        resp = await client.post(
            f"/admin/reports/{report['id']}/resolve",
            headers=auth_headers(admin_user),
            json={"status": "dismissed"},
        )
        assert resp.status_code == 200

        # 举报被标 dismissed，商品仍在售
        r_after = await db.reports.find_one({"_id": report["_id"]})
        assert r_after["status"] == "dismissed"
        p_after = await db.products.find_one({"_id": product["_id"]})
        assert p_after["status"] == "available"

    async def test_resolve_invalid_status(
        self,
        client,
        db,
        admin_user,
        buyer_user,
        seller_user,
        auth_headers,
        make_product,
    ):
        product = await make_product(seller_user, status="available")
        report = await self._make_report(db, buyer_user, product)
        resp = await client.post(
            f"/admin/reports/{report['id']}/resolve",
            headers=auth_headers(admin_user),
            json={"status": "ignore-it"},
        )
        assert resp.status_code == 400


# =====================================================
# POST /admin/products/{id}/review (approve / reject)
# =====================================================
class TestReviewProduct:
    async def test_approve_pending_product(
        self, client, db, admin_user, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="pending")
        resp = await client.post(
            f"/admin/products/{product['id']}/review",
            headers=auth_headers(admin_user),
            json={"action": "approve"},
        )
        assert resp.status_code == 200

        after = await db.products.find_one({"_id": product["_id"]})
        assert after["status"] == "available"

    async def test_reject_pending_product(
        self, client, db, admin_user, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="pending")
        resp = await client.post(
            f"/admin/products/{product['id']}/review",
            headers=auth_headers(admin_user),
            json={"action": "reject", "reason": "Bad photo"},
        )
        assert resp.status_code == 200

        after = await db.products.find_one({"_id": product["_id"]})
        assert after["status"] == "rejected"
        assert after.get("reject_reason") == "Bad photo"

    async def test_review_invalid_action(
        self, client, admin_user, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="pending")
        resp = await client.post(
            f"/admin/products/{product['id']}/review",
            headers=auth_headers(admin_user),
            json={"action": "explode"},
        )
        assert resp.status_code == 400

    async def test_cannot_review_non_pending_product(
        self, client, admin_user, verified_user, auth_headers, make_product
    ):
        """对已上架（status=available）的商品不能"审核"，因为 status != pending。"""
        product = await make_product(verified_user, status="available")
        resp = await client.post(
            f"/admin/products/{product['id']}/review",
            headers=auth_headers(admin_user),
            json={"action": "approve"},
        )
        assert resp.status_code == 400


# =====================================================
# 跨模块集成：admin 操作触发卖家通知
# =====================================================
class TestAdminNotificationSideEffects:
    """验证 admin 模块在用户内容变更时真的会触发对卖家的通知。"""

    async def test_takedown_notifies_seller(
        self,
        client,
        admin_user,
        verified_user,
        auth_headers,
        make_product,
        notification_spy,
    ):
        product = await make_product(verified_user, status="available")
        resp = await client.post(
            f"/admin/products/{product['id']}/takedown",
            headers=auth_headers(admin_user),
            json={"reason": "Inappropriate content"},
        )
        assert resp.status_code == 200

        # 卖家应收到 product_takedown 通知
        seller_notifs = [
            c for c in notification_spy
            if c["user_id"] == verified_user["id"]
        ]
        assert len(seller_notifs) == 1
        assert seller_notifs[0]["ntype"] == "product_takedown"
        assert "removed" in seller_notifs[0]["body"].lower()

    async def test_restore_notifies_seller(
        self,
        client,
        db,
        admin_user,
        verified_user,
        auth_headers,
        make_product,
        notification_spy,
    ):
        from datetime import datetime
        product = await make_product(verified_user, status="removed")
        await db.products.update_one(
            {"_id": product["_id"]},
            {"$set": {
                "previous_status": "available",
                "removed_at": datetime.utcnow(),
            }},
        )
        resp = await client.post(
            f"/admin/products/{product['id']}/restore",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 200

        seller_notifs = [
            c for c in notification_spy
            if c["user_id"] == verified_user["id"]
        ]
        assert len(seller_notifs) == 1
        assert seller_notifs[0]["ntype"] == "product_restored"

    async def test_resolve_report_takedown_notifies_seller(
        self,
        client,
        db,
        admin_user,
        buyer_user,
        seller_user,
        auth_headers,
        make_product,
        notification_spy,
    ):
        """处理举报时若选择 takedown，卖家应收到下架通知。"""
        from datetime import datetime, timezone
        product = await make_product(seller_user, status="available")
        # 直接造一条 pending 举报
        report_doc = {
            "product_id": product["_id"],
            "reporter_id": buyer_user["_id"],
            "reason": "spam",
            "description": "test",
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
        }
        result = await db.reports.insert_one(report_doc)

        resp = await client.post(
            f"/admin/reports/{result.inserted_id}/resolve",
            headers=auth_headers(admin_user),
            json={"status": "takedown", "admin_note": "violates policy"},
        )
        assert resp.status_code == 200

        seller_notifs = [
            c for c in notification_spy
            if c["user_id"] == seller_user["id"]
        ]
        assert len(seller_notifs) == 1
        assert seller_notifs[0]["ntype"] == "product_takedown"

    async def test_review_approve_notifies_seller(
        self,
        client,
        admin_user,
        verified_user,
        auth_headers,
        make_product,
        notification_spy,
    ):
        product = await make_product(verified_user, status="pending")
        resp = await client.post(
            f"/admin/products/{product['id']}/review",
            headers=auth_headers(admin_user),
            json={"action": "approve"},
        )
        assert resp.status_code == 200

        seller_notifs = [
            c for c in notification_spy
            if c["user_id"] == verified_user["id"]
        ]
        assert len(seller_notifs) == 1
        assert seller_notifs[0]["ntype"] == "product_review"
        assert "approved" in seller_notifs[0]["title"].lower()

    async def test_review_reject_notifies_seller(
        self,
        client,
        admin_user,
        verified_user,
        auth_headers,
        make_product,
        notification_spy,
    ):
        product = await make_product(verified_user, status="pending")
        resp = await client.post(
            f"/admin/products/{product['id']}/review",
            headers=auth_headers(admin_user),
            json={"action": "reject", "reason": "Bad photo"},
        )
        assert resp.status_code == 200

        seller_notifs = [
            c for c in notification_spy
            if c["user_id"] == verified_user["id"]
        ]
        assert len(seller_notifs) == 1
        assert seller_notifs[0]["ntype"] == "product_review"
        assert "reject" in seller_notifs[0]["title"].lower()
