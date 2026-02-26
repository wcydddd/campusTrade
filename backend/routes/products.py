from fastapi import APIRouter, HTTPException, Depends, status, Query
from typing import List, Optional
from bson import ObjectId
from datetime import datetime

from utils.database import get_database
from utils.security import get_current_user
from models.product import ProductCreate, ProductResponse, ProductInDB

router = APIRouter(prefix="/products", tags=["Products"])


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
    """
    获取当前用户，并确保已验证
    - 返回: (user, uid)
    - 未验证抛出 403
    """
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
):
    """
    获取商品列表
    - 所有人可访问（无需登录）
    - 支持筛选：sustainable, category, price range, search
    """
    db = get_database()

    query = {}
    
    # Sustainable 筛选
    if sustainable is not None:
        query["sustainable"] = sustainable
    
    # 分类筛选
    if category:
        query["category"] = category
    
    # 价格范围筛选
    if min_price is not None or max_price is not None:
        query["price"] = {}
        if min_price is not None:
            query["price"]["$gte"] = min_price
        if max_price is not None:
            query["price"]["$lte"] = max_price
        if not query["price"]:
            del query["price"]
    
    # 搜索（标题或描述包含关键词）
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]

    docs = await db.products.find(query).sort("created_at", -1).to_list(length=200)
    return [_to_response(d) for d in docs]


# =====================================================
# GET /products/{id} - 商品详情（所有人可访问）
# =====================================================

@router.get("/{id}", response_model=ProductResponse)
async def get_product(id: str):
    """
    获取商品详情
    - 所有人可访问（无需登录）
    - 每次访问浏览量 +1
    """
    db = get_database()

    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    doc = await db.products.find_one({"_id": pid})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")

    # 浏览数 +1
    await db.products.update_one({"_id": pid}, {"$inc": {"views": 1}})
    doc = await db.products.find_one({"_id": pid})

    return _to_response(doc)


# =====================================================
# POST /products - 创建商品（仅验证用户）
# =====================================================

@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate, 
    current_user: dict = Depends(get_current_user)
):
    """
    创建商品
    - 仅已验证用户可创建
    - 未验证用户返回 403
    """
    db = get_database()

    # 检查用户是否验证
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
# PUT /products/{id} - 更新商品（仅验证用户 + Owner）
# =====================================================

@router.put("/{id}", response_model=ProductResponse)
async def update_product(
    id: str, 
    payload: ProductCreate, 
    current_user: dict = Depends(get_current_user)
):
    """
    更新商品
    - 仅已验证用户可更新
    - 只有商品所有者可以修改自己的商品
    - 非所有者返回 403
    """
    db = get_database()

    # 检查商品是否存在
    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    existing = await db.products.find_one({"_id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    # 检查用户是否验证
    user, uid = await get_verified_user(current_user, db)

    # 检查是否是 Owner
    if str(existing["seller_id"]) != str(uid):
        raise HTTPException(status_code=403, detail="You can only update your own products")

    # 更新商品
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
    """
    删除商品
    - 仅已验证用户可删除
    - 只有商品所有者可以删除自己的商品
    - 非所有者返回 403
    """
    db = get_database()

    # 检查商品是否存在
    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    existing = await db.products.find_one({"_id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    # 检查用户是否验证
    user, uid = await get_verified_user(current_user, db)

    # 检查是否是 Owner
    if str(existing["seller_id"]) != str(uid):
        raise HTTPException(status_code=403, detail="You can only delete your own products")

    # 删除商品
    await db.products.delete_one({"_id": pid})
    return {"ok": True, "message": "Product deleted successfully"}


# =====================================================
# GET /products/user/me - 获取当前用户的商品（需登录）
# =====================================================

@router.get("/user/me", response_model=List[ProductResponse])
async def get_my_products(current_user: dict = Depends(get_current_user)):
    """
    获取当前用户发布的所有商品
    - 需要登录
    """
    db = get_database()

    try:
        uid = ObjectId(current_user["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    docs = await db.products.find({"seller_id": uid}).sort("created_at", -1).to_list(length=100)
    return [_to_response(d) for d in docs]