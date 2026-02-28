from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from pydantic import BaseModel
from typing import Optional, List
from bson import ObjectId

from utils.database import get_database
from utils.security import get_current_admin_user

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
    role: str  # "user" | "admin"


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
