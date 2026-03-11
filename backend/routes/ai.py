from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from utils.ai_helper import analyze_image, get_categories
from utils.security import get_current_user
from utils.permission import require_verified_user
from utils.database import get_database
from config import settings
from bson import ObjectId
from datetime import datetime, timedelta
import os
import uuid
from pathlib import Path

router = APIRouter(prefix="/ai", tags=["AI"])

# Ensure upload directory exists
UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(exist_ok=True)

# Allowed image formats
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = settings.max_upload_size_mb * 1024 * 1024  # Convert to bytes

# AI 每日配额：每个用户每天最多调用次数
DAILY_AI_LIMIT = 20


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


# =====================================================
# GET /ai/usage - 获取今日 AI 使用量
# =====================================================

@router.get("/usage")
async def get_ai_usage(current_user: dict = Depends(get_current_user)):
    """
    获取当前用户今日的 AI 使用量
    前端使用 daily_remaining / remaining / quota 等字段
    """
    db = get_database()
    try:
        uid = ObjectId(current_user["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    usage = await db.ai_usage.find_one({
        "user_id": uid,
        "date": today
    })

    used = usage.get("count", 0) if usage else 0
    remaining = max(0, DAILY_AI_LIMIT - used)

    return {
        "used": used,
        "limit": DAILY_AI_LIMIT,
        "remaining": remaining,
        "daily_remaining": remaining,
        "reset_at": (today + timedelta(days=1)).isoformat() + "Z"
    }


# =====================================================
# POST /ai/analyze - AI 分析图片（带配额控制）
# =====================================================

@router.post("/analyze")
async def analyze_product_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_verified_user),
):
    """
    AI analyzes product image and generates title, description, category and keywords
    - Only for verified users
    - Daily limit: 20 calls per user
    """
    db = get_database()
    uid = ObjectId(current_user["user_id"])

    # 检查配额
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

    # Check file format
    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Read file content
    content = await file.read()

    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )

    # Call AI analysis
    result = await analyze_image(content)

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result["error"]
        )

    return {
        "success": True,
        "data": result["data"],
        "quota": {
            "used": quota["used"],
            "remaining": quota["remaining"],
            "limit": quota["limit"]
        }
    }


@router.post("/analyze-and-save")
async def analyze_and_save_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_verified_user),
):
    """
    AI analyzes product image and saves image to server
    - Daily limit: 20 calls per user
    """
    db = get_database()
    uid = ObjectId(current_user["user_id"])

    # 检查配额
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

    # Check file format
    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # Read file content
    content = await file.read()

    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )

    # Generate unique filename
    filename = f"{uuid.uuid4()}.{file_ext}"
    filepath = UPLOAD_DIR / filename

    # Save file
    with open(filepath, "wb") as f:
        f.write(content)

    # Call AI analysis
    result = await analyze_image(content)

    if not result["success"]:
        os.remove(filepath)
        raise HTTPException(
            status_code=500,
            detail=result["error"]
        )

    return {
        "success": True,
        "data": result["data"],
        "image_url": f"/uploads/{filename}",
        "quota": {
            "used": quota["used"],
            "remaining": quota["remaining"],
            "limit": quota["limit"]
        }
    }


@router.get("/categories")
async def list_categories():
    """Get all available product categories"""
    return {
        "categories": get_categories()
    }
