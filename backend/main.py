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
from routes.orders import router as orders_router
from routes.favorites import router as favorites_router
from routes.reports import router as reports_router
from routes.reviews import router as reviews_router

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
app.include_router(orders_router)
app.include_router(favorites_router)
app.include_router(reports_router)
app.include_router(reviews_router)

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

    # 收藏：防止同一用户重复收藏同一商品
    await db.favorites.create_index([("user_id", 1), ("product_id", 1)], unique=True)

    # 订单索引
    await db.orders.create_index("buyer_id")
    await db.orders.create_index("seller_id")
    await db.orders.create_index([("product_id", 1), ("status", 1)])

    # products 索引（搜索与查询优化）
    await db.products.create_index("created_at")
    await db.products.create_index("seller_id")
    await db.products.create_index("category")
    await db.products.create_index("sustainable")
    await db.products.create_index([("status", 1), ("created_at", -1)])
    await db.products.create_index([("status", 1), ("boosted_at", -1), ("created_at", -1)])

    # AI 使用配额：按用户+日期快速查询
    await db.ai_usage.create_index([("user_id", 1), ("date", 1)], unique=True)

    # login_attempts: 登录失败跟踪
    await db.login_attempts.create_index("email", unique=True)

    # security_events: 安全日志
    await db.security_events.create_index("created_at")
    await db.security_events.create_index("event")
    await db.security_events.create_index("email")

    # reports: 举报
    await db.reports.create_index("product_id")
    await db.reports.create_index("reporter_id")
    await db.reports.create_index("status")
    await db.reports.create_index("created_at")

    # browsing_history: 浏览记录（同一用户同一商品保留最新浏览时间）
    await db.browsing_history.create_index([("user_id", 1), ("product_id", 1)], unique=True)
    await db.browsing_history.create_index([("user_id", 1), ("viewed_at", -1)])

    # notifications: price-drop dedup (same user + product + same price change)
    await db.notifications.create_index(
        [("user_id", 1), ("type", 1), ("meta.product_id", 1), ("meta.price_from", 1), ("meta.price_to", 1)],
        unique=True,
        partialFilterExpression={
            "type": "price_drop",
            "meta.product_id": {"$exists": True},
            "meta.price_from": {"$exists": True},
            "meta.price_to": {"$exists": True},
        },
    )

    # reviews: 评价/信誉
    # 同一用户对同一订单只能评价一次
    await db.reviews.create_index([("order_id", 1), ("reviewer_user_id", 1)], unique=True)
    # 查询某用户收到的评价
    await db.reviews.create_index([("reviewee_user_id", 1), ("created_at", -1)])
    # 查询我写过的评价
    await db.reviews.create_index([("reviewer_user_id", 1), ("created_at", -1)])


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