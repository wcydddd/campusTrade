from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from bson import ObjectId

from utils.database import get_database
from utils.security import get_current_admin_user
from models.report import ReportResponse, ResolveBody

router = APIRouter(prefix="/admin", tags=["Admin"])


class UserListItem(BaseModel):
    id: str
    email: str
    username: str
    role: str
    is_verified: bool
    banned: bool
    created_at: Optional[str] = None


class UserListResponse(BaseModel):
    items: List[UserListItem]
    total: int
    page: int
    size: int


class BanBody(BaseModel):
    reason: Optional[str] = None


class RoleBody(BaseModel):
    role: str  # "user" | "moderator" | "admin"


class VerifyBody(BaseModel):
    is_verified: bool


def _to_item(doc: dict) -> UserListItem:
    return UserListItem(
        id=str(doc["_id"]),
        email=doc.get("email", ""),
        username=doc.get("username", ""),
        role=doc.get("role", "user"),
        is_verified=doc.get("is_verified", False),
        banned=doc.get("banned", False),
        created_at=str(doc["created_at"]) if doc.get("created_at") else None,
    )


@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    q: Optional[str] = Query(None, description="Search email or username"),
    current_user: dict = Depends(get_current_admin_user),
):
    """用户列表，支持分页和搜索"""
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
    items = [_to_item(d) for d in docs]

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
        {"$set": {"banned": True, "ban_reason": reason}},
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
        {"$set": {"banned": False}, "$unset": {"ban_reason": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "message": "User unbanned"}


@router.post("/users/{user_id}/role", status_code=status.HTTP_200_OK)
async def set_user_role(
    user_id: str,
    body: RoleBody,
    current_user: dict = Depends(get_current_admin_user),
):
    """修改用户角色"""
    if body.role not in ("user", "moderator", "admin"):
        raise HTTPException(status_code=400, detail="role must be user, moderator or admin")

    db = get_database()
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    if str(uid) == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    result = await db.users.update_one(
        {"_id": uid},
        {"$set": {"role": body.role}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True, "message": f"Role set to {body.role}"}


@router.patch("/users/{user_id}/verify", status_code=status.HTTP_200_OK)
async def set_user_verified(
    user_id: str,
    body: VerifyBody = Body(...),
    current_user: dict = Depends(get_current_admin_user),
):
    """Admin: set user email verification status (manual verify/unverify)."""
    db = get_database()
    try:
        uid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")

    value = bool(body.is_verified)
    result = await db.users.update_one(
        {"_id": uid},
        {"$set": {"is_verified": value}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "ok": True,
        "is_verified": value,
        "modified_count": result.modified_count,
        "message": "Verified" if value else "Unverified",
    }


# =====================================================
# Product management (takedown / restore)
# =====================================================

class ProductListItem(BaseModel):
    id: str
    title: str
    seller_id: str
    seller_username: Optional[str] = None
    price: float
    status: str
    category: str
    report_count: int = 0
    created_at: Optional[str] = None


class ProductListResponse(BaseModel):
    items: List[ProductListItem]
    total: int
    page: int
    size: int


class TakedownBody(BaseModel):
    reason: Optional[str] = None


@router.get("/products", response_model=ProductListResponse)
async def list_products_admin(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    q: Optional[str] = Query(None, description="Search title"),
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status"),
    current_user: dict = Depends(get_current_admin_user),
):
    """Admin: paginated product list with optional search and status filter."""
    db = get_database()
    query = {}
    if q and q.strip():
        query["title"] = {"$regex": q.strip(), "$options": "i"}
    if status_filter:
        query["status"] = status_filter

    total = await db.products.count_documents(query)
    skip = (page - 1) * size
    docs = await db.products.find(query).sort("created_at", -1).skip(skip).limit(size).to_list(length=size)

    seller_ids = list({d["seller_id"] for d in docs if d.get("seller_id")})
    sellers = {}
    if seller_ids:
        async for u in db.users.find({"_id": {"$in": seller_ids}}, {"username": 1}):
            sellers[u["_id"]] = u.get("username", "")

    report_counts = {}
    product_ids = [d["_id"] for d in docs]
    if product_ids:
        pipeline = [
            {"$match": {"product_id": {"$in": product_ids}, "status": "pending"}},
            {"$group": {"_id": "$product_id", "count": {"$sum": 1}}},
        ]
        async for r in db.reports.aggregate(pipeline):
            report_counts[r["_id"]] = r["count"]

    items = [
        ProductListItem(
            id=str(d["_id"]),
            title=d.get("title", ""),
            seller_id=str(d.get("seller_id", "")),
            seller_username=sellers.get(d.get("seller_id"), ""),
            price=d.get("price", 0),
            status=d.get("status", "available"),
            category=d.get("category", ""),
            report_count=report_counts.get(d["_id"], 0),
            created_at=str(d["created_at"]) if d.get("created_at") else None,
        )
        for d in docs
    ]
    return ProductListResponse(items=items, total=total, page=page, size=size)


@router.post("/products/{product_id}/takedown", status_code=status.HTTP_200_OK)
async def takedown_product(
    product_id: str,
    body: Optional[TakedownBody] = Body(None),
    current_user: dict = Depends(get_current_admin_user),
):
    """Admin: take down (remove) a product from public listings."""
    db = get_database()
    try:
        pid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    product = await db.products.find_one({"_id": pid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.get("status") == "removed":
        raise HTTPException(status_code=400, detail="Product is already removed")

    reason = (body.reason if body else None) or ""
    await db.products.update_one(
        {"_id": pid},
        {"$set": {
            "status": "removed",
            "previous_status": product.get("status", "available"),
            "removed_reason": reason,
            "removed_by": current_user["user_id"],
            "removed_at": datetime.now(timezone.utc),
        }},
    )
    return {"ok": True, "message": "Product taken down"}


@router.post("/products/{product_id}/restore", status_code=status.HTTP_200_OK)
async def restore_product(
    product_id: str,
    current_user: dict = Depends(get_current_admin_user),
):
    """Admin: restore a previously taken-down product."""
    db = get_database()
    try:
        pid = ObjectId(product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    product = await db.products.find_one({"_id": pid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.get("status") != "removed":
        raise HTTPException(status_code=400, detail="Product is not removed")

    prev = product.get("previous_status", "available")
    await db.products.update_one(
        {"_id": pid},
        {
            "$set": {"status": prev},
            "$unset": {"removed_reason": "", "removed_by": "", "removed_at": "", "previous_status": ""},
        },
    )
    return {"ok": True, "message": f"Product restored to '{prev}'"}


# =====================================================
# Report management
# =====================================================

@router.get("/reports", response_model=dict)
async def list_reports(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status", description="pending/reviewed/resolved/dismissed"),
    current_user: dict = Depends(get_current_admin_user),
):
    """Admin: paginated report list."""
    db = get_database()
    query = {}
    if status_filter:
        query["status"] = status_filter

    total = await db.reports.count_documents(query)
    skip = (page - 1) * size
    docs = await db.reports.find(query).sort("created_at", -1).skip(skip).limit(size).to_list(length=size)

    user_ids = list({d.get("reporter_id") for d in docs if d.get("reporter_id")})
    product_ids = list({d.get("product_id") for d in docs if d.get("product_id")})

    users_map = {}
    if user_ids:
        async for u in db.users.find({"_id": {"$in": user_ids}}, {"username": 1}):
            users_map[u["_id"]] = u.get("username", "")

    products_map = {}
    if product_ids:
        async for p in db.products.find({"_id": {"$in": product_ids}}, {"title": 1}):
            products_map[p["_id"]] = p.get("title", "")

    items = [
        ReportResponse(
            id=str(d["_id"]),
            product_id=str(d["product_id"]),
            product_title=products_map.get(d.get("product_id"), ""),
            reporter_id=str(d["reporter_id"]),
            reporter_username=users_map.get(d.get("reporter_id"), ""),
            reason=d.get("reason", ""),
            description=d.get("description"),
            status=d.get("status", "pending"),
            admin_note=d.get("admin_note"),
            resolved_by=str(d["resolved_by"]) if d.get("resolved_by") else None,
            created_at=d["created_at"],
            updated_at=d.get("updated_at"),
        ).model_dump()
        for d in docs
    ]
    return {"items": items, "total": total, "page": page, "size": size}


@router.post("/reports/{report_id}/resolve", status_code=status.HTTP_200_OK)
async def resolve_report(
    report_id: str,
    body: ResolveBody,
    current_user: dict = Depends(get_current_admin_user),
):
    """
    Admin: handle a report.
    - status="takedown"  → 下架商品 + 标记举报为 resolved
    - status="dismissed" → 忽略举报
    """
    if body.status not in ("takedown", "dismissed"):
        raise HTTPException(status_code=400, detail="status must be 'takedown' or 'dismissed'")

    db = get_database()
    try:
        rid = ObjectId(report_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid report id")

    report = await db.reports.find_one({"_id": rid})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    now = datetime.now(timezone.utc)
    final_status = "resolved" if body.status == "takedown" else "dismissed"

    # If takedown: also remove the reported product
    if body.status == "takedown":
        pid = report.get("product_id")
        if pid:
            product = await db.products.find_one({"_id": pid})
            if product and product.get("status") != "removed":
                await db.products.update_one(
                    {"_id": pid},
                    {"$set": {
                        "status": "removed",
                        "previous_status": product.get("status", "available"),
                        "removed_reason": body.admin_note or f"Reported: {report.get('reason', '')}",
                        "removed_by": current_user["user_id"],
                        "removed_at": now,
                    }},
                )

    await db.reports.update_one(
        {"_id": rid},
        {"$set": {
            "status": final_status,
            "admin_note": body.admin_note or "",
            "resolved_by": ObjectId(current_user["user_id"]),
            "updated_at": now,
        }},
    )
    return {"ok": True, "message": f"Report {final_status}" + (" and product taken down" if body.status == "takedown" else "")}
