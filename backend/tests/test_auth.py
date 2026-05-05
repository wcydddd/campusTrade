"""
auth 路由测试骨架。
每个接口至少配 1 条 happy path + 1 条失败用例，后续按需补边界。

提示：
  - `client` 已用内存 MongoDB，不会污染开发库
  - `make_user` 直接插库，省去走完整的注册+验证流程
  - `auth_headers(user)` 生成带 Bearer token 的请求头
"""
import pytest


# =====================================================
# POST /auth/register
# =====================================================
class TestRegister:
    async def test_register_success(self, client):
        resp = await client.post(
            "/auth/register",
            json={
                "email": "newuser@university.edu",
                "username": "newuser",
                "password": "Password123!",
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["email"] == "newuser@university.edu"
        assert body["is_verified"] is False
        assert "id" in body

    async def test_register_rejects_non_university_email(self, client):
        resp = await client.post(
            "/auth/register",
            json={
                "email": "hacker@gmail.com",
                "username": "hacker",
                "password": "Password123!",
            },
        )
        assert resp.status_code == 400
        assert "university" in resp.json()["detail"].lower()

    async def test_register_duplicate_verified_email_fails(self, client, verified_user):
        resp = await client.post(
            "/auth/register",
            json={
                "email": verified_user["email"],
                "username": "different_name",
                "password": "Password123!",
            },
        )
        assert resp.status_code == 400

    async def test_register_duplicate_username_fails(self, client, verified_user):
        resp = await client.post(
            "/auth/register",
            json={
                "email": "another@university.edu",
                "username": verified_user["username"],  # 用名冲突
                "password": "Password123!",
            },
        )
        assert resp.status_code == 400


# =====================================================
# POST /auth/send-verification-code
# =====================================================
class TestSendVerificationCode:
    async def test_send_code_for_unverified_user_succeeds(self, client, unverified_user):
        resp = await client.post(
            "/auth/send-verification-code",
            json={"email": unverified_user["email"]},
        )
        assert resp.status_code == 200

    async def test_send_code_for_unknown_email_returns_404(self, client):
        resp = await client.post(
            "/auth/send-verification-code",
            json={"email": "ghost@university.edu"},
        )
        assert resp.status_code == 404

    async def test_send_code_for_already_verified_returns_message(self, client, verified_user):
        resp = await client.post(
            "/auth/send-verification-code",
            json={"email": verified_user["email"]},
        )
        assert resp.status_code == 200
        assert "already verified" in resp.json()["message"].lower()


# =====================================================
# POST /auth/verify-email
# =====================================================
class TestVerifyEmail:
    async def test_verify_email_success(self, client, db, unverified_user):
        # 先插一条已知验证码的记录（用 hash_code 计算）
        from utils.otp import hash_code
        from datetime import datetime, timezone, timedelta

        code = "123456"
        await db.email_verifications.insert_one({
            "email": unverified_user["email"],
            "code_hash": hash_code(unverified_user["email"], code),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
            "attempts": 0,
            "last_sent_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })

        resp = await client.post(
            "/auth/verify-email",
            json={"email": unverified_user["email"], "code": code},
        )
        assert resp.status_code == 200

        # 用户应被标记为已验证
        user_after = await db.users.find_one({"email": unverified_user["email"]})
        assert user_after["is_verified"] is True

    async def test_verify_email_wrong_code_fails(self, client, db, unverified_user):
        from utils.otp import hash_code
        from datetime import datetime, timezone, timedelta

        await db.email_verifications.insert_one({
            "email": unverified_user["email"],
            "code_hash": hash_code(unverified_user["email"], "123456"),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
            "attempts": 0,
            "last_sent_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })

        resp = await client.post(
            "/auth/verify-email",
            json={"email": unverified_user["email"], "code": "999999"},
        )
        assert resp.status_code == 400

    async def test_verify_email_invalid_format(self, client, unverified_user):
        resp = await client.post(
            "/auth/verify-email",
            json={"email": unverified_user["email"], "code": "abc"},
        )
        assert resp.status_code == 400


# =====================================================
# POST /auth/login
# =====================================================
class TestLogin:
    async def test_login_success(self, client, verified_user):
        resp = await client.post(
            "/auth/login",
            json={
                "email": verified_user["email"],
                "password": verified_user["password_plain"],
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "access_token" in body
        assert body["user"]["email"] == verified_user["email"]

    async def test_login_wrong_password(self, client, verified_user):
        resp = await client.post(
            "/auth/login",
            json={"email": verified_user["email"], "password": "wrong"},
        )
        assert resp.status_code == 401

    async def test_login_unverified_email_rejected(self, client, unverified_user):
        resp = await client.post(
            "/auth/login",
            json={
                "email": unverified_user["email"],
                "password": unverified_user["password_plain"],
            },
        )
        assert resp.status_code == 403

    async def test_login_unknown_email(self, client):
        resp = await client.post(
            "/auth/login",
            json={"email": "ghost@university.edu", "password": "whatever"},
        )
        assert resp.status_code == 401

    async def test_login_banned_account(self, client, make_user):
        banned = await make_user(
            email="banned@university.edu",
            username="banned",
            banned=True,
        )
        resp = await client.post(
            "/auth/login",
            json={"email": banned["email"], "password": banned["password_plain"]},
        )
        assert resp.status_code == 403


# =====================================================
# GET /auth/me
# =====================================================
class TestGetMe:
    async def test_get_me_with_valid_token(self, client, verified_user, auth_headers):
        resp = await client.get("/auth/me", headers=auth_headers(verified_user))
        assert resp.status_code == 200
        assert resp.json()["email"] == verified_user["email"]

    async def test_get_me_without_token_returns_401_or_403(self, client):
        resp = await client.get("/auth/me")
        # FastAPI HTTPBearer 默认返回 403
        assert resp.status_code in (401, 403)

    async def test_get_me_with_bad_token(self, client):
        resp = await client.get(
            "/auth/me", headers={"Authorization": "Bearer not-a-real-token"}
        )
        assert resp.status_code == 401


# =====================================================
# PATCH /auth/me
# =====================================================
class TestUpdateMe:
    async def test_update_username(self, client, verified_user, auth_headers):
        resp = await client.patch(
            "/auth/me",
            headers=auth_headers(verified_user),
            json={"username": "renamed"},
        )
        assert resp.status_code == 200
        assert resp.json()["username"] == "renamed"

    async def test_update_username_conflict(
        self, client, verified_user, admin_user, auth_headers
    ):
        # 改成已经被 admin 占用的名字
        resp = await client.patch(
            "/auth/me",
            headers=auth_headers(verified_user),
            json={"username": admin_user["username"]},
        )
        assert resp.status_code == 400


# =====================================================
# POST /auth/change-password
# =====================================================
class TestChangePassword:
    async def test_change_password_success(self, client, verified_user, auth_headers):
        resp = await client.post(
            "/auth/change-password",
            headers=auth_headers(verified_user),
            json={
                "old_password": verified_user["password_plain"],
                "new_password": "NewPassword456!",
            },
        )
        assert resp.status_code == 200

        # 用新密码登录应当成功
        login_resp = await client.post(
            "/auth/login",
            json={"email": verified_user["email"], "password": "NewPassword456!"},
        )
        assert login_resp.status_code == 200

    async def test_change_password_wrong_old(self, client, verified_user, auth_headers):
        resp = await client.post(
            "/auth/change-password",
            headers=auth_headers(verified_user),
            json={"old_password": "wrong-old", "new_password": "NewPassword456!"},
        )
        assert resp.status_code == 400


# =====================================================
# GET /auth/public/{user_id}
# =====================================================
class TestPublicUser:
    async def test_public_user_success(self, client, verified_user):
        resp = await client.get(f"/auth/public/{verified_user['id']}")
        assert resp.status_code == 200
        assert resp.json()["username"] == verified_user["username"]

    async def test_public_user_invalid_id(self, client):
        resp = await client.get("/auth/public/not-an-objectid")
        assert resp.status_code == 400

    async def test_public_user_not_found(self, client):
        from bson import ObjectId
        resp = await client.get(f"/auth/public/{ObjectId()}")
        assert resp.status_code == 404


# =====================================================
# POST /auth/forgot-password & /auth/reset-password
# =====================================================
class TestPasswordReset:
    async def test_forgot_password_always_returns_200(self, client, verified_user):
        resp = await client.post(
            "/auth/forgot-password",
            json={"email": verified_user["email"]},
        )
        assert resp.status_code == 200

    async def test_forgot_password_unknown_email_also_200(self, client):
        # 防止邮箱枚举：不存在的邮箱也返回 200
        resp = await client.post(
            "/auth/forgot-password",
            json={"email": "ghost@university.edu"},
        )
        assert resp.status_code == 200

    async def test_forgot_password_cooldown_silently_skips_resend(
        self, client, db, verified_user
    ):
        """
        60 秒内重复请求 forgot-password 应被静默跳过（不重复发邮件、不暴露状态）。
        验证方式：第一次请求后 DB 中应有 password_resets 记录；
        紧接着第二次请求（在冷却窗口内），DB 中记录的 token_hash 应保持不变
        （证明没生成新 token / 没重发邮件）。
        """
        # 第一次请求 → 生成 reset token
        r1 = await client.post(
            "/auth/forgot-password",
            json={"email": verified_user["email"]},
        )
        assert r1.status_code == 200

        first = await db.password_resets.find_one({"email": verified_user["email"]})
        assert first is not None
        first_hash = first["token_hash"]
        first_created = first["created_at"]

        # 立刻第二次请求（远早于 60s 冷却结束）
        r2 = await client.post(
            "/auth/forgot-password",
            json={"email": verified_user["email"]},
        )
        assert r2.status_code == 200

        # DB 中的 token 应未变（冷却生效，没生成新 token）
        second = await db.password_resets.find_one({"email": verified_user["email"]})
        assert second["token_hash"] == first_hash
        assert second["created_at"] == first_created

    async def test_reset_password_with_valid_token(self, client, db, verified_user):
        from datetime import datetime, timezone, timedelta
        import secrets, hashlib

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        await db.password_resets.insert_one({
            "email": verified_user["email"],
            "token_hash": token_hash,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
            "used": False,
            "created_at": datetime.now(timezone.utc),
        })

        resp = await client.post(
            "/auth/reset-password",
            json={"token": raw_token, "new_password": "BrandNewPwd789!"},
        )
        assert resp.status_code == 200

        # 用新密码登录应能成功
        login_resp = await client.post(
            "/auth/login",
            json={"email": verified_user["email"], "password": "BrandNewPwd789!"},
        )
        assert login_resp.status_code == 200

    async def test_reset_password_invalid_token(self, client):
        resp = await client.post(
            "/auth/reset-password",
            json={"token": "totally-fake", "new_password": "Whatever123!"},
        )
        assert resp.status_code == 400

    async def test_reset_password_expired_token(self, client, db, verified_user):
        """已过期的 token 应被拒绝。"""
        from datetime import datetime, timezone, timedelta
        import secrets, hashlib

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        await db.password_resets.insert_one({
            "email": verified_user["email"],
            "token_hash": token_hash,
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=1),  # 已过期
            "used": False,
            "created_at": datetime.now(timezone.utc) - timedelta(hours=1),
        })
        resp = await client.post(
            "/auth/reset-password",
            json={"token": raw_token, "new_password": "Whatever123!"},
        )
        assert resp.status_code == 400
        assert "expired" in resp.json()["detail"].lower()

    async def test_reset_password_already_used_token(
        self, client, db, verified_user
    ):
        """单次使用约束：已用过的 token 不能再用。"""
        from datetime import datetime, timezone, timedelta
        import secrets, hashlib

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        await db.password_resets.insert_one({
            "email": verified_user["email"],
            "token_hash": token_hash,
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=30),
            "used": True,  # 已使用
            "created_at": datetime.now(timezone.utc),
        })
        resp = await client.post(
            "/auth/reset-password",
            json={"token": raw_token, "new_password": "Whatever123!"},
        )
        assert resp.status_code == 400
        assert "already" in resp.json()["detail"].lower()


# =====================================================
# 验证码（OTP）边界
# =====================================================
class TestOTPEdgeCases:
    async def test_verify_email_expired_code(self, client, db, unverified_user):
        """超过 10 分钟有效期的验证码应被拒绝。"""
        from utils.otp import hash_code
        from datetime import datetime, timezone, timedelta

        code = "123456"
        await db.email_verifications.insert_one({
            "email": unverified_user["email"],
            "code_hash": hash_code(unverified_user["email"], code),
            "expires_at": datetime.now(timezone.utc) - timedelta(minutes=1),
            "attempts": 0,
            "last_sent_at": datetime.now(timezone.utc) - timedelta(minutes=15),
            "created_at": datetime.now(timezone.utc) - timedelta(minutes=15),
        })

        resp = await client.post(
            "/auth/verify-email",
            json={"email": unverified_user["email"], "code": code},
        )
        assert resp.status_code == 400
        assert "expired" in resp.json()["detail"].lower()

    async def test_verify_email_too_many_attempts(
        self, client, db, unverified_user
    ):
        """同一验证码尝试错误超过 5 次后应锁定（429）。"""
        from utils.otp import hash_code
        from datetime import datetime, timezone, timedelta

        code = "123456"
        await db.email_verifications.insert_one({
            "email": unverified_user["email"],
            "code_hash": hash_code(unverified_user["email"], code),
            "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10),
            "attempts": 5,  # 已达上限
            "last_sent_at": datetime.now(timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })

        resp = await client.post(
            "/auth/verify-email",
            json={"email": unverified_user["email"], "code": code},
        )
        assert resp.status_code == 429


# =====================================================
# 登录锁定（连续失败）
# =====================================================
class TestLoginLockout:
    async def test_account_locks_after_max_failures(
        self, client, db, verified_user
    ):
        """连续 5 次密码错误后，下次登录（即使密码对）也应被锁定。"""
        # 直接预置失败计数到上限
        from datetime import datetime, timezone

        await db.login_attempts.insert_one({
            "email": verified_user["email"],
            "failures": 5,
            "last_failure_at": datetime.now(timezone.utc),
            "last_ip": "127.0.0.1",
            "created_at": datetime.now(timezone.utc),
        })

        resp = await client.post(
            "/auth/login",
            json={
                "email": verified_user["email"],
                "password": verified_user["password_plain"],  # 即使密码正确
            },
        )
        assert resp.status_code == 429
        assert "locked" in resp.json()["detail"].lower()


# =====================================================
# POST /auth/me/avatar
# =====================================================
class TestUploadAvatar:
    async def test_upload_avatar_success(
        self, client, verified_user, auth_headers
    ):
        from io import BytesIO
        fake_img = BytesIO(b"fakepngbytes")
        resp = await client.post(
            "/auth/me/avatar",
            headers=auth_headers(verified_user),
            files={"file": ("me.png", fake_img, "image/png")},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["avatar_url"] is not None
        assert body["avatar_url"].startswith("/avatars/")

    async def test_upload_avatar_invalid_extension(
        self, client, verified_user, auth_headers
    ):
        from io import BytesIO
        fake_file = BytesIO(b"not a real gif")
        resp = await client.post(
            "/auth/me/avatar",
            headers=auth_headers(verified_user),
            files={"file": ("me.gif", fake_file, "image/gif")},
        )
        assert resp.status_code == 400
        assert "allowed" in resp.json()["detail"].lower()

    async def test_upload_avatar_too_large(
        self, client, verified_user, auth_headers
    ):
        """超过 max_upload_size_mb 的文件应返回 413。"""
        from io import BytesIO
        from config import settings
        # 构造一个超过上限的字节流
        oversize = b"x" * (settings.max_upload_size_mb * 1024 * 1024 + 1)
        resp = await client.post(
            "/auth/me/avatar",
            headers=auth_headers(verified_user),
            files={"file": ("big.png", BytesIO(oversize), "image/png")},
        )
        assert resp.status_code == 413

    async def test_upload_avatar_requires_auth(self, client):
        from io import BytesIO
        resp = await client.post(
            "/auth/me/avatar",
            files={"file": ("me.png", BytesIO(b"x"), "image/png")},
        )
        assert resp.status_code in (401, 403)
