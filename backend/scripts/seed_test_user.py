#!/usr/bin/env python3
"""
One-off: insert or refresh a verified local test user (no email OTP).
Run from repo:  cd backend && python scripts/seed_test_user.py
"""
from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import bcrypt  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from config import settings  # noqa: E402

TEST_EMAIL = "campustrade.test@university.edu"
TEST_USERNAME = "campustradetest"
TEST_PASSWORD = "TestCampus2024!"


def main() -> None:
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=8000)
    client.admin.command("ping")
    db = client[settings.mongodb_db_name]
    now = datetime.utcnow()
    hashed = bcrypt.hashpw(TEST_PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    existing = db.users.find_one({"email": TEST_EMAIL.lower()})
    if existing:
        db.users.update_one(
            {"_id": existing["_id"]},
            {
                "$set": {
                    "username": TEST_USERNAME,
                    "hashed_password": hashed,
                    "role": "user",
                    "is_verified": True,
                }
            },
        )
        print(f"Updated existing user _id={existing['_id']}")
    else:
        dup = db.users.find_one({"username": TEST_USERNAME})
        if dup:
            print("Username already taken by another email; change TEST_USERNAME in script.", file=sys.stderr)
            sys.exit(1)
        doc = {
            "email": TEST_EMAIL.lower(),
            "username": TEST_USERNAME,
            "hashed_password": hashed,
            "role": "user",
            "is_verified": True,
            "avatar_url": None,
            "created_at": now,
        }
        res = db.users.insert_one(doc)
        print(f"Inserted user _id={res.inserted_id}")

    db.email_verifications.delete_many({"email": TEST_EMAIL.lower()})
    client.close()

    print("\n--- Test login (frontend or POST /auth/login) ---")
    print(f"  Email:    {TEST_EMAIL}")
    print(f"  Username: {TEST_USERNAME}")
    print(f"  Password: {TEST_PASSWORD}")
    print(f"  DB:       {settings.mongodb_db_name}")


if __name__ == "__main__":
    main()
