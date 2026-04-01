from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ReviewCreate(BaseModel):
    order_id: str
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=1000)


class ReviewResponse(BaseModel):
    id: str
    order_id: str
    reviewer_user_id: str
    reviewee_user_id: str
    rating: int
    comment: Optional[str] = None
    created_at: datetime

    reviewer_username: Optional[str] = None
    reviewee_role: Optional[str] = Field(
        default=None,
        description="Reviewee's role in the order: seller (rated by buyer) or buyer (rated by seller).",
    )

    class Config:
        from_attributes = True


class UserReputationSummary(BaseModel):
    user_id: str
    avg_rating: float
    total_reviews: int


class UserReputationSection(BaseModel):
    summary: UserReputationSummary
    items: list[ReviewResponse]


class UserReviewsByRoleResponse(BaseModel):
    """同一用户作为卖家收到的评价 vs 作为买家收到的评价（分开展示）。"""
    user_id: str
    as_seller: UserReputationSection
    as_buyer: UserReputationSection

