"""
共享测试 fixture：
  - `client`        ：httpx.AsyncClient（带 ASGITransport，直接打到 FastAPI app）
  - `db`            ：mongomock-motor 的内存数据库（每个用例隔离）
  - `make_user`     ：直接往 DB 塞一个用户（可指定 verified / role / banned）
  - `auth_headers`  ：基于 user_id 生成 JWT，返回 Authorization 头
  - `verified_user` / `admin_user`：常用角色的现成 fixture
"""
import sys
import os
from pathlib import Path
from datetime import datetime
from typing import Optional

import pytest
import pytest_asyncio
from bson import ObjectId
from httpx import AsyncClient, ASGITransport
from mongomock_motor import AsyncMongoMockClient

# 让 `backend/` 成为可导入的根（这样 `from main import app` 之类能直接用）
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# 在导入 app 之前设置必要的环境变量，避免真实 SMTP / OpenAI 被触发
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ALLOWED_EMAIL_DOMAINS", "@university.edu,@student.ac.uk")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017/test")

from main import app  # noqa: E402
from utils import database as database_module  # noqa: E402
from utils.security import create_access_token, hash_password  # noqa: E402
from config import settings  # noqa: E402


# ----------------------------------------------------------------------
# 数据库：用 mongomock-motor 替换全局 db.client
# ----------------------------------------------------------------------
@pytest_asyncio.fixture
async def db(monkeypatch):
    """每个测试都用一个全新的内存 MongoDB，避免数据互相污染。"""
    mock_client = AsyncMongoMockClient()
    monkeypatch.setattr(database_module.db, "client", mock_client)
    # gridfs_bucket 在用到上传图片的接口时再单独 mock
    # 必须用 settings.mongodb_db_name，否则 fixture 写到 "test_db"，
    # 但路由调用 get_database() 读的是 settings.mongodb_db_name，二者不一致会全部 404
    yield mock_client[settings.mongodb_db_name]


# ----------------------------------------------------------------------
# 屏蔽真实邮件 / 限流副作用
# ----------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _mute_external(monkeypatch):
    """所有测试默认：邮件直接成功、限流不阻挡。"""
    async def _noop_email(*args, **kwargs):
        return None

    monkeypatch.setattr("utils.email.send_verification_code", _noop_email)
    monkeypatch.setattr("utils.email.send_password_reset_email", _noop_email)
    # 路由里是 `from utils.email import ...`，所以同样 patch 路由模块里的引用
    monkeypatch.setattr("routes.auth.send_verification_code", _noop_email)
    monkeypatch.setattr("routes.auth.send_password_reset_email", _noop_email)

    async def _noop_rl(*args, **kwargs):
        return None

    monkeypatch.setattr("utils.rate_limiter.check_rate_limit", _noop_rl)
    monkeypatch.setattr("routes.auth.check_rate_limit", _noop_rl)

    # ── 屏蔽通知 / AI / 图片落盘相关副作用 ──
    async def _noop_notify(*args, **kwargs):
        return None

    # admin 通知（产品发布会触发）
    monkeypatch.setattr(
        "routes.products.notify_admins_pending_product", _noop_notify
    )
    monkeypatch.setattr("routes.products.create_notification", _noop_notify)

    # AI 接口：返回固定的成功结构，避免真请求 OpenAI
    async def _fake_ai(*args, **kwargs):
        return {
            "success": True,
            "data": {
                "title": "AI Generated Title",
                "description": "AI generated description",
                "category": "Electronics",
                "keywords": ["test", "ai"],
            },
        }

    # routes.products 不再使用 analyze_image（ai-preview/ai-create 已移除），
    # 只剩 routes.ai 用
    monkeypatch.setattr("routes.ai.analyze_image", _fake_ai)

    # 图片处理：跳过真实 PIL / GridFS，返回伪 URL
    async def _fake_process_and_save(*args, **kwargs):
        return {
            "image_url": "/images/fake.jpg",
            "thumb_url": "/images/fake_thumb.jpg",
        }

    def _fake_process_bytes(content, filename="image.jpg"):
        return {"content": content, "thumb": content, "filename": filename}

    async def _fake_save_processed(*args, **kwargs):
        return {
            "image_url": "/images/fake.jpg",
            "thumb_url": "/images/fake_thumb.jpg",
        }

    async def _noop_delete(*args, **kwargs):
        return None

    monkeypatch.setattr(
        "routes.products.process_and_save_image", _fake_process_and_save
    )
    monkeypatch.setattr("routes.products.delete_image", _noop_delete)
    # 注：process_image_bytes / save_processed_to_gridfs 不再被 routes.products 使用
    # （ai-preview/ai-create 端点已移除）

    # 订单相关通知 mock
    monkeypatch.setattr("routes.orders.create_notification", _noop_notify)

    # routes.notifications 内部使用的 create_notification 也 mock，
    # 这样 reports / admin 模块的链式调用都不会真发通知
    monkeypatch.setattr("routes.notifications.create_notification", _noop_notify)

    # 头像上传：mock GridFS 写入，返回伪 URL
    async def _fake_upload_raw(content, filename, content_type):
        return f"/avatars/{filename}"

    monkeypatch.setattr(
        "utils.image_service.upload_raw_to_gridfs", _fake_upload_raw
    )
    # routes.ai 顶部 `from utils.image_service import upload_raw_to_gridfs`，
    # 已绑定到本模块；需在 import 站点同步替换
    monkeypatch.setattr("routes.ai.upload_raw_to_gridfs", _fake_upload_raw)

    # WebSocket 推送：mock 掉 manager.send_personal，避免触发真实连接
    async def _fake_ws_send(user_id, data):
        return False  # 表示对方未在线

    from routes.ws import manager as _ws_manager
    monkeypatch.setattr(_ws_manager, "send_personal", _fake_ws_send)


