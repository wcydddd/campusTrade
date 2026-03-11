from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from bson import ObjectId
from datetime import datetime

from utils.database import get_database
from utils.permission import require_verified_user
from models.order import OrderCreate, OrderResponse, OrderStatus
from models.product import ProductStatus

router = APIRouter(prefix="/orders", tags=["Orders"])


def _oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="Invalid ObjectId")
    return ObjectId(id_str)


def _to_response(doc: dict) -> OrderResponse:
    return OrderResponse(
        id=str(doc["_id"]),
        buyer_id=str(doc["buyer_id"]),
        seller_id=str(doc["seller_id"]),
        product_id=str(doc["product_id"]),
        status=doc["status"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )


@router.post("", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    payload: OrderCreate,
    current_user: dict = Depends(require_verified_user),
):
    """
    买家对商品发起订单
    - 商品必须为 available
    - 创建成功后商品自动设为 reserved
    """
    db = get_database()
    buyer_oid = _oid(current_user["user_id"])
    product_oid = _oid(payload.product_id)

    product = await db.products.find_one({"_id": product_oid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if product.get("status") != ProductStatus.AVAILABLE.value:
        raise HTTPException(
            status_code=400,
            detail="Product is not available for purchase",
        )

    seller_oid = product["seller_id"]
    if buyer_oid == seller_oid:
        raise HTTPException(
            status_code=400,
            detail="Cannot create order for your own product",
        )

    existing = await db.orders.find_one(
        {
            "product_id": product_oid,
            "status": {"$in": [OrderStatus.PENDING.value, OrderStatus.CONFIRMED.value]},
        }
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="This product already has an active order",
        )

    now = datetime.utcnow()
    doc = {
        "buyer_id": buyer_oid,
        "seller_id": seller_oid,
        "product_id": product_oid,
        "status": OrderStatus.PENDING.value,
        "created_at": now,
        "updated_at": now,
    }

    res = await db.orders.insert_one(doc)
    doc["_id"] = res.inserted_id

    await db.products.update_one(
        {"_id": product_oid},
        {
            "$set": {
                "status": ProductStatus.RESERVED.value,
                "updated_at": now,
            }
        },
    )

    return _to_response(doc)


@router.get("")
async def get_orders(
    role: Optional[str] = Query(None, description="buyer | seller"),
    current_user: dict = Depends(require_verified_user),
):
    """
    获取当前用户的订单列表（匹配前端 GET /orders?role=buyer|seller）
    - role=buyer: 作为买家的订单
    - role=seller: 作为卖家的订单
    - 不传 role: 返回两者
    """
    db = get_database()
    uid = _oid(current_user["user_id"])

    query = {}
    if role == "buyer":
        query["buyer_id"] = uid
    elif role == "seller":
        query["seller_id"] = uid
    else:
        query["$or"] = [{"buyer_id": uid}, {"seller_id": uid}]

    cursor = db.orders.find(query).sort("created_at", -1)
    docs = await cursor.to_list(length=100)

    result = []
    for d in docs:
        product = await db.products.find_one({"_id": d["product_id"]})
        seller = await db.users.find_one({"_id": d["seller_id"]})
        buyer = await db.users.find_one({"_id": d["buyer_id"]})
        product_image = None
        if product and product.get("images"):
            product_image = product["images"][0] if isinstance(product["images"][0], str) else None
        result.append({
            **_to_response(d).model_dump(),
            "product_title": product.get("title", "") if product else "",
            "product_price": product.get("price", 0) if product else 0,
            "product_image": product_image,
            "price": product.get("price", 0) if product else 0,
            "seller_name": seller.get("username", "") if seller else "",
            "buyer_name": buyer.get("username", "") if buyer else "",
        })

    return result


@router.patch("/{order_id}/{action}", response_model=OrderResponse)
async def update_order(
    order_id: str,
    action: str,
    current_user: dict = Depends(require_verified_user),
):
    """
    前端使用 PATCH /orders/{id}/{action}
    action: confirm | complete | cancel
    """
    db = get_database()
    oid = _oid(order_id)
    uid = _oid(current_user["user_id"])

    if action == "confirm":
        updated = await _do_confirm_async(db, oid, uid)
    elif action == "complete":
        updated = await _do_complete_async(db, oid, uid)
    elif action == "cancel":
        updated = await _do_cancel_async(db, oid, uid)
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")

    return updated


async def _do_confirm_async(db, oid: ObjectId, uid: ObjectId) -> OrderResponse:
    doc = await db.orders.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    if doc["seller_id"] != uid:
        raise HTTPException(status_code=403, detail="Only seller can confirm")
    if doc["status"] != OrderStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Cannot confirm order with status: {doc['status']}")
    now = datetime.utcnow()
    await db.orders.update_one(
        {"_id": oid},
        {"$set": {"status": OrderStatus.CONFIRMED.value, "updated_at": now}},
    )
    updated = await db.orders.find_one({"_id": oid})
    return _to_response(updated)


async def _do_complete_async(db, oid: ObjectId, uid: ObjectId) -> OrderResponse:
    doc = await db.orders.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    if doc["buyer_id"] != uid and doc["seller_id"] != uid:
        raise HTTPException(status_code=403, detail="Only buyer or seller can complete")
    if doc["status"] != OrderStatus.CONFIRMED.value:
        raise HTTPException(status_code=400, detail="Order must be confirmed by seller before completion")
    now = datetime.utcnow()
    await db.orders.update_one(
        {"_id": oid},
        {"$set": {"status": OrderStatus.COMPLETED.value, "updated_at": now}},
    )
    await db.products.update_one(
        {"_id": doc["product_id"]},
        {"$set": {"status": ProductStatus.SOLD.value, "updated_at": now}},
    )
    updated = await db.orders.find_one({"_id": oid})
    return _to_response(updated)


async def _do_cancel_async(db, oid: ObjectId, uid: ObjectId) -> OrderResponse:
    doc = await db.orders.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    if doc["buyer_id"] != uid and doc["seller_id"] != uid:
        raise HTTPException(status_code=403, detail="Only buyer or seller can cancel")
    if doc["status"] not in [OrderStatus.PENDING.value, OrderStatus.CONFIRMED.value]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel order with status: {doc['status']}")
    now = datetime.utcnow()
    await db.orders.update_one(
        {"_id": oid},
        {"$set": {"status": OrderStatus.CANCELLED.value, "updated_at": now}},
    )
    await db.products.update_one(
        {"_id": doc["product_id"]},
        {"$set": {"status": ProductStatus.AVAILABLE.value, "updated_at": now}},
    )
    updated = await db.orders.find_one({"_id": oid})
    return _to_response(updated)
