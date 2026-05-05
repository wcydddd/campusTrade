"""
notifications 路由测试。
覆盖：列表 / 未读数 / 标记单条已读 / 按 chat link 批量已读 / 全部已读 / 清空。

要点：
  - 这些接口用 get_current_user，未验证邮箱用户也能用（与 messages 不同）
  - 所有接口都要确保"只能操作自己的通知"——隔离很关键
"""
from datetime import datetime, timedelta
from bson import ObjectId


def _make_notif(user_id, *, title="Notice", body="something", read=False,
                link=None, ntype="system", created_at=None):
    """直接构造 notifications 集合的文档。"""
    return {
        "user_id": user_id,
        "type": ntype,
        "title": title,
        "body": body,
        "read": read,
        "link": link,
        "meta": {},
        "created_at": created_at or datetime.utcnow(),
    }


# =====================================================
# GET /notifications  —— 列表
# =====================================================
class TestListNotifications:
    async def test_list_returns_user_notifications(
        self, client, db, verified_user, auth_headers
    ):
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], title="Hello"
        ))
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], title="World"
        ))

        resp = await client.get(
            "/notifications", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        titles = {n["title"] for n in resp.json()}
        assert titles == {"Hello", "World"}

    async def test_list_sorted_newest_first(
        self, client, db, verified_user, auth_headers
    ):
        now = datetime.utcnow()
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], title="Old",
            created_at=now - timedelta(hours=1),
        ))
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], title="New",
            created_at=now,
        ))

        resp = await client.get(
            "/notifications", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body[0]["title"] == "New"
        assert body[1]["title"] == "Old"

    async def test_list_unread_only_filter(
        self, client, db, verified_user, auth_headers
    ):
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], title="UnreadOne", read=False
        ))
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], title="ReadOne", read=True
        ))

        resp = await client.get(
            "/notifications?unread_only=true",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        titles = [n["title"] for n in resp.json()]
        assert titles == ["UnreadOne"]

    async def test_list_does_not_leak_others_notifications(
        self, client, db, verified_user, admin_user, auth_headers
    ):
        # admin 的通知不应出现在 verified_user 的列表里
        await db.notifications.insert_one(_make_notif(
            admin_user["_id"], title="AdminPrivate"
        ))

        resp = await client.get(
            "/notifications", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_list_respects_limit(
        self, client, db, verified_user, auth_headers
    ):
        for i in range(5):
            await db.notifications.insert_one(_make_notif(
                verified_user["_id"], title=f"n{i}",
                created_at=datetime.utcnow() - timedelta(minutes=i),
            ))
        resp = await client.get(
            "/notifications?limit=2", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    async def test_list_respects_skip(
        self, client, db, verified_user, auth_headers
    ):
        for i in range(5):
            await db.notifications.insert_one(_make_notif(
                verified_user["_id"], title=f"n{i}",
                created_at=datetime.utcnow() - timedelta(minutes=i),
            ))
        resp = await client.get(
            "/notifications?skip=2&limit=2",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        body = resp.json()
        # 跳过最新 n0/n1 后下一页是 n2/n3
        assert {n["title"] for n in body} == {"n2", "n3"}

    async def test_list_requires_authentication(self, client):
        resp = await client.get("/notifications")
        assert resp.status_code in (401, 403)


# =====================================================
# GET /notifications/unread-count
# =====================================================
class TestUnreadCount:
    async def test_returns_correct_count(
        self, client, db, verified_user, auth_headers
    ):
        for _ in range(3):
            await db.notifications.insert_one(_make_notif(
                verified_user["_id"], read=False
            ))
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], read=True
        ))

        resp = await client.get(
            "/notifications/unread-count",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 3

    async def test_zero_when_no_notifications(
        self, client, verified_user, auth_headers
    ):
        resp = await client.get(
            "/notifications/unread-count",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        assert resp.json()["unread_count"] == 0


# =====================================================
# POST /notifications/{id}/read  —— 标记单条已读
# =====================================================
class TestMarkOneRead:
    async def test_mark_read_success(
        self, client, db, verified_user, auth_headers
    ):
        notif = _make_notif(verified_user["_id"], read=False)
        result = await db.notifications.insert_one(notif)
        nid = result.inserted_id

        resp = await client.post(
            f"/notifications/{nid}/read",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True
        assert resp.json()["total_unread"] == 0

        # DB 中已被标记
        after = await db.notifications.find_one({"_id": nid})
        assert after["read"] is True

    async def test_cannot_mark_other_users_notification(
        self, client, db, verified_user, admin_user, auth_headers
    ):
        """A 不能把 B 的通知标为已读（404 而非 403，避免泄漏 id 是否存在）。"""
        notif = _make_notif(admin_user["_id"], read=False)
        result = await db.notifications.insert_one(notif)

        resp = await client.post(
            f"/notifications/{result.inserted_id}/read",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 404

    async def test_mark_unknown_notification_returns_404(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            f"/notifications/{ObjectId()}/read",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 404

    async def test_mark_invalid_id_returns_400(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            "/notifications/not-a-valid-id/read",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 400


# =====================================================
# POST /notifications/read-by-link
# =====================================================
class TestReadByLink:
    async def test_marks_matching_chat_link(
        self, client, db, verified_user, auth_headers
    ):
        """标记所有 link 等于或以指定 chat 链接开头的通知为已读。"""
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], read=False, link="/chat/123"
        ))
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], read=False, link="/chat/123?product=abc"
        ))
        # 不同 chat 的通知不应被影响
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], read=False, link="/chat/999"
        ))

        resp = await client.post(
            "/notifications/read-by-link",
            headers=auth_headers(verified_user),
            json={"link": "/chat/123"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["marked"] == 2

        # /chat/999 的通知仍未读
        other = await db.notifications.find_one({"link": "/chat/999"})
        assert other["read"] is False

    async def test_non_chat_link_returns_zero(
        self, client, db, verified_user, auth_headers
    ):
        """非 /chat/ 开头的 link 直接返回 marked=0，不做任何修改。"""
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], read=False, link="/products/abc"
        ))

        resp = await client.post(
            "/notifications/read-by-link",
            headers=auth_headers(verified_user),
            json={"link": "/products/abc"},
        )
        assert resp.status_code == 200
        assert resp.json()["marked"] == 0

        # 通知仍未读
        n = await db.notifications.find_one({"link": "/products/abc"})
        assert n["read"] is False

    async def test_read_by_link_only_affects_current_user(
        self, client, db, verified_user, admin_user, auth_headers
    ):
        # 两个用户都有同样 link 的未读通知
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"], read=False, link="/chat/abc"
        ))
        await db.notifications.insert_one(_make_notif(
            admin_user["_id"], read=False, link="/chat/abc"
        ))

        # verified_user 调接口
        resp = await client.post(
            "/notifications/read-by-link",
            headers=auth_headers(verified_user),
            json={"link": "/chat/abc"},
        )
        assert resp.status_code == 200
        assert resp.json()["marked"] == 1

        # admin 的通知仍未读
        admin_n = await db.notifications.find_one({
            "user_id": admin_user["_id"]
        })
        assert admin_n["read"] is False


