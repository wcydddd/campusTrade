"""
ai 路由测试。
4 个接口：
  - GET /ai/usage（查询今日 AI 配额使用情况）
  - POST /ai/analyze（AI 分析图片，每天 20 次配额）
  - POST /ai/analyze-and-save（同上 + 把图存入 GridFS）
  - GET /ai/categories（公开，返回分类列表）

要点：
  - analyze_image 已在 conftest 中 mock（不会真请求 OpenAI）
  - upload_raw_to_gridfs 也已 mock
  - 配额逻辑用 ai_usage 集合的 count 字段控制
"""
from io import BytesIO
from datetime import datetime


# =====================================================
# GET /ai/usage
# =====================================================
class TestAIUsage:
    async def test_usage_when_no_calls(
        self, client, verified_user, auth_headers
    ):
        resp = await client.get(
            "/ai/usage", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["used"] == 0
        assert body["remaining"] == 20
        assert body["limit"] == 20

    async def test_usage_reflects_count(
        self, client, db, verified_user, auth_headers
    ):
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        await db.ai_usage.insert_one({
            "user_id": verified_user["_id"],
            "date": today,
            "count": 7,
            "created_at": datetime.utcnow(),
        })
        resp = await client.get(
            "/ai/usage", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["used"] == 7
        assert body["remaining"] == 13

    async def test_usage_at_quota_boundary_19_to_20(
        self, client, db, verified_user, auth_headers
    ):
        """边界：count=19 → 调一次 /ai/analyze → /ai/usage 应显示 used=20, remaining=0。"""
        from io import BytesIO
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        await db.ai_usage.insert_one({
            "user_id": verified_user["_id"],
            "date": today,
            "count": 19,
            "created_at": datetime.utcnow(),
        })

        # 第 20 次调用 - 应当成功
        r1 = await client.post(
            "/ai/analyze",
            headers=auth_headers(verified_user),
            files={"file": ("img.jpg", BytesIO(b"x"), "image/jpeg")},
        )
        assert r1.status_code == 200
        assert r1.json()["quota"]["used"] == 20
        assert r1.json()["quota"]["remaining"] == 0

        # /ai/usage 也应反映 20/0
        r2 = await client.get(
            "/ai/usage", headers=auth_headers(verified_user)
        )
        assert r2.status_code == 200
        assert r2.json()["used"] == 20
        assert r2.json()["remaining"] == 0

        # 第 21 次应被拒
        r3 = await client.post(
            "/ai/analyze",
            headers=auth_headers(verified_user),
            files={"file": ("img.jpg", BytesIO(b"x"), "image/jpeg")},
        )
        assert r3.status_code == 429

    async def test_usage_resets_across_days(
        self, client, db, verified_user, auth_headers
    ):
        """昨天 count=20 不应影响今天的配额——每天独立计数。"""
        from datetime import timedelta
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)
        # 预置昨天的"已用满"记录
        await db.ai_usage.insert_one({
            "user_id": verified_user["_id"],
            "date": yesterday,
            "count": 20,
            "created_at": yesterday,
        })

        resp = await client.get(
            "/ai/usage", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        # 今天应当全新
        assert resp.json()["used"] == 0
        assert resp.json()["remaining"] == 20

    async def test_usage_invalid_user_id_returns_401(
        self, client, verified_user, auth_headers
    ):
        """JWT 中 sub 字段非法时（理论上不会发生但路由有此分支）应返回 401。"""
        from utils.security import create_access_token
        # 伪造一个 sub 不是合法 ObjectId 的 token
        bad_token = create_access_token({"sub": "not-an-objectid", "email": "x@u.edu"})
        resp = await client.get(
            "/ai/usage",
            headers={"Authorization": f"Bearer {bad_token}"},
        )
        assert resp.status_code == 401


# =====================================================
# POST /ai/analyze
# =====================================================
class TestAnalyzeImage:
    async def test_analyze_success(self, client, verified_user, auth_headers):
        fake_img = BytesIO(b"fake-image")
        resp = await client.post(
            "/ai/analyze",
            headers=auth_headers(verified_user),
            files={"file": ("img.jpg", fake_img, "image/jpeg")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        # conftest mock 返回的固定值
        assert body["data"]["title"] == "AI Generated Title"
        assert body["quota"]["used"] == 1

    async def test_analyze_invalid_extension(
        self, client, verified_user, auth_headers
    ):
        fake = BytesIO(b"x")
        resp = await client.post(
            "/ai/analyze",
            headers=auth_headers(verified_user),
            files={"file": ("doc.pdf", fake, "application/pdf")},
        )
        assert resp.status_code == 400

    async def test_analyze_quota_exceeded(
        self, client, db, verified_user, auth_headers
    ):
        """预置配额已满，第 21 次调用应被拒绝。"""
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        await db.ai_usage.insert_one({
            "user_id": verified_user["_id"],
            "date": today,
            "count": 20,
            "created_at": datetime.utcnow(),
        })
        resp = await client.post(
            "/ai/analyze",
            headers=auth_headers(verified_user),
            files={"file": ("img.jpg", BytesIO(b"x"), "image/jpeg")},
        )
        assert resp.status_code == 429

    async def test_analyze_unverified_user_forbidden(
        self, client, unverified_user, auth_headers
    ):
        resp = await client.post(
            "/ai/analyze",
            headers=auth_headers(unverified_user),
            files={"file": ("img.jpg", BytesIO(b"x"), "image/jpeg")},
        )
        assert resp.status_code == 403

    async def test_analyze_returns_500_on_ai_failure(
        self, client, verified_user, auth_headers, monkeypatch
    ):
        """AI 服务返回 success=False 时，应返回 500。"""
        async def _fail_ai(*args, **kwargs):
            return {"success": False, "error": "AI service unavailable"}

        monkeypatch.setattr("routes.ai.analyze_image", _fail_ai)

        resp = await client.post(
            "/ai/analyze",
            headers=auth_headers(verified_user),
            files={"file": ("img.jpg", BytesIO(b"x"), "image/jpeg")},
        )
        assert resp.status_code == 500

    async def test_analyze_oversized_file_returns_413(
        self, client, verified_user, auth_headers
    ):
        """超大文件应返回 413（与 /ai/analyze-and-save 保持一致；2026-04 修复）。"""
        from config import settings
        oversize = b"x" * (settings.max_upload_size_mb * 1024 * 1024 + 1)
        resp = await client.post(
            "/ai/analyze",
            headers=auth_headers(verified_user),
            files={"file": ("big.jpg", BytesIO(oversize), "image/jpeg")},
        )
        assert resp.status_code == 413


# =====================================================
# POST /ai/analyze-and-save
# =====================================================
class TestAnalyzeAndSave:
    async def test_analyze_and_save_success(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            "/ai/analyze-and-save",
            headers=auth_headers(verified_user),
            files={"file": ("img.jpg", BytesIO(b"fake"), "image/jpeg")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["image_url"] is not None
        # 存的是 mock 的伪 URL
        assert body["image_url"].startswith("/avatars/")

    async def test_analyze_and_save_invalid_extension(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            "/ai/analyze-and-save",
            headers=auth_headers(verified_user),
            files={"file": ("doc.pdf", BytesIO(b"x"), "application/pdf")},
        )
        assert resp.status_code == 400

    async def test_analyze_and_save_quota_exceeded(
        self, client, db, verified_user, auth_headers
    ):
        """同 /ai/analyze——配额满了应返回 429。"""
        today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        await db.ai_usage.insert_one({
            "user_id": verified_user["_id"],
            "date": today,
            "count": 20,
            "created_at": datetime.utcnow(),
        })
        resp = await client.post(
            "/ai/analyze-and-save",
            headers=auth_headers(verified_user),
            files={"file": ("img.jpg", BytesIO(b"x"), "image/jpeg")},
        )
        assert resp.status_code == 429

    async def test_analyze_and_save_unverified_user_forbidden(
        self, client, unverified_user, auth_headers
    ):
        resp = await client.post(
            "/ai/analyze-and-save",
            headers=auth_headers(unverified_user),
            files={"file": ("img.jpg", BytesIO(b"x"), "image/jpeg")},
        )
        assert resp.status_code == 403

    async def test_analyze_and_save_returns_500_on_ai_failure(
        self, client, verified_user, auth_headers, monkeypatch
    ):
        async def _fail_ai(*args, **kwargs):
            return {"success": False, "error": "AI service down"}

        monkeypatch.setattr("routes.ai.analyze_image", _fail_ai)

        resp = await client.post(
            "/ai/analyze-and-save",
            headers=auth_headers(verified_user),
            files={"file": ("img.jpg", BytesIO(b"x"), "image/jpeg")},
        )
        assert resp.status_code == 500

    async def test_analyze_and_save_oversized_file_returns_413(
        self, client, verified_user, auth_headers
    ):
        """超大文件 → 413（与 /ai/analyze 已统一为 413）。"""
        from config import settings
        oversize = b"x" * (settings.max_upload_size_mb * 1024 * 1024 + 1)
        resp = await client.post(
            "/ai/analyze-and-save",
            headers=auth_headers(verified_user),
            files={"file": ("big.jpg", BytesIO(oversize), "image/jpeg")},
        )
        assert resp.status_code == 413

    async def test_analyze_and_save_gridfs_failure_returns_500(
        self, client, verified_user, auth_headers, monkeypatch
    ):
        """
        GridFS 上传失败时（磁盘满 / 网络错），路由没 try-catch。
        生产环境 uvicorn 会兜底返 500；测试用 raise_app_exceptions=False 模拟生产行为。
        """
        from httpx import AsyncClient, ASGITransport
        from main import app

        async def _fail_upload(*args, **kwargs):
            raise RuntimeError("GridFS write failed: disk full")

        monkeypatch.setattr("routes.ai.upload_raw_to_gridfs", _fail_upload)

        # 生产 uvicorn 会把未捕获异常包成 500；ASGITransport 默认会 propagate
        # → 显式设 raise_app_exceptions=False，模拟生产行为
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
            resp = await ac.post(
                "/ai/analyze-and-save",
                headers=auth_headers(verified_user),
                files={"file": ("img.jpg", BytesIO(b"x"), "image/jpeg")},
            )
        assert resp.status_code == 500


# =====================================================
# GET /ai/categories
# =====================================================
class TestAICategories:
    async def test_returns_category_list(self, client):
        resp = await client.get("/ai/categories")
        assert resp.status_code == 200
        body = resp.json()
        assert "categories" in body
        assert isinstance(body["categories"], list)
        assert len(body["categories"]) > 0