# ----------------------------------------------------------------------
# HTTP client
# ----------------------------------------------------------------------
@pytest_asyncio.fixture
async def client(db):
    """
    httpx.AsyncClient（依赖 db fixture，确保每个用例都拿到隔离的 DB）。
    用 ASGITransport 直接打到 app，不需要起真实 server。
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


# ----------------------------------------------------------------------
# 用户 / 鉴权辅助
# ----------------------------------------------------------------------
@pytest_asyncio.fixture
async def make_user(db):
    """
    工厂 fixture：往 DB 直接插一个用户。
    用法：
        user = await make_user(email="a@university.edu", verified=True, role="admin")
    """
    async def _create(
        email: str = "alice@university.edu",
        username: str = "alice",
        password: str = "Password123!",
        verified: bool = True,
        role: str = "user",
        banned: bool = False,
    ) -> dict:
        doc = {
            "email": email.lower(),
            "username": username,
            "hashed_password": hash_password(password),
            "role": role,
            "is_verified": verified,
            "banned": banned,
            "avatar_url": None,
            "bio": None,
            "created_at": datetime.utcnow(),
        }
        result = await db.users.insert_one(doc)
        doc["_id"] = result.inserted_id
        doc["id"] = str(result.inserted_id)
        doc["password_plain"] = password
        return doc

    return _create


@pytest.fixture
def auth_headers():
    """根据 user dict 生成 Authorization 头。"""
    def _build(user: dict) -> dict:
        token = create_access_token(
            data={"sub": str(user["_id"]), "email": user["email"]}
        )
        return {"Authorization": f"Bearer {token}"}

    return _build


@pytest_asyncio.fixture
async def verified_user(make_user):
    return await make_user(email="verified@university.edu", username="verified")


@pytest_asyncio.fixture
async def unverified_user(make_user):
    return await make_user(
        email="newbie@university.edu",
        username="newbie",
        verified=False,
    )


@pytest_asyncio.fixture
async def admin_user(make_user):
    return await make_user(
        email="admin@university.edu",
        username="admin",
        role="admin",
    )


# ----------------------------------------------------------------------
# 跨模块集成测试用：notification spy
# ----------------------------------------------------------------------
@pytest.fixture
def notification_spy(monkeypatch):
    """
    把 conftest 默认的 noop 通知 mock 替换为"间谍"——记录每次 create_notification
    的调用参数，供测试断言"哪些副作用真的发生了"。

    返回一个 list，每个元素是一次调用的参数 dict：
        {"user_id": ..., "ntype": ..., "title": ..., "body": ...,
         "link": ..., "meta": ...}

    用法：
        async def test_xxx(client, notification_spy, ...):
            await client.post(...)
            assert len(notification_spy) == 1
            assert notification_spy[0]["ntype"] == "order_update"
    """
    calls = []

    async def _spy(user_id, ntype, title, body, link=None, meta=None):
        calls.append({
            "user_id": str(user_id),
            "ntype": ntype,
            "title": title,
            "body": body,
            "link": link,
            "meta": meta,
        })
        return None

    # 在所有调用 create_notification 的模块里替换为 spy
    monkeypatch.setattr("routes.orders.create_notification", _spy)
    monkeypatch.setattr("routes.products.create_notification", _spy)
    monkeypatch.setattr("routes.notifications.create_notification", _spy)

    # conftest 默认把 notify_admins_pending_product 也 mock 成 noop，
    # 但这里要测的就是这个调用链 → 还原成真实函数
    from routes.notifications import notify_admins_pending_product
    monkeypatch.setattr(
        "routes.products.notify_admins_pending_product",
        notify_admins_pending_product,
    )

    return calls


# ----------------------------------------------------------------------
# 测试 GridFS（用于 images 接口）
# ----------------------------------------------------------------------
@pytest.fixture
def fake_gridfs(monkeypatch):
    """
    minimal in-memory GridFS replacement，仅供 images 测试使用。
    用法：
        bucket = fake_gridfs
        file_id = ObjectId()
        bucket.put(file_id, b"png-bytes", content_type="image/png", filename="x.png")
    """
    from bson import ObjectId

    storage = {}

    class FakeStream:
        def __init__(self, data, content_type, filename):
            self.data = data
            self.pos = 0
            self.metadata = {"content_type": content_type}
            self.filename = filename

        async def read(self, size):
            chunk = self.data[self.pos:self.pos + size]
            self.pos += size
            return chunk

    class FakeBucket:
        async def open_download_stream(self, file_id):
            from gridfs.errors import NoFile
            if file_id not in storage:
                raise NoFile(f"No file: {file_id}")
            data, ct, fn = storage[file_id]
            return FakeStream(data, ct, fn)

        @staticmethod
        def put(file_id, data, content_type="image/png", filename="x.png"):
            storage[file_id] = (data, content_type, filename)

    bucket = FakeBucket()

    def _fake_get_bucket():
        return bucket

    monkeypatch.setattr("utils.database.get_gridfs_bucket", _fake_get_bucket)
    monkeypatch.setattr("routes.images.get_gridfs_bucket", _fake_get_bucket)
    return bucket


# ----------------------------------------------------------------------
# 商品工厂
# ----------------------------------------------------------------------
@pytest_asyncio.fixture
async def make_product(db):
    """
    工厂 fixture：往 DB 直接插一个商品。
    用法：
        product = await make_product(seller=verified_user, status="available")
    """
    async def _create(
        seller: dict,
        title: str = "Used textbook",
        description: str = "Slightly used, no markings.",
        price: float = 9.99,
        category: str = "Textbooks",
        condition: str = "good",
        sustainable: bool = False,
        status: str = "available",
        views: int = 0,
        images: list = None,
        boosted_at=None,
    ) -> dict:
        from datetime import datetime
        now = datetime.utcnow()
        doc = {
            "seller_id": seller["_id"],
            "title": title,
            "description": description,
            "price": price,
            "category": category,
            "condition": condition,
            "sustainable": sustainable,
            "images": images if images is not None else ["/images/sample.jpg"],
            "thumb_url": "/images/sample_thumb.jpg",
            "status": status,
            "views": views,
            "boosted_at": boosted_at,
            "created_at": now,
            "updated_at": now,
        }
        result = await db.products.insert_one(doc)
        doc["_id"] = result.inserted_id
        doc["id"] = str(result.inserted_id)
        return doc

    return _create


# ----------------------------------------------------------------------
# 订单工厂 + 卖家/买家便利 fixture
# ----------------------------------------------------------------------
@pytest_asyncio.fixture
async def seller_user(make_user):
    return await make_user(email="seller@university.edu", username="seller")


@pytest_asyncio.fixture
async def buyer_user(make_user):
    return await make_user(email="buyer@university.edu", username="buyer")


@pytest_asyncio.fixture
async def make_order(db):
    """
    工厂 fixture：直接往 DB 插一个订单 + 配套商品。
    用法：
        order, product = await make_order(buyer=buyer, seller=seller, status="pending")
    """
    async def _create(
        buyer: dict,
        seller: dict,
        status: str = "pending",
        product: dict = None,
    ):
        from datetime import datetime
        if product is None:
            # 默认造一个 reserved 状态商品（与 pending 订单匹配）
            product_status = (
                "reserved" if status in ("pending", "confirmed")
                else "sold" if status == "completed"
                else "available"
            )
            now = datetime.utcnow()
            pdoc = {
                "seller_id": seller["_id"],
                "title": "Order target",
                "description": "for order test",
                "price": 25.0,
                "category": "Other",
                "condition": "good",
                "sustainable": False,
                "images": ["/images/order_p.jpg"],
                "status": product_status,
                "views": 0,
                "created_at": now,
                "updated_at": now,
            }
            res = await db.products.insert_one(pdoc)
            pdoc["_id"] = res.inserted_id
            pdoc["id"] = str(res.inserted_id)
            product = pdoc

        now = datetime.utcnow()
        odoc = {
            "buyer_id": buyer["_id"],
            "seller_id": seller["_id"],
            "product_id": product["_id"],
            "status": status,
            "created_at": now,
            "updated_at": now,
        }
        res = await db.orders.insert_one(odoc)
        odoc["_id"] = res.inserted_id
        odoc["id"] = str(res.inserted_id)
        return odoc, product

    return _create
