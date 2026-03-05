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

    # 检查商品存在且可购买
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

    # 检查是否已有该商品的 pending/confirmed 订单
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

    # 锁定商品：设为 reserved
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


@router.get("/my")
async def get_my_orders(
    role: Optional[str] = Query(None, description="buyer | seller"),
    current_user: dict = Depends(require_verified_user),
):
    """
    获取当前用户的订单列表
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

    # 关联商品信息便于前端展示
    result = []
    for d in docs:
        product = await db.products.find_one({"_id": d["product_id"]})
        result.append({
            **_to_response(d).model_dump(),
            "product_title": product.get("title", "") if product else "",
            "product_price": product.get("price", 0) if product else 0,
        })

    return result


@router.post("/{order_id}/confirm", response_model=OrderResponse)
async def confirm_order(
    order_id: str,
    current_user: dict = Depends(require_verified_user),
):
    """卖家确认订单"""
    db = get_database()
    oid = _oid(order_id)
    uid = _oid(current_user["user_id"])

    doc = await db.orders.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")

    if doc["seller_id"] != uid:
        raise HTTPException(status_code=403, detail="Only seller can confirm")

    if doc["status"] != OrderStatus.PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot confirm order with status: {doc['status']}",
        )

    now = datetime.utcnow()
    await db.orders.update_one(
        {"_id": oid},
        {"$set": {"status": OrderStatus.CONFIRMED.value, "updated_at": now}},
    )
    updated = await db.orders.find_one({"_id": oid})
    return _to_response(updated)


@router.post("/{order_id}/complete", response_model=OrderResponse)
async def complete_order(
    order_id: str,
    current_user: dict = Depends(require_verified_user),
):
    """
    完成订单
    - 必须卖家先 Confirm，订单变为 confirmed 后，买卖双方才能 Complete
    - 完成后商品自动标 sold，不再出现在默认列表
    """
    db = get_database()
    oid = _oid(order_id)
    uid = _oid(current_user["user_id"])

    doc = await db.orders.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")

    if doc["buyer_id"] != uid and doc["seller_id"] != uid:
        raise HTTPException(status_code=403, detail="Only buyer or seller can complete")

    if doc["status"] != OrderStatus.CONFIRMED.value:
        raise HTTPException(
            status_code=400,
            detail="Order must be confirmed by seller before completion",
        )

    now = datetime.utcnow()

    # 更新订单状态
    await db.orders.update_one(
        {"_id": oid},
        {"$set": {"status": OrderStatus.COMPLETED.value, "updated_at": now}},
    )

    # 商品标为 sold
    await db.products.update_one(
        {"_id": doc["product_id"]},
        {
            "$set": {
                "status": ProductStatus.SOLD.value,
                "updated_at": now,
            }
        },
    )

    updated = await db.orders.find_one({"_id": oid})
    return _to_response(updated)


@router.post("/{order_id}/cancel", response_model=OrderResponse)
async def cancel_order(
    order_id: str,
    current_user: dict = Depends(require_verified_user),
):
    """
    取消订单
    - 买卖双方都可操作（pending/confirmed 状态下）
    - 取消后商品恢复为 available
    """
    db = get_database()
    oid = _oid(order_id)
    uid = _oid(current_user["user_id"])

    doc = await db.orders.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")

    if doc["buyer_id"] != uid and doc["seller_id"] != uid:
        raise HTTPException(status_code=403, detail="Only buyer or seller can cancel")

    if doc["status"] not in [OrderStatus.PENDING.value, OrderStatus.CONFIRMED.value]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel order with status: {doc['status']}",
        )

    now = datetime.utcnow()

    # 更新订单状态
    await db.orders.update_one(
        {"_id": oid},
        {"$set": {"status": OrderStatus.CANCELLED.value, "updated_at": now}},
    )

    # 商品恢复为 available
    await db.products.update_one(
        {"_id": doc["product_id"]},
        {
            "$set": {
                "status": ProductStatus.AVAILABLE.value,
                "updated_at": now,
            }
        },
    )

    updated = await db.orders.find_one({"_id": oid})
    return _to_response(updated)
