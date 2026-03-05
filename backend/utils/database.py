from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional
from config import settings  # 改这里，去掉 backend.

class Database:
    def __init__(self) -> None:
        self.client: Optional[AsyncIOMotorClient] = None
    
db = Database()

async def connect_to_mongo() -> None:
    """连接到 MongoDB"""
    db.client = AsyncIOMotorClient(settings.mongodb_uri)
    print("[db] Connected to MongoDB")

async def close_mongo_connection() -> None:
    """关闭 MongoDB 连接"""
    if db.client is not None:
        db.client.close()
        print("[db] Closed MongoDB connection")

def get_database() -> AsyncIOMotorDatabase:
    """获取数据库实例"""
    if db.client is None:
        raise RuntimeError("Database not connected. Call connect_to_mongo() first.")
    return db.client.campustrade