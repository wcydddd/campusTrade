from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from bson import ObjectId
from datetime import datetime

from utils.database import get_database
from utils.permission import require_verified_user
from routes.notifications import create_notification
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

def _user_safe(u: dict) -> dict:
    if not u:
        return {"id": "", "username": "", "email": None, "avatar_url": None}
    return {
        "id": str(u.get("_id", "")),
        "username": u.get("username", "") or "",
        "email": u.get("email"),
        "avatar_url": u.get("avatar_url"),
        "bio": u.get("bio"),
        "contact": u.get("contact"),
    }


async def _notify_order_status_change(
    db,
    order_doc: dict,
    actor_id: ObjectId,
    action: str,
):
    recipient_id = (
        order_doc["seller_id"]
        if actor_id == order_doc["buyer_id"]
        else order_doc["buyer_id"]
    )

    actor = await db.users.find_one({"_id": actor_id}, {"username": 1})
    product = await db.products.find_one({"_id": order_doc["product_id"]}, {"title": 1})

    actor_name = (actor or {}).get("username") or "Someone"
    product_title = (product or {}).get("title") or "the product"

    if action == "confirm":
        title = "Order confirmed"
        body = f"{actor_name} confirmed your order for '{product_title}'."
    elif action == "complete":
        title = "Order completed"
        body = f"{actor_name} marked the order for '{product_title}' as completed."
    elif action == "cancel":
        title = "Order cancelled"
        body = f"{actor_name} cancelled the order for '{product_title}'."
    else:
        return

    await create_notification(
        user_id=str(recipient_id),
        ntype="order_update",
        title=title,
        body=body,
        link=f"/orders/{str(order_doc['_id'])}",
    )


@router.get("/{order_id}")
async def get_order_detail(
    order_id: str,
    current_user: dict = Depends(require_verified_user),
):
    """
    订单详情（只允许 buyer / seller 查看）
    返回：订单 + 商品 + 买家 + 卖家 + 评价状态
    """
    db = get_database()
    oid = _oid(order_id)
    uid = _oid(current_user["user_id"])

    order = await db.orders.find_one({"_id": oid})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("buyer_id") != uid and order.get("seller_id") != uid:
        raise HTTPException(status_code=403, detail="You can only view your own orders")

    product = await db.products.find_one({"_id": order.get("product_id")})
    buyer = await db.users.find_one({"_id": order.get("buyer_id")})
    seller = await db.users.find_one({"_id": order.get("seller_id")})

    # 评价状态
    my_review = await db.reviews.find_one({"order_id": oid, "reviewer_user_id": uid})
    other_id = order.get("seller_id") if uid == order.get("buyer_id") else order.get("buyer_id")
    other_review = await db.reviews.find_one({"order_id": oid, "reviewer_user_id": other_id})

    final_price = None
    if product and isinstance(product.get("price"), (int, float)):
        final_price = product.get("price")

    return {
        "id": str(order["_id"]),
        "status": order.get("status"),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
        "final_price": final_price,
        "reviewed_by_me": my_review is not None,
        "reviewed_by_other": other_review is not None,
        "both_reviewed": (my_review is not None) and (other_review is not None),
        "product": {
            "id": str(product["_id"]) if product else str(order.get("product_id", "")),
            "title": product.get("title", "") if product else "",
            "description": product.get("description", "") if product else "",
            "price": product.get("price") if product else None,
            "category": product.get("category") if product else None,
            "condition": product.get("condition") if product else None,
            "images": product.get("images", []) if product else [],
            "seller_id": str(product.get("seller_id")) if product and product.get("seller_id") else str(order.get("seller_id", "")),
        },
        "buyer": _user_safe(buyer),
        "seller": _user_safe(seller),
    }


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

    # Notify seller that a new pending order requires confirmation
    try:
        buyer = await db.users.find_one({"_id": buyer_oid})
        buyer_name = (buyer or {}).get("username") or "A buyer"
        product_title = product.get("title") or "your product"
        await create_notification(
            user_id=str(seller_oid),
            ntype="order_update",
            title="New order pending confirmation",
            body=f"{buyer_name} placed an order for '{product_title}'. Please confirm it.",
            link=f"/orders/{str(doc['_id'])}",
        )
    except Exception:
        # Do not fail order creation if notification push fails
        pass

    # Optional: notify buyer that order was placed successfully
    try:
        await create_notification(
            user_id=str(buyer_oid),
            ntype="system",
            title="Order created",
            body=f"Your order for '{product.get('title') or 'product'}' was created successfully.",
            link=f"/orders/{str(doc['_id'])}",
        )
    except Exception:
        pass

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

    order_ids = [d["_id"] for d in docs]
    reviewed_set = set()
    if order_ids:
        reviewed_docs = await db.reviews.find(
            {"order_id": {"$in": order_ids}, "reviewer_user_id": uid},
            {"order_id": 1},
        ).to_list(length=200)
        for r in reviewed_docs:
            if r.get("order_id"):
                reviewed_set.add(str(r["order_id"]))

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
            "reviewed_by_me": str(d["_id"]) in reviewed_set,
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
    # 卖家确认后即从公开商品列表下架（与首页默认排除 sold 一致）；完成订单时再次写入 sold 为幂等
    await db.products.update_one(
        {"_id": doc["product_id"]},
        {"$set": {"status": ProductStatus.SOLD.value, "updated_at": now}},
    )
    updated = await db.orders.find_one({"_id": oid})
    try:
        await _notify_order_status_change(db, updated, uid, "confirm")
    except Exception:
        pass
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
    try:
        await _notify_order_status_change(db, updated, uid, "complete")
    except Exception:
        pass
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
    try:
        await _notify_order_status_change(db, updated, uid, "cancel")
    except Exception:
        pass
    return _to_response(updated)
