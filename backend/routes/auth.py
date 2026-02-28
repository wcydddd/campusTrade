from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File
from pydantic import BaseModel, EmailStr
from models.user import UserCreate, UserLogin, UserResponse, TokenResponse, ProfileUpdate, ChangePasswordRequest
from utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    is_valid_university_email
)
from utils.database import get_database
from utils.otp import generate_numeric_code, hash_code      # ✅ 新增：验证码生成 & hash
from utils.email import send_verification_code              # ✅ 新增：SMTP 发验证码
from bson import ObjectId
from datetime import datetime, timedelta, timezone

router = APIRouter(prefix="/auth", tags=["Authentication"])

# =========================
# 邮箱验证码配置（可后续放进 config.py）
# =========================
OTP_EXPIRE_MINUTES = 10            # 验证码 10 分钟有效
OTP_RESEND_COOLDOWN_SECONDS = 60   # 60 秒内禁止重复发送
OTP_MAX_ATTEMPTS = 5               # 最多尝试 5 次，超过需重新获取验证码


# =========================
# 请求体模型
# =========================
class SendCodeRequest(BaseModel):
    """发送验证码请求"""
    email: EmailStr


class VerifyCodeRequest(BaseModel):
    """校验验证码请求"""
    email: EmailStr
    code: str


