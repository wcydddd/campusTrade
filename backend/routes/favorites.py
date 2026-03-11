from typing import List
from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime

from utils.database import get_database
from utils.security import get_current_user
from models.product import ProductResponse

router = APIRouter(prefix="/favorites", tags=["Favorites"])


def _oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="Invalid ObjectId")
    return ObjectId(id_str)


def _to_response(doc: dict) -> ProductResponse:
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


@router.get("", response_model=List[ProductResponse])
async def get_favorites(current_user: dict = Depends(get_current_user)):
    """获取当前用户收藏的商品列表"""
    db = get_database()
    uid = _oid(current_user["user_id"])

    cursor = db.favorites.find({"user_id": uid}).sort("created_at", -1)
    fav_docs = await cursor.to_list(length=200)

    result = []
    for f in fav_docs:
        product = await db.products.find_one({"_id": f["product_id"]})
        if product:
            result.append(_to_response(product))
    return result


@router.post("/{product_id}")
async def add_favorite(
    product_id: str,
    current_user: dict = Depends(get_current_user),
):
    """添加收藏（前端调用 POST /favorites/{product_id}）"""
    db = get_database()
    uid = _oid(current_user["user_id"])
    pid = _oid(product_id)

    product = await db.products.find_one({"_id": pid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    existing = await db.favorites.find_one({"user_id": uid, "product_id": pid})
    if existing:
        return {"ok": True, "message": "Already in favorites"}

    await db.favorites.insert_one({
        "user_id": uid,
        "product_id": pid,
        "created_at": datetime.utcnow(),
    })
    return {"ok": True}


@router.delete("/{product_id}")
async def remove_favorite(
    product_id: str,
    current_user: dict = Depends(get_current_user),
):
    """取消收藏"""
    db = get_database()
    uid = _oid(current_user["user_id"])
    pid = _oid(product_id)

    result = await db.favorites.delete_one({"user_id": uid, "product_id": pid})
    if result.deleted_count == 0:
        return {"ok": True, "message": "Not in favorites or already removed"}
    return {"ok": True}
