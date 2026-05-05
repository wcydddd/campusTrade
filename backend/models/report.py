from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class ReportReason(str, Enum):
    SPAM = "spam"
    FRAUD = "fraud"
    INAPPROPRIATE = "inappropriate"
    PROHIBITED_ITEM = "prohibited_item"
    WRONG_CATEGORY = "wrong_category"
    OTHER = "other"


class ReportStatus(str, Enum):
    PENDING = "pending"
    REVIEWED = "reviewed"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class ReportCreate(BaseModel):
    product_id: str
    reason: ReportReason
    description: Optional[str] = Field(None, max_length=500)


class ReportResponse(BaseModel):
    id: str
    product_id: str
    product_title: Optional[str] = None
    reporter_id: str
    reporter_username: Optional[str] = None
    reason: str
    description: Optional[str] = None
    status: str
    admin_note: Optional[str] = None
    resolved_by: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class ResolveBody(BaseModel):
    status: str  # "takedown" (下架商品+resolved) | "dismissed" (忽略)
    admin_note: Optional[str] = Field(None, max_length=500)
