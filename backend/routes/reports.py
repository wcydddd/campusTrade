from fastapi import APIRouter, Depends, HTTPException, status
from datetime import datetime, timezone
from bson import ObjectId

from utils.database import get_database
from utils.permission import require_verified_user
from models.report import ReportCreate
from routes.notifications import notify_admins_new_report

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreate,
    current_user: dict = Depends(require_verified_user),
):
    """Submit a report for a product. One active report per user per product."""
    db = get_database()
    uid = ObjectId(current_user["user_id"])

    try:
        pid = ObjectId(payload.product_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    product = await db.products.find_one({"_id": pid})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    if str(product.get("seller_id")) == current_user["user_id"]:
        raise HTTPException(status_code=400, detail="Cannot report your own product")

    existing = await db.reports.find_one({
        "product_id": pid,
        "reporter_id": uid,
        "status": "pending",
    })
    if existing:
        raise HTTPException(status_code=400, detail="You already have a pending report for this product")

    now = datetime.now(timezone.utc)
    doc = {
        "product_id": pid,
        "reporter_id": uid,
        "reason": payload.reason,
        "description": payload.description or "",
        "status": "pending",
        "created_at": now,
    }
    await db.reports.insert_one(doc)
    await notify_admins_new_report(
        str(pid),
        product.get("title", ""),
        payload.reason,
    )
    return {"ok": True, "message": "Report submitted"}
