from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from utils.database import connect_to_mongo, close_mongo_connection  # 改这里
import uvicorn
from routes.auth import router as auth_router 
app = FastAPI(
    title="CampusTrade API",
    description="AI-Powered Campus Marketplace for Students",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth_router)  # ← 加这行

# 启动时连接数据库
@app.on_event("startup")
async def startup_event():
    await connect_to_mongo()

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
        host="127.0.0.1",
        port=8000,
        reload=True
    )