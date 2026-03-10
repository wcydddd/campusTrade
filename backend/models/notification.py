from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class NotificationResponse(BaseModel):
    id: str
    user_id: str
    type: str  # "new_message", "product_sold", "product_favorited", etc.
    title: str
    body: str
    related_id: Optional[str] = None  # conversation_id, product_id, etc.
    is_read: bool = False
    created_at: datetime
