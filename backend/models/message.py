from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from bson import ObjectId


class PyObjectId(ObjectId):
    @classmethod
    def __get_validators__(cls):
        yield cls.validate

    @classmethod
    def validate(cls, v):
        if isinstance(v, ObjectId):
            return v
        if not ObjectId.is_valid(v):
            raise ValueError("Invalid ObjectId")
        return ObjectId(v)


class MessageCreate(BaseModel):
    to_user_id: str = Field(..., description="Receiver user id (ObjectId string)")
    content: str = Field(..., min_length=1, max_length=2000)
    product_id: Optional[str] = Field(None, description="Optional product id (ObjectId string)")


class MessageInDB(BaseModel):
    id: PyObjectId = Field(default_factory=PyObjectId, alias="_id")
    from_user_id: PyObjectId
    to_user_id: PyObjectId
    content: str
    product_id: Optional[PyObjectId] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}


class MessageResponse(BaseModel):
    id: str
    from_user_id: str
    to_user_id: str
    content: str
    product_id: Optional[str] = None
    created_at: datetime