# =====================================================
# POST /notifications/read-all
# =====================================================
class TestReadAll:
    async def test_marks_all_user_notifications_read(
        self, client, db, verified_user, auth_headers
    ):
        for _ in range(3):
            await db.notifications.insert_one(_make_notif(
                verified_user["_id"], read=False
            ))

        resp = await client.post(
            "/notifications/read-all",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        assert resp.json()["total_unread"] == 0

        # 全部应已读
        unread = await db.notifications.count_documents({
            "user_id": verified_user["_id"], "read": False,
        })
        assert unread == 0

    async def test_read_all_does_not_affect_other_users(
        self, client, db, verified_user, admin_user, auth_headers
    ):
        await db.notifications.insert_one(_make_notif(
            admin_user["_id"], read=False
        ))

        resp = await client.post(
            "/notifications/read-all",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200

        # admin 的通知仍未读
        admin_unread = await db.notifications.count_documents({
            "user_id": admin_user["_id"], "read": False,
        })
        assert admin_unread == 1

    async def test_read_all_idempotent_on_empty(
        self, client, verified_user, auth_headers
    ):
        """没有任何通知时调用，仍应 200。"""
        resp = await client.post(
            "/notifications/read-all",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        assert resp.json()["total_unread"] == 0


# =====================================================
# POST /notifications/clear-all
# =====================================================
class TestClearAll:
    async def test_deletes_all_user_notifications(
        self, client, db, verified_user, auth_headers
    ):
        for _ in range(3):
            await db.notifications.insert_one(_make_notif(
                verified_user["_id"]
            ))

        resp = await client.post(
            "/notifications/clear-all",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200

        # DB 中应被全部删除
        count = await db.notifications.count_documents({
            "user_id": verified_user["_id"]
        })
        assert count == 0

    async def test_clear_all_only_affects_current_user(
        self, client, db, verified_user, admin_user, auth_headers
    ):
        await db.notifications.insert_one(_make_notif(
            verified_user["_id"]
        ))
        await db.notifications.insert_one(_make_notif(
            admin_user["_id"]
        ))

        resp = await client.post(
            "/notifications/clear-all",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200

        # admin 的通知应保留
        admin_count = await db.notifications.count_documents({
            "user_id": admin_user["_id"]
        })
        assert admin_count == 1

    async def test_clear_all_requires_authentication(self, client):
        resp = await client.post("/notifications/clear-all")
        assert resp.status_code in (401, 403)
