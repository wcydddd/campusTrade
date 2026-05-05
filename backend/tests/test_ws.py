"""
WebSocket 路由测试（/ws）。

WS 测试需要使用同步的 starlette TestClient（httpx.AsyncClient 不支持 WS）。
测试聚焦在"连接鉴权 + 协议正确性"层面：
  - 无 token / 错 token / 无 sub 都应被拒绝
  - 合法 token 接受连接
  - 收到 ping 回 pong
  - 收到非法 JSON / 未知类型应返回 error 消息

业务逻辑（chat / read 写库）在 REST `/messages` 测试里覆盖；WS 的 _handle_chat
和 _handle_read 与 REST 路径结构一致。
"""
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from main import app
from utils.security import create_access_token


@pytest.fixture
def ws_client():
    """同步 TestClient，专供 WS 测试用。"""
    return TestClient(app)


def _make_token(user_id: str | None = None, *, missing_sub: bool = False) -> str:
    """生成一个简单 JWT；missing_sub 时 sub 为 None 用来测异常分支。"""
    if missing_sub:
        return create_access_token(data={"email": "x@university.edu"})
    if user_id is None:
        user_id = str(ObjectId())
    return create_access_token(data={"sub": user_id, "email": "x@university.edu"})


# =====================================================
# 连接鉴权
# =====================================================
class TestWebSocketAuth:
    def test_no_token_disconnects(self, ws_client):
        """未带 token 的 WS 连接应立即被关闭。"""
        with pytest.raises(WebSocketDisconnect):
            with ws_client.websocket_connect("/ws") as ws:
                # 服务端应立即 close，receive 时抛 disconnect
                ws.receive_text()

    def test_bad_token_disconnects(self, ws_client):
        with pytest.raises(WebSocketDisconnect):
            with ws_client.websocket_connect("/ws?token=garbage-token") as ws:
                ws.receive_text()

    def test_token_without_sub_disconnects(self, ws_client):
        token = _make_token(missing_sub=True)
        with pytest.raises(WebSocketDisconnect):
            with ws_client.websocket_connect(f"/ws?token={token}") as ws:
                ws.receive_text()

    def test_valid_token_accepts_connection(self, ws_client):
        """合法 token 应接受连接（连入后能正常发心跳）。"""
        token = _make_token()
        with ws_client.websocket_connect(f"/ws?token={token}") as ws:
            ws.send_json({"type": "ping"})
            data = ws.receive_json()
            assert data["type"] == "pong"


# =====================================================
# 协议层：消息处理
# =====================================================
class TestWebSocketProtocol:
    def test_ping_pong(self, ws_client):
        token = _make_token()
        with ws_client.websocket_connect(f"/ws?token={token}") as ws:
            ws.send_json({"type": "ping"})
            assert ws.receive_json() == {"type": "pong"}

    def test_unknown_message_type_returns_error(self, ws_client):
        token = _make_token()
        with ws_client.websocket_connect(f"/ws?token={token}") as ws:
            ws.send_json({"type": "magic-spell"})
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "unknown" in data["message"].lower()

    def test_invalid_json_returns_error(self, ws_client):
        token = _make_token()
        with ws_client.websocket_connect(f"/ws?token={token}") as ws:
            ws.send_text("this is not json {{{")
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "json" in data["message"].lower()

    def test_chat_missing_required_fields_returns_error(self, ws_client):
        """chat 消息缺 to/content 字段应被拒绝。"""
        token = _make_token()
        with ws_client.websocket_connect(f"/ws?token={token}") as ws:
            # 缺 content
            ws.send_json({"type": "chat", "to": str(ObjectId())})
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "required" in data["message"].lower()

    def test_chat_to_self_returns_error(self, ws_client):
        """给自己发消息应被拒绝。"""
        my_id = str(ObjectId())
        token = _make_token(my_id)
        with ws_client.websocket_connect(f"/ws?token={token}") as ws:
            ws.send_json({
                "type": "chat", "to": my_id, "content": "talking to me",
            })
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "yourself" in data["message"].lower()

    def test_read_missing_other_user_id_returns_error(self, ws_client):
        token = _make_token()
        with ws_client.websocket_connect(f"/ws?token={token}") as ws:
            ws.send_json({"type": "read"})
            data = ws.receive_json()
            assert data["type"] == "error"
            assert "other_user_id" in data["message"]
