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
    def validate(cls, v, info=None):  # 更新
        if isinstance(v, ObjectId):
            return v
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)

class ProductCategory(str, Enum):
    TEXTBOOKS = "教材"
    ELECTRONICS = "电子产品"
    FURNITURE = "家具"
    CLOTHING = "服饰"
    SPORTS = "运动器材"
    OTHER = "其他"

class ProductStatus(str, Enum):
    AVAILABLE = "available"
    RESERVED = "reserved"
    SOLD = "sold"

class ProductBase(BaseModel):
    title: str
    description: str
    price: float
    category: ProductCategory
    condition: str  # "全新", "9成新", "7成新" etc.
    sustainable: bool = False  # 可循环这一块
    images: List[str] = []

class ProductCreate(ProductBase):
    pass

class ProductInDB(ProductBase):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    seller_id: PyObjectId
    status: ProductStatus = ProductStatus.AVAILABLE
    views: int = 0
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
    created_at: datetime
    updated_at: datetime  # 更新

    class Config:
        from_attributes = True
