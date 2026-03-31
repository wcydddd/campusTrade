from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional
import certifi
from config import settings

class Database:
    def __init__(self) -> None:
        self.client: Optional[AsyncIOMotorClient] = None

db = Database()


async def connect_to_mongo() -> None:
    """
    Connect to MongoDB (local or Atlas).
    Supports both mongodb:// and mongodb+srv:// schemes.
    Verifies connectivity with a ping before declaring success.
    """
    uri = settings.mongodb_uri

    is_atlas = uri.startswith("mongodb+srv://")
    target = "MongoDB Atlas" if is_atlas else "MongoDB (local)"

    print(f"[db] Connecting to {target} ...")

    try:
        db.client = AsyncIOMotorClient(
            uri,
            serverSelectionTimeoutMS=8000,
            connectTimeoutMS=8000,
            socketTimeoutMS=10000,
            retryWrites=True,
            w="majority",
            tlsCAFile=certifi.where() if is_atlas else None,
        )

        # Verify the connection is alive
        await db.client.admin.command("ping")

        db_name = settings.mongodb_db_name
        server_info = await db.client.server_info()
        version = server_info.get("version", "unknown")

        print(f"[db] Connected to {target} successfully  (server v{version}, db={db_name})")

    except Exception as exc:
        db.client = None
        print(f"[db] FAILED to connect to {target}: {exc}")
        raise SystemExit(
            f"Cannot start application — database connection failed: {exc}"
        )


async def close_mongo_connection() -> None:
    """Close the MongoDB client gracefully."""
    if db.client is not None:
        db.client.close()
        print("[db] Closed MongoDB connection")


def get_database() -> AsyncIOMotorDatabase:
    """Return the application database instance."""
    if db.client is None:
        raise RuntimeError("Database not connected. Call connect_to_mongo() first.")
    return db.client[settings.mongodb_db_name]