from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import settings

# 密码加密
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Bearer
security = HTTPBearer()


def hash_password(password: str) -> str:
    """加密密码"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """生成 JWT token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    return encoded_jwt


def decode_token(token: str) -> dict:
    """解析 JWT token"""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """从 token 获取当前用户"""
    token = credentials.credentials
    payload = decode_token(token)
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )
    
    return {"user_id": user_id, "email": payload.get("email")}


async def get_current_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """获取当前用户，且必须是 admin 角色"""
    from utils.database import get_database

    current = await get_current_user(credentials)
    db = get_database()

    from bson import ObjectId
    try:
        uid = ObjectId(current["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    user = await db.users.find_one({"_id": uid})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if user.get("is_banned", False):
        raise HTTPException(status_code=403, detail="Account is banned")

    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    return current


def is_valid_university_email(email: str) -> bool:
    """检查是否是学校邮箱"""
    allowed_domains = settings.allowed_email_domains.split(",")
    # allowed_domains = ["@university.edu", "@student.ac.uk"]
    return any(email.endswith(domain.strip()) for domain in allowed_domains)
