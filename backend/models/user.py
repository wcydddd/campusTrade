from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class UserRole(str,Enum):
    USER='user'
    ADMIN='admin'


# 用户注册请求
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    username: str = Field(..., min_length=2, max_length=30)

# 用户登录请求
class UserLogin(BaseModel):
    email: EmailStr
    password: str

# 数据库中的用户
class UserInDB(BaseModel):
    id: Optional[str] = None
    email: EmailStr
    username: str
    hashed_password: str
    role: UserRole = UserRole.USER
    is_verified: bool = False
    avatar_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime)

    # 返回给前端的用户（不含密码）
class UserResponse(BaseModel):
    id: str
    email: EmailStr
    username: str
    role: UserRole
    is_verified: bool
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    created_at: datetime


class ProfileUpdate(BaseModel):
    username: Optional[str] = Field(None, min_length=2, max_length=30)
    bio: Optional[str] = Field(None, max_length=500)


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8)


# Token 响应
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse