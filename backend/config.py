from pydantic_settings import BaseSettings
from pathlib import Path
from dotenv import load_dotenv
import os

# 获取项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

# 强制加载 .env 文件
load_dotenv(ENV_FILE)

print(f"[config] .env path: {ENV_FILE}, exists: {ENV_FILE.exists()}")

class Settings(BaseSettings):
    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017/campustrade"
    
    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080
    
    # OpenAI
    openai_api_key: str = ""  # ← 从 .env 读取
    
    # Email
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    
    # App Settings
    allowed_email_domains: str = "@liverpool.ac.uk,@university.edu,@student.ac.uk"
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 10
    
    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"
        case_sensitive = False
        extra = "ignore"

settings = Settings()
print("[config] Settings loaded successfully")