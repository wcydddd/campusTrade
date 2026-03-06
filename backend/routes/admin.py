from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId
from datetime import datetime

from utils.database import get_database
from utils.security import get_current_admin_user
from utils.image_service import delete_image

router = APIRouter(prefix="/admin", tags=["Admin"])


# =====================================================
# 数据模型
# =====================================================

class UserListItem(BaseModel):
    id: str
    email: str
    username: str
    role: str
    is_verified: bool
    is_banned: bool
    created_at: Optional[str] = None


class UserListResponse(BaseModel):
    items: List[UserListItem]
    total: int
    page: int
    size: int


class ProductListItem(BaseModel):
    id: str
    seller_id: str
    title: str
    description: str
    price: float
    category: str
    condition: str
    status: str
    ai_confidence: Optional[float] = None
    needs_review: bool = False
    review_reason: Optional[str] = None
    images: List[str] = []
    thumb_urls: List[str] = []
    created_at: Optional[str] = None


class ProductListResponse(BaseModel):
    items: List[ProductListItem]
    total: int
    page: int
    size: int


class BanBody(BaseModel):
    reason: Optional[str] = None


class RoleBody(BaseModel):
    role: str  # "user" | "admin"


class VerifyBody(BaseModel):
    is_verified: bool


class RejectBody(BaseModel):
    reason: str


# =====================================================
# 辅助函数
# =====================================================

def _to_user_item(doc: dict) -> UserListItem:
    is_banned = doc.get("is_banned", doc.get("banned", False))
    return UserListItem(
        id=str(doc["_id"]),
        email=doc.get("email", ""),
        username=doc.get("username", ""),
        role=doc.get("role", "user"),
        is_verified=doc.get("is_verified", False),
        is_banned=is_banned,
        created_at=str(doc["created_at"]) if doc.get("created_at") else None,
    )


def _to_product_item(doc: dict) -> ProductListItem:
    return ProductListItem(
        id=str(doc["_id"]),
        seller_id=str(doc["seller_id"]),
        title=doc.get("title", ""),
        description=doc.get("description", ""),
        price=doc.get("price", 0),
        category=doc.get("category", ""),
        condition=doc.get("condition", ""),
        status=doc.get("status", "available"),
        ai_confidence=doc.get("ai_confidence"),
        needs_review=doc.get("needs_review", False),
        review_reason=doc.get("review_reason"),
        images=doc.get("images", []),
        thumb_urls=doc.get("thumb_urls", []),
        created_at=str(doc["created_at"]) if doc.get("created_at") else None,
    )


# =====================================================
# 用户管理
# =====================================================

@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    q: Optional[str] = Query(None, description="Search email or username"),
    current_user: dict = Depends(get_current_admin_user),
):
    """获取用户列表（支持搜索、分页）"""
    db = get_database()

    query = {}
    if q and q.strip():
        q = q.strip()
        query["$or"] = [
            {"email": {"$regex": q, "$options": "i"}},
            {"username": {"$regex": q, "$options": "i"}},
        ]

    total = await db.users.count_documents(query)
    skip = (page - 1) * size
    cursor = db.users.find(query).sort("created_at", -1).skip(skip).limit(size)
    docs = await cursor.to_list(length=size)
    items = [_to_user_item(d) for d in docs]

    return UserListResponse(items=items, total=total, page=page, size=size)


