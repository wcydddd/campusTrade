"""
核心工具函数的 unit test。
覆盖 utils/security.py 与 utils/otp.py——是整个项目的认证基石。

不走 HTTP、不碰 DB。直接调函数验证行为。
"""
import pytest
from datetime import timedelta
from fastapi import HTTPException

from utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    is_valid_university_email,
)
from utils.otp import generate_numeric_code, hash_code


# =====================================================
# is_valid_university_email
# =====================================================
class TestUniversityEmail:
    def test_accepts_university_edu(self):
        assert is_valid_university_email("alice@university.edu") is True

    def test_accepts_student_ac_uk(self):
        assert is_valid_university_email("bob@student.ac.uk") is True

    def test_rejects_gmail(self):
        assert is_valid_university_email("hacker@gmail.com") is False

    def test_rejects_yahoo(self):
        assert is_valid_university_email("x@yahoo.com") is False

    def test_rejects_email_with_university_in_local_part(self):
        """学校域名必须在 @ 之后；伪造在 @ 之前应被拒。"""
        assert is_valid_university_email(
            "fake-university.edu@gmail.com"
        ) is False


# =====================================================
# hash_password / verify_password
# =====================================================
class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        h = hash_password("mypassword")
        assert h != "mypassword"
        assert "mypassword" not in h
        assert len(h) > 30  # bcrypt hash 通常 ~60 字符

    def test_hash_is_random_each_time(self):
        """同一密码每次 hash 应不同（盐随机），防 rainbow table。"""
        h1 = hash_password("samepw")
        h2 = hash_password("samepw")
        assert h1 != h2

    def test_verify_correct_password_returns_true(self):
        h = hash_password("correctpw")
        assert verify_password("correctpw", h) is True

    def test_verify_wrong_password_returns_false(self):
        h = hash_password("correctpw")
        assert verify_password("wrongpw", h) is False

    def test_password_too_long_raises_400(self):
        """bcrypt 有 72 字节硬限制，超长应主动 400 而非 500。"""
        with pytest.raises(HTTPException) as exc:
            hash_password("x" * 100)
        assert exc.value.status_code == 400

    def test_password_at_72_bytes_works(self):
        """正好 72 字节应成功 hash。"""
        pw = "x" * 72
        h = hash_password(pw)
        assert verify_password(pw, h) is True


# =====================================================
# JWT (create_access_token / decode_token)
# =====================================================
class TestJWT:
    def test_token_round_trip(self):
        token = create_access_token({"sub": "user-123", "email": "a@u.edu"})
        payload = decode_token(token)
        assert payload["sub"] == "user-123"
        assert payload["email"] == "a@u.edu"
        assert "exp" in payload

    def test_decode_invalid_token_raises_401(self):
        with pytest.raises(HTTPException) as exc:
            decode_token("not-a-real-jwt")
        assert exc.value.status_code == 401

    def test_decode_tampered_token_raises_401(self):
        """改 token 中间字符应破坏签名（避免改最后字符可能正好是合法 base64 padding 的情况）。"""
        token = create_access_token({"sub": "x"})
        mid = len(token) // 2
        tampered = (
            token[:mid]
            + ("a" if token[mid] != "a" else "b")
            + token[mid + 1:]
        )
        with pytest.raises(HTTPException):
            decode_token(tampered)

    def test_expired_token_raises_401(self):
        """过期 token 应被拒绝。"""
        token = create_access_token(
            {"sub": "x"},
            expires_delta=timedelta(seconds=-1),
        )
        with pytest.raises(HTTPException) as exc:
            decode_token(token)
        assert exc.value.status_code == 401


# =====================================================
# OTP utilities
# =====================================================
class TestGenerateNumericCode:
    def test_default_length_6(self):
        code = generate_numeric_code(6)
        assert len(code) == 6
        assert code.isdigit()

    def test_custom_length(self):
        assert len(generate_numeric_code(4)) == 4
        assert len(generate_numeric_code(8)) == 8

    def test_codes_are_random(self):
        """连续生成 20 个码应至少有几种不同（理论概率检查）。"""
        codes = {generate_numeric_code(6) for _ in range(20)}
        assert len(codes) > 5


class TestHashCode:
    def test_hash_is_deterministic(self):
        """同 email + 同 code 应产生同 hash（用于比对）。"""
        h1 = hash_code("a@u.edu", "123456")
        h2 = hash_code("a@u.edu", "123456")
        assert h1 == h2

    def test_different_emails_produce_different_hashes(self):
        """不同 email 即使同 code 也应不同 hash（防跨账号攻击）。"""
        h1 = hash_code("a@u.edu", "123456")
        h2 = hash_code("b@u.edu", "123456")
        assert h1 != h2

    def test_different_codes_produce_different_hashes(self):
        h1 = hash_code("a@u.edu", "123456")
        h2 = hash_code("a@u.edu", "654321")
        assert h1 != h2

    def test_hash_does_not_contain_plaintext_code(self):
        """hash 中不应能直接看到原始 code（防泄漏）。"""
        h = hash_code("a@u.edu", "123456")
        assert "123456" not in h

    def test_hash_does_not_contain_plaintext_email(self):
        h = hash_code("alice@u.edu", "123456")
        assert "alice@u.edu" not in h
