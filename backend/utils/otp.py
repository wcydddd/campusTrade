import hashlib
import secrets

def generate_numeric_code(length: int = 6) -> str:
    """生成 6 位数字验证码"""
    return ''.join([str(secrets.randbelow(10)) for _ in range(length)])

def hash_code(email: str, code: str) -> str:
    """将验证码与邮箱一起 hash，防止彩虹表攻击"""
    data = f"{email.lower()}:{code}"
    return hashlib.sha256(data.encode()).hexdigest()