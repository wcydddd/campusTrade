from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from bson import ObjectId
from enum import Enum

class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v, info=None):
        if isinstance(v, ObjectId):
            return v
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

class ProductCategory(str, Enum):
    TEXTBOOKS = "Textbooks"
    ELECTRONICS = "Electronics"
    FURNITURE = "Furniture"
    CLOTHING = "Clothing"
    SPORTS = "Sports"
    KITCHEN = "Kitchen"
    STATIONERY = "Stationery"
    OTHER = "Other"

class ProductStatus(str, Enum):
    PENDING = "pending"
    AVAILABLE = "available"
    RESERVED = "reserved"
    SOLD = "sold"
    REMOVED = "removed"
    REJECTED = "rejected"

class ProductBase(BaseModel):
    title: str
    description: str
    price: float
    category: ProductCategory
    condition: str
    sustainable: bool = False
    images: List[str] = Field(default_factory=list)

class ProductCreate(ProductBase):
    pass

class ProductInDB(ProductBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    seller_id: PyObjectId
    status: ProductStatus = ProductStatus.PENDING
    views: int = 0
    boosted_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}

class ProductResponse(BaseModel):
    id: str
    title: str
    description: str
    price: float
    category: str
    condition: str
    sustainable: bool = False
    images: List[str]
    seller_id: str
    status: str
    views: int
    boosted_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    thumb_url: Optional[str] = None
    is_favorited: Optional[bool] = None

    class Config:
        from_attributes = True
