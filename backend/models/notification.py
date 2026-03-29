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


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: NotificationType
    title: str
    body: str
    read: bool = False
    link: Optional[str] = None
    created_at: datetime