# =====================================================
# ✅ 方案A：注册（不返回 token）
# =====================================================
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """
    注册（方案A）：
    - 创建用户并设置 is_verified=False
    - 不返回 token（必须先邮箱验证成功，才能 login 获取 token）
    """
    db = get_database()

    email = user_data.email.lower()

    # 1) 学校邮箱校验
    if not is_valid_university_email(email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please use a university email address"
        )

    # 2) 邮箱检查：已验证的不允许重复注册；未验证的允许覆盖
    existing_user = await db.users.find_one({"email": email})
    if existing_user:
        if existing_user.get("is_verified", False):
            raise HTTPException(status_code=400, detail="Email already registered")
        # 未验证：删除旧记录，允许重新注册
        await db.users.delete_one({"_id": existing_user["_id"]})
        await db.email_verifications.delete_many({"email": email})

    # 3) 用户名唯一（排除刚被删掉的同一邮箱旧记录）
    existing_username = await db.users.find_one({"username": user_data.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    # 4) 插入用户
    now = datetime.utcnow()
    new_user = {
        "email": email,
        "username": user_data.username,
        "hashed_password": hash_password(user_data.password),
        "role": "user",
        "is_verified": False,
        "avatar_url": None,
        "created_at": now
    }

    result = await db.users.insert_one(new_user)

    return UserResponse(
        id=str(result.inserted_id),
        email=new_user["email"],
        username=new_user["username"],
        role=new_user["role"],
        is_verified=new_user["is_verified"],
        avatar_url=new_user["avatar_url"],
        created_at=new_user["created_at"]
    )


# =====================================================
# ✅ 发送验证码（人员验证第 1 步）
# =====================================================
@router.post("/send-verification-code")
async def send_email_code(req: SendCodeRequest):
    """
    发送邮箱验证码：
    1) 校验学校邮箱
    2) 必须已注册用户才可发送
    3) 已验证的不再发送
    4) 冷却时间限制防刷
    5) 生成验证码 -> hash 入库（不存明文）-> 发邮件
    """
    db = get_database()
    email = req.email.lower()

    # 1) 学校邮箱校验
    if not is_valid_university_email(email):
        raise HTTPException(status_code=400, detail="Please use a university email address")

    # 2) 用户必须存在
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=404, detail="User not found, please register first")

    # 3) 已验证则无需重复发送
    if user.get("is_verified") is True:
        return {"message": "Email already verified"}

    now = datetime.now(timezone.utc)

    # 4) 发送冷却
    record = await db.email_verifications.find_one({"email": email})
    if record and record.get("last_sent_at"):
        last_sent_at = record["last_sent_at"]
        if last_sent_at.tzinfo is None:
            last_sent_at = last_sent_at.replace(tzinfo=timezone.utc)

        if (now - last_sent_at).total_seconds() < OTP_RESEND_COOLDOWN_SECONDS:
            raise HTTPException(status_code=429, detail="Too many requests, please try again later")

    # 5) 生成验证码并 hash（注意：数据库只存 hash）
    code = generate_numeric_code(6)
    code_h = hash_code(email, code)

    expires_at = now + timedelta(minutes=OTP_EXPIRE_MINUTES)

    # 6) upsert：同邮箱只保留一条记录（重发覆盖）
    await db.email_verifications.update_one(
        {"email": email},
        {"$set": {
            "email": email,
            "code_hash": code_h,
            "expires_at": expires_at,
            "attempts": 0,        # 重发重置失败次数
            "last_sent_at": now,
            "created_at": now
        }},
        upsert=True
    )

    # 7) 发邮件（明文验证码只通过邮件发给用户）
    try:
        await send_verification_code(email=email, code=code)
    except Exception as e:
        print(f"[email] Send failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")

    return {"message": "Verification code sent"}


# =====================================================
# ✅ 校验验证码（人员验证第 2 步）
# =====================================================
@router.post("/verify-email")
async def verify_email(req: VerifyCodeRequest):
    """
    校验验证码：
    - 成功后：users.is_verified = True
    - 不返回 token（方案A：token 由 /auth/login 发）
    """
    db = get_database()
    email = req.email.lower()
    code = req.code.strip()

    # 0) 格式校验：6位数字（可按需求调整）
    if not (code.isdigit() and len(code) == 6):
        raise HTTPException(status_code=400, detail="Invalid code format")

    # 1) 查验证码记录
    record = await db.email_verifications.find_one({"email": email})
    if not record:
        raise HTTPException(status_code=400, detail="Please request a verification code first")

    now = datetime.now(timezone.utc)

    # 2) 过期校验
    expires_at = record.get("expires_at")
    if expires_at is None:
        raise HTTPException(status_code=400, detail="Verification record invalid")

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        raise HTTPException(status_code=400, detail="Code expired, please request a new one")

    # 3) 次数限制
    attempts = int(record.get("attempts", 0))
    if attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many failed attempts, please request a new code")

    # 4) hash 比对
    expected_hash = record.get("code_hash")
    if hash_code(email, code) != expected_hash:
        await db.email_verifications.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Incorrect code")

    # 5) 验证成功：更新用户状态
    update_result = await db.users.update_one({"email": email}, {"$set": {"is_verified": True}})
    if update_result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    # 6) 删除验证码记录，防止复用
    await db.email_verifications.delete_one({"email": email})

    return {"message": "Email verified successfully"}


# =====================================================
# ✅ 登录（必须 is_verified=True 才发 token）
# =====================================================
@router.post("/login", response_model=TokenResponse)
async def login(user_data: UserLogin):
    """用户登录（方案A：必须完成邮箱验证才允许登录）"""
    db = get_database()
    email = user_data.email.lower()

    # 1) 查找用户
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # 2) 未验证邮箱：禁止登录
    if user.get("is_verified") is False:
        raise HTTPException(status_code=403, detail="Email not verified. Please verify your email first.")

    # 2b) 封禁用户禁止登录
    if user.get("banned"):
        raise HTTPException(status_code=403, detail="Account is banned.")

    # 3) 验证密码
    if not verify_password(user_data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # 4) 生成 token
    user_id = str(user["_id"])
    access_token = create_access_token(data={"sub": user_id, "email": user["email"]})

    # 5) 返回 token + user
    user_response = UserResponse(
        id=user_id,
        email=user["email"],
        username=user["username"],
        role=user["role"],
        is_verified=user["is_verified"],
        avatar_url=user.get("avatar_url"),
        bio=user.get("bio"),
        created_at=user["created_at"]
    )

    return TokenResponse(access_token=access_token, user=user_response)


# =====================================================
# /me：获取当前用户（保持你们原有 JWT 结构）
# =====================================================
@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息"""
    db = get_database()

    user = await db.users.find_one({"_id": ObjectId(current_user["user_id"])})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        username=user["username"],
        role=user["role"],
        is_verified=user["is_verified"],
        avatar_url=user.get("avatar_url"),
        bio=user.get("bio"),
        created_at=user["created_at"]
    )


# =====================================================
# PATCH /auth/me - 更新个人资料（昵称、简介）
# =====================================================
@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: ProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    uid = ObjectId(current_user["user_id"])
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        user = await db.users.find_one({"_id": uid})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return UserResponse(
            id=str(user["_id"]),
            email=user["email"],
            username=user["username"],
            role=user["role"],
            is_verified=user["is_verified"],
            avatar_url=user.get("avatar_url"),
            bio=user.get("bio"),
            created_at=user["created_at"]
        )
    if "username" in update_data:
        existing = await db.users.find_one({"username": update_data["username"], "_id": {"$ne": uid}})
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
    await db.users.update_one({"_id": uid}, {"$set": update_data})
    user = await db.users.find_one({"_id": uid})
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        username=user["username"],
        role=user["role"],
        is_verified=user["is_verified"],
        avatar_url=user.get("avatar_url"),
        bio=user.get("bio"),
        created_at=user["created_at"]
    )


# =====================================================
# POST /auth/me/avatar - 上传头像
# =====================================================
@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    import uuid
    from pathlib import Path
    from config import settings

    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        raise HTTPException(status_code=400, detail="Allowed: jpg, png, webp")
    content = await file.read()
    if len(content) > (settings.max_upload_size_mb * 1024 * 1024):
        raise HTTPException(status_code=400, detail=f"Max size {settings.max_upload_size_mb}MB")
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(exist_ok=True)
    name = f"{uuid.uuid4()}.{ext}"
    path = upload_dir / name
    with open(path, "wb") as f:
        f.write(content)
    avatar_url = f"/uploads/{name}"
    db = get_database()
    uid = ObjectId(current_user["user_id"])
    await db.users.update_one({"_id": uid}, {"$set": {"avatar_url": avatar_url}})
    user = await db.users.find_one({"_id": uid})
    return UserResponse(
        id=str(user["_id"]),
        email=user["email"],
        username=user["username"],
        role=user["role"],
        is_verified=user["is_verified"],
        avatar_url=user.get("avatar_url"),
        bio=user.get("bio"),
        created_at=user["created_at"]
    )


# =====================================================
# POST /auth/change-password - 修改密码
# =====================================================
@router.post("/change-password", status_code=status.HTTP_200_OK)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
):
    db = get_database()
    uid = ObjectId(current_user["user_id"])
    user = await db.users.find_one({"_id": uid})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(payload.old_password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="Current password is wrong")
    await db.users.update_one(
        {"_id": uid},
        {"$set": {"hashed_password": hash_password(payload.new_password)}},
    )
    return {"message": "Password updated"}
