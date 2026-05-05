"""
images 路由测试。
仅 1 个接口（GET /images/{image_id}），从 GridFS 流式返回图片。

测试要点：
  - 成功路径用 fake_gridfs fixture 提供内存 GridFS 替身
  - id 非法 → 400
  - 文件不存在 → 404（GridFS 抛 NoFile）
  - 缓存头正确
"""
from bson import ObjectId


class TestGetImage:
    async def test_get_image_success(self, client, fake_gridfs):
        file_id = ObjectId()
        fake_gridfs.put(
            file_id, b"\x89PNG\r\n\x1a\nfake-bytes",
            content_type="image/png", filename="x.png",
        )

        resp = await client.get(f"/images/{file_id}")
        assert resp.status_code == 200
        # 返回的内容应是我们存进去的字节
        assert resp.content == b"\x89PNG\r\n\x1a\nfake-bytes"

    async def test_get_image_returns_correct_content_type(
        self, client, fake_gridfs
    ):
        file_id = ObjectId()
        fake_gridfs.put(file_id, b"jpeg-bytes", content_type="image/jpeg")
        resp = await client.get(f"/images/{file_id}")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/jpeg"

    async def test_get_image_sets_cache_header(
        self, client, fake_gridfs
    ):
        """图片接口应当带 immutable 缓存头，让前端长期缓存。"""
        file_id = ObjectId()
        fake_gridfs.put(file_id, b"x", content_type="image/png")
        resp = await client.get(f"/images/{file_id}")
        assert resp.status_code == 200
        assert "immutable" in resp.headers.get("cache-control", "")

    async def test_invalid_id_returns_400(self, client, fake_gridfs):
        resp = await client.get("/images/not-an-objectid")
        assert resp.status_code == 400

    async def test_image_not_found_returns_404(self, client, fake_gridfs):
        # 没有 put，直接查
        resp = await client.get(f"/images/{ObjectId()}")
        assert resp.status_code == 404
