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

    class Config:
        from_attributes = True


class UserReputationSummary(BaseModel):
    user_id: str
    avg_rating: float
    total_reviews: int


class UserReviewsResponse(BaseModel):
    summary: UserReputationSummary
    items: list[ReviewResponse]

