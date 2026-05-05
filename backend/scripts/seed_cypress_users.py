"""
Safely seed Cypress E2E fixtures into the Atlas database the backend uses:
  - 2 test users (perftest, perfpartner)
  - 5 partner-owned `available` products (so order.cy.js has fresh stock each run)

Reads MONGODB_URI / MONGODB_DB_NAME from /Users/wcy/Desktop/campusTrade-main/.env.

Idempotent — safe to re-run. Users are upserted by email; partner products
are first deleted by a marker tag, then re-inserted (so each run gets fresh
`available` products).
"""
import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv("/Users/wcy/Desktop/campusTrade-main/.env")

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

URI = os.environ["MONGODB_URI"]
DB  = os.environ["MONGODB_DB_NAME"]

USERS = [
    ("perftest@university.edu",    "perftester",  "PerfTest123!"),
    ("perfpartner@university.edu", "perfpartner", "PerfTest123!"),
]
PARTNER_EMAIL = "perfpartner@university.edu"
CYPRESS_TAG   = "__cypress_seed__"   # marker so we only delete OUR seed data
PRODUCT_COUNT = 20
CATEGORIES    = ["Textbooks", "Electronics", "Furniture", "Clothing", "Kitchen"]

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def now():
    return datetime.now(timezone.utc)


async def main():
    client = AsyncIOMotorClient(URI)
    db = client[DB]
    print(f"[seed] Connected to db={DB}")

    # ── Users ─────────────────────────────────────────────
    for email, username, password in USERS:
        doc = {
            "email": email,
            "username": username,
            "hashed_password": pwd.hash(password),
            "role": "user",
            "is_verified": True,
            "banned": False,
            "avatar_url": None,
            "bio": None,
            "created_at": now(),
        }
        result = await db.users.update_one(
            {"email": email}, {"$set": doc}, upsert=True
        )
        action = "INSERTED" if result.upserted_id else "UPDATED "
        print(f"[seed] {action} user: {email}")

    # ── Partner products (delete-then-insert by marker tag) ──
    partner = await db.users.find_one({"email": PARTNER_EMAIL})
    partner_id = partner["_id"]

    deleted = await db.products.delete_many({"description": {"$regex": CYPRESS_TAG}})
    print(f"[seed] Removed {deleted.deleted_count} prior cypress-seeded products")

    docs = []
    for i in range(PRODUCT_COUNT):
        docs.append({
            "seller_id": partner_id,
            "title": f"Cypress Test Item #{i+1}",
            "description": (
                f"Used {CATEGORIES[i % 5].lower()} item for E2E testing. "
                f"{CYPRESS_TAG}"
            ),
            "price": 10.0 + i * 5,
            "category": CATEGORIES[i % 5],
            "condition": "good",
            "sustainable": i % 2 == 0,
            "images": [],
            "thumb_url": None,
            "status": "available",
            "views": 0,
            "created_at": now(),
            "updated_at": now(),
        })
    res = await db.products.insert_many(docs)
    print(f"[seed] INSERTED {len(res.inserted_ids)} partner-owned available products")

    client.close()
    print("[seed] Done.")


if __name__ == "__main__":
    asyncio.run(main())
