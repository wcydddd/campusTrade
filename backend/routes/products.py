from fastapi import APIRouter, HTTPException, Depends, status, Query, UploadFile, File, Form
from typing import List, Optional
from bson import ObjectId
from datetime import datetime
import uuid
import os
from pathlib import Path

from utils.database import get_database
from utils.security import get_current_user
from utils.ai_helper import analyze_image, get_categories
from models.product import ProductCreate, ProductResponse, ProductInDB
from config import settings

router = APIRouter(prefix="/products", tags=["Products"])

# 上传目录配置
UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = settings.max_upload_size_mb * 1024 * 1024


# =====================================================
# 公共函数
# =====================================================

def _to_response(doc: dict) -> ProductResponse:
    """将 MongoDB 文档转换为响应模型"""
    return ProductResponse(
        id=str(doc["_id"]),
        seller_id=str(doc["seller_id"]),
        title=doc["title"],
        description=doc["description"],
        price=doc["price"],
        category=doc["category"],
        condition=doc["condition"],
        sustainable=doc.get("sustainable", False),
        images=doc.get("images", []),
        status=doc.get("status", "available"),
        views=doc.get("views", 0),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
    )


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


async def save_upload_file(file: UploadFile) -> tuple[str, bytes]:
    """
    保存上传的文件
    返回: (image_url, file_content)
    """
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
    
    return f"/uploads/{filename}", content


# =====================================================
# GET /products - 商品列表（所有人可访问）
# =====================================================

@router.get("", response_model=List[ProductResponse])
async def list_products(
    sustainable: Optional[bool] = Query(default=None, description="Filter by sustainable"),
    category: Optional[str] = Query(default=None, description="Filter by category"),
    min_price: Optional[float] = Query(default=None, description="Minimum price"),
    max_price: Optional[float] = Query(default=None, description="Maximum price"),
    search: Optional[str] = Query(default=None, description="Search in title/description"),
    include_sold: Optional[bool] = Query(default=False, description="Include sold products"),
):
    """
    获取商品列表
    - 所有人可访问（无需登录）
    - 默认排除已售出(sold)商品，成交后不再出现在默认列表
    - 支持筛选：sustainable, category, price range, search
    """
    db = get_database()

    query = {}

    # 默认不显示已售商品
    if not include_sold:
        query["status"] = {"$ne": "sold"}

    if sustainable is not None:
        query["sustainable"] = sustainable
    
    if category:
        query["category"] = category
    
    if min_price is not None or max_price is not None:
        query["price"] = {}
        if min_price is not None:
            query["price"]["$gte"] = min_price
        if max_price is not None:
            query["price"]["$lte"] = max_price
        if not query["price"]:
            del query["price"]
    
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]

    docs = await db.products.find(query).sort("created_at", -1).to_list(length=200)
    return [_to_response(d) for d in docs]


# =====================================================
# GET /products/categories - 获取所有分类
# =====================================================

@router.get("/categories")
async def list_product_categories():
    """获取所有可用的商品分类"""
    return {"categories": get_categories()}


# =====================================================
# GET /products/trending - 热门榜（按浏览量+时间衰减排序）
# =====================================================

@router.get("/trending", response_model=List[ProductResponse])
async def list_trending_products():
    """
    获取热门商品列表（所有人可访问，无需登录）
    使用 trending_score = views / (1 + 0.1 * days_old) 排序
    """
    db = get_database()
    pipeline = [
        {"$match": {"status": {"$ne": "sold"}}},
        {"$addFields": {
            "days_old": {"$divide": [
                {"$subtract": [datetime.utcnow(), "$created_at"]},
                86400000
            ]}
        }},
        {"$addFields": {
            "decay": {"$divide": [
                1,
                {"$add": [1, {"$multiply": [0.1, "$days_old"]}]}
            ]}
        }},
        {"$addFields": {
            "trending_score": {"$multiply": [
                {"$ifNull": ["$views", 0]},
                "$decay"
            ]}
        }},
        {"$sort": {"trending_score": -1}},
        {"$limit": 50}
    ]
    cursor = db.products.aggregate(pipeline)
    docs = await cursor.to_list(50)
    return [_to_response(d) for d in docs]


