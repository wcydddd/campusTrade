"""
Seed local MongoDB with test data for Locust perf testing.

Creates a clean `campustrade_perf` database containing:
  - 1 verified test user (perftest@university.edu / PerfTest123!)
  - 20 products across 5 categories (sustainable / non-sustainable mix)
  - 5 favorites (so /favorites endpoint has data to return)
  - A few messages (for /messages/conversations)

Run BEFORE starting the backend for perf testing:
    python perf_tests/seed_data.py
"""
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

# 把 backend/ 加进 sys.path，方便复用 utils
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

MONGODB_URI = "mongodb://localhost:27017"
DB_NAME = "campustrade_perf"

TEST_USER_EMAIL = "perftest@university.edu"
TEST_USER_PASSWORD = "PerfTest123!"
PARTNER_EMAIL = "perfpartner@university.edu"

# 给 Locust 50 用户测试用：60 个独立账号（perfuser0..perfuser59）
LOCUST_USER_COUNT = 60
LOCUST_USER_PREFIX = "perfuser"

CATEGORIES = ["Textbooks", "Electronics", "Furniture", "Clothing", "Kitchen"]

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed():
    client = AsyncIOMotorClient(MONGODB_URI)
    db = client[DB_NAME]

    # Clean slate
    print(f"[seed] Cleaning {DB_NAME}...")
    for col in ["users", "products", "favorites", "messages",
                "notifications", "ai_usage", "login_attempts"]:
        await db[col].delete_many({})

    # ── 1. 测试用户（用作 Locust 登录） ──
    user_doc = {
        "email": TEST_USER_EMAIL,
        "username": "perftester",
        "hashed_password": pwd_context.hash(TEST_USER_PASSWORD),
        "role": "user",
        "is_verified": True,
        "banned": False,
        "avatar_url": None,
        "bio": None,
        "created_at": datetime.utcnow(),
    }
    user_result = await db.users.insert_one(user_doc)
    user_id = user_result.inserted_id

    # 第二个用户（作为商品列表里某些商品的卖家 + 消息对方）
    partner_doc = {
        "email": PARTNER_EMAIL,
        "username": "perfpartner",
        "hashed_password": pwd_context.hash(TEST_USER_PASSWORD),
        "role": "user",
        "is_verified": True,
        "banned": False,
        "created_at": datetime.utcnow(),
    }
    partner_result = await db.users.insert_one(partner_doc)
    partner_id = partner_result.inserted_id

    # ── 1.5  Locust 测试账号池（每个 Locust 虚拟用户用独立账号） ──
    locust_user_ids = []
    pre_hashed = pwd_context.hash(TEST_USER_PASSWORD)  # 一次 hash，所有人复用
    locust_docs = []
    for i in range(LOCUST_USER_COUNT):
        locust_docs.append({
            "email": f"{LOCUST_USER_PREFIX}{i}@university.edu",
            "username": f"{LOCUST_USER_PREFIX}{i}",
            "hashed_password": pre_hashed,
            "role": "user",
            "is_verified": True,
            "banned": False,
            "created_at": datetime.utcnow(),
        })
    res = await db.users.insert_many(locust_docs)
    locust_user_ids = res.inserted_ids

    # ── 2. 20 件商品 ──
    product_ids = []
    now = datetime.utcnow()
    for i in range(20):
        seller = user_id if i % 2 == 0 else partner_id
        doc = {
            "seller_id": seller,
            "title": f"Test Product {i+1}",
            "description": (
                f"Used {CATEGORIES[i % 5].lower()} item, in great condition. "
                f"Perfect for students. Item #{i+1}."
            ),
            "price": 10.0 + i * 5,
            "category": CATEGORIES[i % 5],
            "condition": "good",
            "sustainable": i % 2 == 0,
            "images": [],
            "thumb_url": None,
            "status": "available",
            "views": i * 3,
            "created_at": now - timedelta(hours=i),
            "updated_at": now - timedelta(hours=i),
        }
        r = await db.products.insert_one(doc)
        product_ids.append(r.inserted_id)

    # ── 3. 5 件收藏（让 GET /favorites 有数据） ──
    for pid in product_ids[:5]:
        await db.favorites.insert_one({
            "user_id": user_id,
            "product_id": pid,
            "created_at": now,
        })

    # ── 4. 几条消息（GET /messages/conversations 有数据） ──
    for i in range(3):
        await db.messages.insert_one({
            "from_user_id": partner_id,
            "to_user_id": user_id,
            "content": f"Hi, is item {i+1} still available?",
            "product_id": product_ids[i],
            "read": False,
            "created_at": now - timedelta(minutes=i * 5),
        })

    # ── 总结 ──
    print(f"[seed] ✅ Seeded {DB_NAME}")
    print(f"       Main user : {TEST_USER_EMAIL} / {TEST_USER_PASSWORD}")
    print(f"       Partner   : {PARTNER_EMAIL} / {TEST_USER_PASSWORD}")
    print(f"       Locust pool: {LOCUST_USER_COUNT} accounts "
          f"({LOCUST_USER_PREFIX}0..{LOCUST_USER_PREFIX}{LOCUST_USER_COUNT - 1})"
          f" @university.edu / {TEST_USER_PASSWORD}")
    print(f"       Products  : 20")
    print(f"       Favorites : 5")
    print(f"       Messages  : 3")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
