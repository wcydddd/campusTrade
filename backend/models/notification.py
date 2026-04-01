from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class NotificationType(str, Enum):
    NEW_ORDER = "new_order"
    ORDER_UPDATE = "order_update"
    NEW_FAVORITE = "new_favorite"
    PRICE_DROP = "price_drop"
    SYSTEM = "system"
    PRODUCT_REVIEW = "product_review"  # seller: listing approved/rejected
    PRODUCT_TAKEDOWN = "product_takedown"  # seller: admin removed listing from marketplace
    PRODUCT_RESTORED = "product_restored"  # seller: admin restored listing after takedown
    ADMIN_REVIEW = "admin_review"  # admin: new/edited listing needs review
    ADMIN_REPORT = "admin_report"  # admin: user reported a product


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: NotificationType
    title: str
    body: str
    read: bool = False
    link: Optional[str] = None
    created_at: datetime
