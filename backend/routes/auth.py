from fastapi import APIRouter, HTTPException, status, Depends
from models.user import UserCreate, UserLogin, UserResponse, TokenResponse
from utils.security import (
    hash_password, 
    verify_password, 
    create_access_token, 
    get_current_user,
    is_valid_university_email
)
from utils.database import get_database
from bson import ObjectId
from datetime import datetime

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """用户注册"""
    db = get_database()
    
    # 1. 检查是否是学校邮箱
    if not is_valid_university_email(user_data.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please use a university email address (.edu or .ac.uk)"
        )
    
    # 2. 检查邮箱是否已注册
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # 3. 检查用户名是否已存在
    existing_username = await db.users.find_one({"username": user_data.username})
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # 4. 创建用户
    new_user = {
        "email": user_data.email,
        "username": user_data.username,
        "hashed_password": hash_password(user_data.password),
        "role": "user",
        "is_verified": False,
        "avatar_url": None,
        "created_at": datetime.utcnow()
    }
    
    result = await db.users.insert_one(new_user)
    user_id = str(result.inserted_id)
    
    # 5. 生成 token
    access_token = create_access_token(data={"sub": user_id, "email": user_data.email})
    
    # 6. 返回结果
    user_response = UserResponse(
        id=user_id,
        email=user_data.email,
        username=user_data.username,
        role="user",
        is_verified=False,
        avatar_url=None,
        created_at=new_user["created_at"]
    )
    
    return TokenResponse(access_token=access_token, user=user_response)


@router.post("/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    """用户登录"""
    db = get_database()
    
    # 1. 查找用户
    user = await db.users.find_one({"email": user_data.email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # 2. 验证密码
    if not verify_password(user_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # 3. 生成 token
    user_id = str(user["_id"])
    access_token = create_access_token(data={"sub": user_id, "email": user["email"]})
    
    # 4. 返回结果
    user_response = UserResponse(
        id=user_id,
        email=user["email"],
        username=user["username"],
        role=user["role"],
        is_verified=user["is_verified"],
        avatar_url=user.get("avatar_url"),
        created_at=user["created_at"]
    )
    
    return TokenResponse(access_token=access_token, user=user_response)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息"""
    db = get_database()
    
    user = await db.users.find_one({"_id": ObjectId(current_user["user_id"])})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        username=user["username"],
        role=user["role"],
        is_verified=user["is_verified"],
        avatar_url=user.get("avatar_url"),
        created_at=user["created_at"]
    )
