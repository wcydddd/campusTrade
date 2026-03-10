from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class ConversationResponse(BaseModel):
    id: str
    participants: List[str]
    product_id: Optional[str] = None
    last_message: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime
