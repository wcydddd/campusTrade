from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorGridFSBucket
from typing import Optional
import certifi
from config import settings


class Database:
    def __init__(self) -> None:
        self.client: Optional[AsyncIOMotorClient] = None
        self.gridfs_bucket: Optional[AsyncIOMotorGridFSBucket] = None


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

        await db.client.admin.command("ping")

        db_name = settings.mongodb_db_name
        server_info = await db.client.server_info()
        version = server_info.get("version", "unknown")

        database = db.client[db_name]
        db.gridfs_bucket = AsyncIOMotorGridFSBucket(database)

        print(f"[db] Connected to {target} successfully  (server v{version}, db={db_name})")
        print("[db] GridFS bucket initialized")

    except Exception as exc:
        db.client = None
        db.gridfs_bucket = None
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


def get_gridfs_bucket() -> AsyncIOMotorGridFSBucket:
    """Return the GridFS bucket instance."""
    if db.gridfs_bucket is None:
        raise RuntimeError("GridFS bucket not initialized. Call connect_to_mongo() first.")
    return db.gridfs_bucket
