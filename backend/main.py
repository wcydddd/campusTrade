from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import os

from utils.database import connect_to_mongo, close_mongo_connection, get_database
from routes.auth import router as auth_router
from routes.admin import router as admin_router
from routes.ai import router as ai_router
from routes.products import router as products_router
from routes.messages import router as messages_router
from routes.ws import router as ws_router
from routes.notifications import router as notifications_router

app = FastAPI(
    title="CampusTrade API",
    description="AI-Powered Campus Marketplace for Students",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# 确保 uploads 文件夹存在
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# CORS 配置（开发环境放宽 Origin，方便本地调试）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
    ],
    allow_origin_regex=".*",  # 本地开发放开所有来源，避免预检请求失败
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(products_router)
app.include_router(ai_router)
app.include_router(messages_router)
app.include_router(ws_router)
app.include_router(notifications_router)

# 启动时连接数据库 + 建立索引
@app.on_event("startup")
async def startup_event():
    # 1) 连接 MongoDB
    await connect_to_mongo()

    # 2) 获取数据库实例
    db = get_database()

    # 3) 建索引
    # TTL 索引：expires_at 到期自动删除验证码记录
    await db.email_verifications.create_index("expires_at", expireAfterSeconds=0)

    # 唯一索引：保证一个邮箱只有一条验证码记录
    await db.email_verifications.create_index("email", unique=True)

    # 用户索引（防止并发重复注册）
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)


# 关闭时断开连接
@app.on_event("shutdown")
async def shutdown_event():
    await close_mongo_connection()


@app.get("/")
def read_root():
    return {
        "message": "🎓 Welcome to CampusTrade API!",
        "version": "0.1.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "campustrade-api"
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )