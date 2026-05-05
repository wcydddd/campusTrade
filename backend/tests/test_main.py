"""
main.py 顶层接口（不属于任何 router 前缀）：
  - GET /        欢迎页
  - GET /health  健康检查（部署监控用）
"""


class TestRootEndpoints:
    async def test_root_returns_welcome_message(self, client):
        resp = await client.get("/")
        assert resp.status_code == 200
        body = resp.json()
        assert "message" in body
        assert "CampusTrade" in body["message"]
        assert body.get("version") is not None
        assert body.get("docs") == "/docs"

    async def test_health_check(self, client):
        """部署后监控用：返回 status=healthy 表示服务存活。"""
        resp = await client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "healthy"
        assert body["service"] == "campustrade-api"

    async def test_health_check_does_not_require_auth(self, client):
        """健康检查必须无需鉴权（监控系统不带 token）。"""
        # 不带任何 header
        resp = await client.get("/health")
        assert resp.status_code == 200
