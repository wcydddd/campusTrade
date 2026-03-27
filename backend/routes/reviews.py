from fastapi import APIRouter, Depends, HTTPException, Query, status
from bson import ObjectId
from datetime import datetime

from utils.database import get_database
from utils.permission import require_verified_user
from models.review import ReviewCreate, ReviewResponse, UserReviewsResponse, UserReputationSummary
from models.order import OrderStatus


router = APIRouter(prefix="/reviews", tags=["Reviews"])


def _oid(id_str: str) -> ObjectId:
    if not ObjectId.is_valid(id_str):
        raise HTTPException(status_code=400, detail="Invalid ObjectId")
    return ObjectId(id_str)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_review(
    payload: ReviewCreate,
    current_user: dict = Depends(require_verified_user),
):
    """
    创建评价（订单 completed 后，买卖双方互评）
    - 只有参与该订单的用户才能评价
    - 订单未完成时不能评价
    - 同一用户对同一订单只能评价一次
    """
    db = get_database()
    uid = _oid(current_user["user_id"])
    oid = _oid(payload.order_id)

    order = await db.orders.find_one({"_id": oid})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.get("status") != OrderStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Order must be completed before reviewing")

    buyer_id = order.get("buyer_id")
    seller_id = order.get("seller_id")
    if uid != buyer_id and uid != seller_id:
        raise HTTPException(status_code=403, detail="You can only review orders you participated in")

    reviewee_id = seller_id if uid == buyer_id else buyer_id

    existing = await db.reviews.find_one({"order_id": oid, "reviewer_user_id": uid})
    if existing:
        raise HTTPException(status_code=409, detail="You have already reviewed this order")

    now = datetime.utcnow()
    doc = {
        "order_id": oid,
        "reviewer_user_id": uid,
        "reviewee_user_id": reviewee_id,
        "rating": int(payload.rating),
        "comment": (payload.comment or "").strip() or None,
        "created_at": now,
    }

    res = await db.reviews.insert_one(doc)
    return {"ok": True, "id": str(res.inserted_id)}


@router.get("/user/{user_id}", response_model=UserReviewsResponse)
async def get_user_reviews(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0, le=10000),
):
    """查询某个用户的评价列表 + 信誉汇总（平均分、总数）。"""
    db = get_database()
    target = _oid(user_id)

    # 汇总
    summary_cursor = db.reviews.aggregate(
        [
            {"$match": {"reviewee_user_id": target}},
            {
                "$group": {
                    "_id": "$reviewee_user_id",
                    "avg_rating": {"$avg": "$rating"},
                    "total_reviews": {"$sum": 1},
                }
            },
        ]
    )
    summary_docs = await summary_cursor.to_list(length=1)
    if summary_docs:
        avg_rating = float(summary_docs[0].get("avg_rating") or 0.0)
        total_reviews = int(summary_docs[0].get("total_reviews") or 0)
    else:
        avg_rating = 0.0
        total_reviews = 0

    # 列表（带 reviewer 用户名）
    pipeline = [
        {"$match": {"reviewee_user_id": target}},
        {"$sort": {"created_at": -1}},
        {"$skip": skip},
        {"$limit": limit},
        {
            "$lookup": {
                "from": "users",
                "localField": "reviewer_user_id",
                "foreignField": "_id",
                "as": "reviewer",
            }
        },
        {"$unwind": {"path": "$reviewer", "preserveNullAndEmptyArrays": True}},
        {
            "$project": {
                "_id": 1,
                "order_id": 1,
                "reviewer_user_id": 1,
                "reviewee_user_id": 1,
                "rating": 1,
                "comment": 1,
                "created_at": 1,
                "reviewer_username": {"$ifNull": ["$reviewer.username", "Deleted user"]},
            }
        },
    ]
    docs = await db.reviews.aggregate(pipeline).to_list(length=limit)

    items = [
        ReviewResponse(
            id=str(d["_id"]),
            order_id=str(d["order_id"]),
            reviewer_user_id=str(d["reviewer_user_id"]),
            reviewee_user_id=str(d["reviewee_user_id"]),
            rating=int(d["rating"]),
            comment=d.get("comment"),
            created_at=d["created_at"],
            reviewer_username=d.get("reviewer_username"),
        )
        for d in docs
    ]

    return UserReviewsResponse(
        summary=UserReputationSummary(
            user_id=str(target),
            avg_rating=round(avg_rating, 2),
            total_reviews=total_reviews,
        ),
        items=items,
    )


@router.get("/me")
async def get_my_given_reviews(
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0, le=10000),
    current_user: dict = Depends(require_verified_user),
):
    """获取我写过的评价列表（reviewer -> reviewee）。"""
    db = get_database()
    uid = _oid(current_user["user_id"])

    pipeline = [
        {"$match": {"reviewer_user_id": uid}},
        {"$sort": {"created_at": -1}},
        {"$skip": skip},
        {"$limit": limit},
        {
            "$lookup": {
                "from": "users",
                "localField": "reviewee_user_id",
                "foreignField": "_id",
                "as": "reviewee",
            }
        },
        {"$unwind": {"path": "$reviewee", "preserveNullAndEmptyArrays": True}},
        {
            "$project": {
                "_id": 1,
                "order_id": 1,
                "reviewer_user_id": 1,
                "reviewee_user_id": 1,
                "rating": 1,
                "comment": 1,
                "created_at": 1,
                "reviewee_username": {"$ifNull": ["$reviewee.username", "Deleted user"]},
            }
        },
    ]

    docs = await db.reviews.aggregate(pipeline).to_list(length=limit)
    items = [
        {
            "id": str(d["_id"]),
            "order_id": str(d["order_id"]),
            "reviewer_user_id": str(d["reviewer_user_id"]),
            "reviewee_user_id": str(d["reviewee_user_id"]),
            "rating": int(d["rating"]),
            "comment": d.get("comment"),
            "created_at": d["created_at"],
            "reviewee_username": d.get("reviewee_username"),
        }
        for d in docs
    ]

    return {"items": items}
