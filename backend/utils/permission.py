from fastapi import Depends, HTTPException, status
from bson import ObjectId

from utils.security import get_current_user
from utils.database import get_database

async def require_verified_user(current_user: dict = Depends(get_current_user)) -> dict:
    """
    用在：发布商品/修改/删除、聊天发消息等“敏感操作”
    - 未验证邮箱：直接 403
    """
    db = get_database()

    user = await db.users.find_one({"_id": ObjectId(current_user["user_id"])})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.get("is_verified") is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email to use this feature."
        )

    return current_user