# =====================================================
# GET /products/user/me - 获取当前用户的商品（需登录）
# =====================================================

@router.get("/user/me", response_model=List[ProductResponse])
async def get_my_products(current_user: dict = Depends(get_current_user)):
    """获取当前用户发布的所有商品"""
    db = get_database()

    try:
        uid = ObjectId(current_user["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    docs = await db.products.find({"seller_id": uid}).sort("created_at", -1).to_list(length=100)
    return [_to_response(d) for d in docs]


# =====================================================
# POST /products/{id}/favorite - 收藏商品
# =====================================================

@router.post("/{id}/favorite")
async def add_favorite(id: str, current_user: dict = Depends(get_current_user)):
    """收藏商品（幂等：已收藏再点返回 200）"""
    db = get_database()
    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    product = await db.products.find_one({"_id": pid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    uid = ObjectId(current_user["user_id"])
    now = datetime.utcnow()
    await db.favorites.update_one(
        {"user_id": uid, "product_id": pid},
        {"$set": {"user_id": uid, "product_id": pid, "created_at": now}},
        upsert=True,
    )
    return {"ok": True, "message": "Added to favorites"}


# =====================================================
# DELETE /products/{id}/favorite - 取消收藏
# =====================================================

@router.delete("/{id}/favorite")
async def remove_favorite(id: str, current_user: dict = Depends(get_current_user)):
    """取消收藏（幂等：未收藏时也返回 200）"""
    db = get_database()
    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    uid = ObjectId(current_user["user_id"])
    await db.favorites.delete_one({"user_id": uid, "product_id": pid})
    return {"ok": True, "message": "Removed from favorites"}


# =====================================================
# GET /products/{id} - 商品详情（所有人可访问）
# =====================================================

@router.get("/{id}", response_model=ProductResponse)
async def get_product(id: str):
    """获取商品详情，每次访问浏览量 +1"""
    db = get_database()

    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    doc = await db.products.find_one({"_id": pid})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")

    await db.products.update_one({"_id": pid}, {"$inc": {"views": 1}})
    doc = await db.products.find_one({"_id": pid})

    return _to_response(doc)


# =====================================================
# POST /products - 创建商品（手动填写，仅验证用户）
# =====================================================

@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate, 
    current_user: dict = Depends(get_current_user)
):
    """
    创建商品（手动填写信息）
    - 仅已验证用户可创建
    """
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    now = datetime.utcnow()
    doc = ProductInDB(
        seller_id=uid,
        **payload.model_dump(),
        created_at=now,
        updated_at=now,
    ).model_dump(by_alias=True)

    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _to_response(doc)


# =====================================================
# POST /products/with-image - 上传图片创建商品（手动填写 + 图片）
# =====================================================

@router.post("/with-image", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product_with_image(
    file: UploadFile = File(..., description="商品图片"),
    title: str = Form(..., description="商品标题"),
    description: str = Form(..., description="商品描述"),
    price: float = Form(..., description="价格"),
    category: str = Form(..., description="分类"),
    condition: str = Form(default="good", description="商品状态: new/like_new/good/fair"),
    sustainable: bool = Form(default=False, description="是否环保商品"),
    current_user: dict = Depends(get_current_user)
):
    """
    上传图片并创建商品（手动填写信息）
    - 仅已验证用户可创建
    - 图片会保存到服务器
    """
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    # 保存图片
    image_url, _ = await save_upload_file(file)

    now = datetime.utcnow()
    doc = {
        "seller_id": uid,
        "title": title,
        "description": description,
        "price": price,
        "category": category,
        "condition": condition,
        "sustainable": sustainable,
        "images": [image_url],
        "status": "available",
        "views": 0,
        "created_at": now,
        "updated_at": now,
    }

    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _to_response(doc)


# =====================================================
# POST /products/ai-create - AI 自动生成商品信息（核心功能！）
# =====================================================

@router.post("/ai-create", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product_with_ai(
    file: UploadFile = File(..., description="商品图片"),
    price: float = Form(..., description="价格（需要用户填写）"),
    condition: str = Form(default="good", description="商品状态: new/like_new/good/fair"),
    sustainable: bool = Form(default=False, description="是否环保商品"),
    current_user: dict = Depends(get_current_user)
):
    """
    🤖 AI 智能发布商品
    - 上传图片，AI 自动生成标题、描述、分类
    - 用户只需填写价格和状态
    - 仅已验证用户可使用
    """
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    # 1. 保存图片
    image_url, file_content = await save_upload_file(file)

    # 2. 调用 AI 分析图片
    ai_result = await analyze_image(file_content)
    
    if not ai_result["success"]:
        # AI 失败，删除已保存的图片
        try:
            os.remove(UPLOAD_DIR / image_url.split("/")[-1])
        except:
            pass
        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {ai_result.get('error', 'Unknown error')}"
        )

    ai_data = ai_result["data"]

    # 3. 创建商品
    now = datetime.utcnow()
    doc = {
        "seller_id": uid,
        "title": ai_data["title"],
        "description": ai_data["description"],
        "price": price,
        "category": ai_data["category"],
        "condition": condition,
        "sustainable": sustainable,
        "images": [image_url],
        "keywords": ai_data.get("keywords", []),
        "status": "available",
        "views": 0,
        "ai_generated": True,  # 标记为 AI 生成
        "created_at": now,
        "updated_at": now,
    }

    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _to_response(doc)


# =====================================================
# POST /products/ai-preview - AI 预览（不保存，先看效果）
# =====================================================

@router.post("/ai-preview")
async def preview_ai_analysis(
    file: UploadFile = File(..., description="商品图片"),
    current_user: dict = Depends(get_current_user)
):
    """
    🔍 AI 预览分析结果
    - 上传图片，查看 AI 生成的标题、描述、分类
    - 不保存图片，不创建商品
    - 用于用户确认后再正式发布
    """
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    # 检查文件格式
    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # 读取文件内容（不保存）
    content = await file.read()
    
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )

    # 调用 AI 分析
    ai_result = await analyze_image(content)
    
    if not ai_result["success"]:
        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {ai_result.get('error', 'Unknown error')}"
        )

    return {
        "success": True,
        "preview": ai_result["data"],
        "message": "This is a preview. Use /products/ai-create to publish."
    }


# =====================================================
# PUT /products/{id} - 更新商品（仅验证用户 + Owner）
# =====================================================

@router.put("/{id}", response_model=ProductResponse)
async def update_product(
    id: str, 
    payload: ProductCreate, 
    current_user: dict = Depends(get_current_user)
):
    """更新商品，只有商品所有者可以修改"""
    db = get_database()

    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    existing = await db.products.find_one({"_id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    user, uid = await get_verified_user(current_user, db)

    if str(existing["seller_id"]) != str(uid):
        raise HTTPException(status_code=403, detail="You can only update your own products")

    now = datetime.utcnow()
    await db.products.update_one(
        {"_id": pid},
        {"$set": {**payload.model_dump(), "updated_at": now}}
    )

    updated = await db.products.find_one({"_id": pid})
    return _to_response(updated)


# =====================================================
# DELETE /products/{id} - 删除商品（仅验证用户 + Owner）
# =====================================================

@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def delete_product(
    id: str, 
    current_user: dict = Depends(get_current_user)
):
    """删除商品，只有商品所有者可以删除"""
    db = get_database()

    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    existing = await db.products.find_one({"_id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    user, uid = await get_verified_user(current_user, db)

    if str(existing["seller_id"]) != str(uid):
        raise HTTPException(status_code=403, detail="You can only delete your own products")

    # 删除关联的图片文件
    for image_url in existing.get("images", []):
        try:
            filename = image_url.split("/")[-1]
            os.remove(UPLOAD_DIR / filename)
        except:
            pass  # 图片不存在也没关系

    await db.products.delete_one({"_id": pid})
    return {"ok": True, "message": "Product deleted successfully"}