@router.post("/users/{user_id}/ban", status_code=status.HTTP_200_OK)
async def ban_user(
    user_id: str,
    body: Optional[BanBody] = Body(None),
    current_user: dict = Depends(get_current_admin_user),
):
    """封禁用户"""
    db = get_database()
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    if str(uid) == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")

    reason = (body.reason if body else None) or ""
    result = await db.users.update_one(
        {"_id": uid},
        {"$set": {"is_banned": True, "ban_reason": reason}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"ok": True, "message": "User banned"}


@router.post("/users/{user_id}/unban", status_code=status.HTTP_200_OK)
async def unban_user(
    user_id: str,
    current_user: dict = Depends(get_current_admin_user),
):
    """解封用户"""
    db = get_database()
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    result = await db.users.update_one(
        {"_id": uid},
        {"$set": {"is_banned": False}, "$unset": {"ban_reason": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"ok": True, "message": "User unbanned"}


@router.patch("/users/{user_id}/role", status_code=status.HTTP_200_OK)
async def set_user_role(
    user_id: str,
    body: RoleBody,
    current_user: dict = Depends(get_current_admin_user),
):
    """修改用户角色"""
    if body.role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="role must be user or admin")

    db = get_database()
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    if str(uid) == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    result = await db.users.update_one({"_id": uid}, {"$set": {"role": body.role}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"ok": True, "message": f"Role set to {body.role}"}


@router.patch("/users/{user_id}/verify", status_code=status.HTTP_200_OK)
async def set_user_verified(
    user_id: str,
    body: VerifyBody = Body(...),
    current_user: dict = Depends(get_current_admin_user),
):
    """修改用户验证状态"""
    db = get_database()
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    value = bool(body.is_verified)
    result = await db.users.update_one({"_id": uid}, {"$set": {"is_verified": value}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"ok": True, "is_verified": value, "message": "Verified" if value else "Unverified"}


# =====================================================
# 商品审核
# =====================================================

@router.get("/products/pending", response_model=ProductListResponse)
async def list_pending_products(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_admin_user),
):
    """获取待审核商品列表"""
    db = get_database()

    query = {"status": "pending_review"}

    total = await db.products.count_documents(query)
    skip = (page - 1) * size
    cursor = db.products.find(query).sort("created_at", -1).skip(skip).limit(size)
    docs = await cursor.to_list(length=size)
    items = [_to_product_item(d) for d in docs]

    return ProductListResponse(items=items, total=total, page=page, size=size)


@router.get("/products/all", response_model=ProductListResponse)
async def list_all_products(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search title"),
    current_user: dict = Depends(get_current_admin_user),
):
    """获取所有商品列表（可按状态筛选）"""
    db = get_database()

    query = {}
    if status:
        query["status"] = status
    if search:
        query["title"] = {"$regex": search, "$options": "i"}

    total = await db.products.count_documents(query)
    skip = (page - 1) * size
    cursor = db.products.find(query).sort("created_at", -1).skip(skip).limit(size)
    docs = await cursor.to_list(length=size)
    items = [_to_product_item(d) for d in docs]

    return ProductListResponse(items=items, total=total, page=page, size=size)


@router.patch("/products/{product_id}/approve", status_code=status.HTTP_200_OK)
async def approve_product(
    product_id: str,
    current_user: dict = Depends(get_current_admin_user),
):
    """审核通过商品"""
    db = get_database()

    try:
        pid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    try:
        uid = ObjectId(current_user["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    result = await db.products.update_one(
        {"_id": pid},
        {"$set": {
            "status": "available",
            "needs_review": False,
            "reviewed_by": uid,
            "reviewed_at": datetime.utcnow()
        }}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    return {"ok": True, "message": "Product approved"}


@router.patch("/products/{product_id}/reject", status_code=status.HTTP_200_OK)
async def reject_product(
    product_id: str,
    body: RejectBody = Body(...),
    current_user: dict = Depends(get_current_admin_user),
):
    """审核拒绝商品"""
    db = get_database()

    try:
        pid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    try:
        uid = ObjectId(current_user["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    result = await db.products.update_one(
        {"_id": pid},
        {"$set": {
            "status": "rejected",
            "reject_reason": body.reason,
            "reviewed_by": uid,
            "reviewed_at": datetime.utcnow()
        }}
    )

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    return {"ok": True, "message": "Product rejected"}


@router.delete("/products/{product_id}", status_code=status.HTTP_200_OK)
async def admin_delete_product(
    product_id: str,
    current_user: dict = Depends(get_current_admin_user),
):
    """管理员删除商品（包括图片）"""
    db = get_database()

    try:
        pid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    product = await db.products.find_one({"_id": pid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    for image_url in product.get("images", []):
        delete_image(image_url)

    await db.products.delete_one({"_id": pid})

    return {"ok": True, "message": "Product deleted"}


# =====================================================
# 统计数据
# =====================================================

@router.get("/stats")
async def get_admin_stats(
    current_user: dict = Depends(get_current_admin_user),
):
    """获取管理员统计数据"""
    db = get_database()

    total_users = await db.users.count_documents({})
    verified_users = await db.users.count_documents({"is_verified": True})
    banned_users = await db.users.count_documents({"is_banned": True})

    total_products = await db.products.count_documents({})
    available_products = await db.products.count_documents({"status": "available"})
    pending_products = await db.products.count_documents({"status": "pending_review"})
    sold_products = await db.products.count_documents({"status": "sold"})
    rejected_products = await db.products.count_documents({"status": "rejected"})

    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_ai_usage = await db.ai_usage.aggregate([
        {"$match": {"date": today}},
        {"$group": {"_id": None, "total": {"$sum": "$count"}}}
    ]).to_list(length=1)
    today_ai_calls = today_ai_usage[0]["total"] if today_ai_usage else 0

    return {
        "users": {
            "total": total_users,
            "verified": verified_users,
            "banned": banned_users
        },
        "products": {
            "total": total_products,
            "available": available_products,
            "pending_review": pending_products,
            "sold": sold_products,
            "rejected": rejected_products
        },
        "ai": {
            "today_calls": today_ai_calls
        }
    }
