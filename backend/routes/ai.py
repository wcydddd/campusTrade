from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from utils.ai_helper import analyze_image, get_categories
from utils.security import get_current_user
from utils.database import get_database
from config import settings
from bson import ObjectId
from datetime import datetime, timedelta
import os
import uuid
from pathlib import Path

router = APIRouter(prefix="/ai", tags=["AI"])

# 确保上传目录存在
UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(exist_ok=True)

# 允许的图片格式
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = settings.max_upload_size_mb * 1024 * 1024

# =====================================================
# AI 配额配置
# =====================================================
DAILY_AI_LIMIT = 20  # 每个用户每天最多调用 20 次
AI_CONFIDENCE_THRESHOLD = 0.7  # 置信度低于 70% 需要人工确认

# 敏感分类列表（需要人工审核）
SENSITIVE_CATEGORIES = ["Weapons", "Adult", "Illegal", "Drugs"]

# 敏感关键词列表
SENSITIVE_KEYWORDS = [
    "weapon", "gun", "knife", "drug", "illegal", "fake", "counterfeit",
    "stolen", "adult", "xxx", "porn"
]


# =====================================================
# 辅助函数
# =====================================================

async def get_verified_user(current_user: dict, db):
    """获取当前用户，并确保已验证"""
    try:
        uid = ObjectId(current_user["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    user = await db.users.find_one({"_id": uid})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.get("is_verified", False):
        raise HTTPException(status_code=403, detail="User not verified. Please verify your email first.")

    return user, uid


async def check_and_update_ai_quota(user_id: ObjectId, db) -> dict:
    """
    检查并更新用户的 AI 使用配额
    返回: {"allowed": bool, "used": int, "limit": int, "remaining": int}
    """
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    usage = await db.ai_usage.find_one({
        "user_id": user_id,
        "date": today
    })

    if not usage:
        usage = {
            "user_id": user_id,
            "date": today,
            "count": 0,
            "created_at": datetime.utcnow()
        }
        await db.ai_usage.insert_one(usage)

    current_count = usage.get("count", 0)

    if current_count >= DAILY_AI_LIMIT:
        return {
            "allowed": False,
            "used": current_count,
            "limit": DAILY_AI_LIMIT,
            "remaining": 0
        }

    await db.ai_usage.update_one(
        {"user_id": user_id, "date": today},
        {
            "$inc": {"count": 1},
            "$set": {"last_used_at": datetime.utcnow()}
        }
    )

    return {
        "allowed": True,
        "used": current_count + 1,
        "limit": DAILY_AI_LIMIT,
        "remaining": DAILY_AI_LIMIT - current_count - 1
    }


def check_content_safety(ai_data: dict) -> dict:
    """
    检查 AI 生成内容的安全性
    返回: {"safe": bool, "needs_review": bool, "reason": str, "confidence": float}
    """
    title = ai_data.get("title", "").lower()
    description = ai_data.get("description", "").lower()
    category = ai_data.get("category", "")
    keywords = [k.lower() for k in ai_data.get("keywords", [])]

    if category in SENSITIVE_CATEGORIES:
        return {
            "safe": False,
            "needs_review": True,
            "reason": f"Sensitive category detected: {category}",
            "confidence": 0.3
        }

    all_text = f"{title} {description} {' '.join(keywords)}"
    for keyword in SENSITIVE_KEYWORDS:
        if keyword in all_text:
            return {
                "safe": False,
                "needs_review": True,
                "reason": f"Sensitive keyword detected: {keyword}",
                "confidence": 0.4
            }

    if len(title) < 5:
        return {
            "safe": True,
            "needs_review": True,
            "reason": "Title too short, may need manual edit",
            "confidence": 0.5
        }

    if len(description) < 20:
        return {
            "safe": True,
            "needs_review": True,
            "reason": "Description too short, may need manual edit",
            "confidence": 0.6
        }

    return {
        "safe": True,
        "needs_review": False,
        "reason": None,
        "confidence": 0.9
    }


# =====================================================
# GET /ai/usage - 获取今日 AI 使用量
# =====================================================

@router.get("/usage")
async def get_ai_usage(current_user: dict = Depends(get_current_user)):
    """获取当前用户今日的 AI 使用量"""
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    usage = await db.ai_usage.find_one({
        "user_id": uid,
        "date": today
    })

    used = usage.get("count", 0) if usage else 0

    return {
        "used": used,
        "limit": DAILY_AI_LIMIT,
        "remaining": max(0, DAILY_AI_LIMIT - used),
        "reset_at": (today + timedelta(days=1)).isoformat() + "Z"
    }


# =====================================================
# GET /ai/categories - 获取分类列表
# =====================================================

@router.get("/categories")
async def list_categories():
    """获取所有可用的商品分类"""
    return {
        "categories": get_categories()
    }


# =====================================================
# POST /ai/analyze - AI 分析图片（带配额控制）
# =====================================================

@router.post("/analyze")
async def analyze_product_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    AI 分析商品图片，生成标题、描述、分类和关键词
    - 仅限已验证用户使用
    - 每日限制 20 次调用
    - 包含内容安全检查
    """
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    quota = await check_and_update_ai_quota(uid, db)
    if not quota["allowed"]:
        raise HTTPException(
            status_code=429,
            detail={
                "message": f"Daily AI limit reached ({DAILY_AI_LIMIT} calls/day). Please try again tomorrow.",
                "used": quota["used"],
                "limit": quota["limit"],
                "remaining": quota["remaining"]
            }
        )

    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )

    result = await analyze_image(content)

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "AI analysis failed")
        )

    safety = check_content_safety(result["data"])

    return {
        "success": True,
        "data": result["data"],
        "safety": {
            "ai_confidence": safety["confidence"],
            "needs_review": safety["needs_review"],
            "review_reason": safety["reason"]
        },
        "quota": {
            "used": quota["used"],
            "remaining": quota["remaining"],
            "limit": quota["limit"]
        }
    }


# =====================================================
# POST /ai/analyze-and-save - AI 分析并保存图片
# =====================================================

@router.post("/analyze-and-save")
async def analyze_and_save_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    AI 分析商品图片并保存图片到服务器
    - 返回 AI 分析结果 + 图片 URL + 安全检查结果
    - 每日限制 20 次调用
    """
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    quota = await check_and_update_ai_quota(uid, db)
    if not quota["allowed"]:
        raise HTTPException(
            status_code=429,
            detail={
                "message": f"Daily AI limit reached ({DAILY_AI_LIMIT} calls/day). Please try again tomorrow.",
                "used": quota["used"],
                "limit": quota["limit"],
                "remaining": quota["remaining"]
            }
        )

    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )

    filename = f"{uuid.uuid4()}.{file_ext}"
    filepath = UPLOAD_DIR / filename

    with open(filepath, "wb") as f:
        f.write(content)

    result = await analyze_image(content)

    if not result["success"]:
        os.remove(filepath)
        raise HTTPException(
            status_code=500,
            detail=result.get("error", "AI analysis failed")
        )

    safety = check_content_safety(result["data"])

    return {
        "success": True,
        "data": result["data"],
        "image_url": f"/uploads/{filename}",
        "safety": {
            "ai_confidence": safety["confidence"],
            "needs_review": safety["needs_review"],
            "review_reason": safety["reason"]
        },
        "quota": {
            "used": quota["used"],
            "remaining": quota["remaining"],
            "limit": quota["limit"]
        }
    }
