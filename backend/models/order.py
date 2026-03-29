from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


class OrderStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class OrderCreate(BaseModel):
    """买家发起订单时只需传 product_id"""
    product_id: str


class OrderResponse(BaseModel):
    id: str
    buyer_id: str
    seller_id: str
    product_id: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
