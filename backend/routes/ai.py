from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from utils.ai_helper import analyze_image, get_categories
from utils.security import get_current_user
from config import settings
import os
import uuid
from pathlib import Path

router = APIRouter(prefix="/ai", tags=["AI"])

# 确保上传目录存在
UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(exist_ok=True)

# 允许的图片格式
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = settings.max_upload_size_mb * 1024 * 1024  # 转换为字节


@router.post("/analyze")
async def analyze_product_image(
    file: UploadFile = File(...),
    # current_user: dict = Depends(get_current_user)
):
    """
    AI 分析商品图片，生成标题、描述、分类和关键词
    - 仅限已验证用户使用
    - 支持 jpg, jpeg, png, webp 格式
    - 最大文件大小: 10MB
    """
    
    # # 检查用户是否已验证
    # if not current_user.get("is_verified", False):
    #     raise HTTPException(
    #         status_code=403, 
    #         detail="Only verified users can use AI features. Please verify your email first."
    #     )
    
    # 检查文件格式
    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # 读取文件内容
    content = await file.read()
    
    # 检查文件大小
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )
    
    # 调用 AI 分析
    result = await analyze_image(content)
    
    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result["error"]
        )
    
    return {
        "success": True,
        "data": result["data"]
    }


@router.post("/analyze-and-save")
async def analyze_and_save_image(
    file: UploadFile = File(...),
    # current_user: dict = Depends(get_current_user)
):
    """
    AI 分析商品图片并保存图片到服务器
    返回 AI 分析结果 + 图片 URL
    """
    
    # 检查用户是否已验证
    # if not current_user.get("is_verified", False):
    #     raise HTTPException(
    #         status_code=403,
    #         detail="Only verified users can use AI features. Please verify your email first."
    #     )
    
    # 检查文件格式
    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # 读取文件内容
    content = await file.read()
    
    # 检查文件大小
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )
    
    # 生成唯一文件名
    filename = f"{uuid.uuid4()}.{file_ext}"
    filepath = UPLOAD_DIR / filename
    
    # 保存文件
    with open(filepath, "wb") as f:
        f.write(content)
    
    # 调用 AI 分析
    result = await analyze_image(content)
    
    if not result["success"]:
        # 删除已保存的文件
        os.remove(filepath)
        raise HTTPException(
            status_code=500,
            detail=result["error"]
        )
    
    return {
        "success": True,
        "data": result["data"],
        "image_url": f"/uploads/{filename}"
    }


@router.get("/categories")
async def list_categories():
    """获取所有可用的商品分类"""
    return {
        "categories": get_categories()
    }