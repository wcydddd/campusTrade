"""
图片处理服务
功能：
1. 保存原图
2. 生成缩略图（列表用）
3. 去除 EXIF 信息（保护隐私）
4. 压缩图片（减小流量）
"""

from PIL import Image
import io
import uuid
from pathlib import Path
from fastapi import UploadFile, HTTPException
from config import settings

# 上传目录配置
UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(exist_ok=True)

# 缩略图目录
THUMB_DIR = UPLOAD_DIR / "thumbnails"
THUMB_DIR.mkdir(exist_ok=True)

# 允许的图片格式
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = settings.max_upload_size_mb * 1024 * 1024

# 图片处理配置
THUMBNAIL_SIZE = (300, 300)  # 缩略图尺寸
COMPRESS_QUALITY = 85  # 压缩质量 (1-100)
MAX_IMAGE_SIZE = (1920, 1920)  # 原图最大尺寸


def strip_exif(image: Image.Image) -> Image.Image:
    """
    去除图片的 EXIF 信息（保护隐私）
    EXIF 可能包含：GPS 位置、设备信息、拍摄时间等
    """
    data = list(image.getdata())
    image_without_exif = Image.new(image.mode, image.size)
    image_without_exif.putdata(data)
    return image_without_exif


def compress_image(image: Image.Image, max_size: tuple = MAX_IMAGE_SIZE) -> Image.Image:
    """压缩图片尺寸，保持宽高比"""
    if image.width <= max_size[0] and image.height <= max_size[1]:
        return image
    ratio = min(max_size[0] / image.width, max_size[1] / image.height)
    new_size = (int(image.width * ratio), int(image.height * ratio))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def generate_thumbnail(image: Image.Image, size: tuple = THUMBNAIL_SIZE) -> Image.Image:
    """生成缩略图，保持宽高比"""
    thumb = image.copy()
    thumb.thumbnail(size, Image.Resampling.LANCZOS)
    return thumb


def save_image_to_bytes(image: Image.Image, format: str = "JPEG", quality: int = COMPRESS_QUALITY) -> bytes:
    """将 PIL Image 转换为 bytes"""
    buffer = io.BytesIO()
    if format.upper() == "PNG":
        image.save(buffer, format=format, optimize=True)
    else:
        if image.mode == "RGBA":
            image = image.convert("RGB")
        image.save(buffer, format=format, quality=quality, optimize=True)
    buffer.seek(0)
    return buffer.getvalue()


async def process_and_save_image(file: UploadFile) -> dict:
    """
    完整的图片处理流程：验证、去 EXIF、压缩、生成缩略图、保存
    返回: image_url, thumb_url, original_size, file_size, thumb_size
    """
    filename = file.filename or "image.jpg"
    file_ext = filename.split(".")[-1].lower()

    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )

    try:
        image = Image.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    original_size = image.size
    image = strip_exif(image)
    image = compress_image(image)
    thumbnail = generate_thumbnail(image)

    save_format = "JPEG" if file_ext in ["jpg", "jpeg"] else file_ext.upper()
    if save_format == "WEBP":
        save_format = "WEBP"

    unique_id = str(uuid.uuid4())
    save_ext = "jpg" if save_format == "JPEG" else file_ext
    image_filename = f"{unique_id}.{save_ext}"
    thumb_filename = f"{unique_id}.{save_ext}"

    image_path = UPLOAD_DIR / image_filename
    image_bytes = save_image_to_bytes(image, save_format)
    with open(image_path, "wb") as f:
        f.write(image_bytes)

    thumb_path = THUMB_DIR / thumb_filename
    thumb_bytes = save_image_to_bytes(thumbnail, save_format)
    with open(thumb_path, "wb") as f:
        f.write(thumb_bytes)

    return {
        "image_url": f"/uploads/{image_filename}",
        "thumb_url": f"/uploads/thumbnails/{thumb_filename}",
        "original_size": original_size,
        "processed_size": image.size,
        "file_size": len(image_bytes),
        "thumb_size": len(thumb_bytes)
    }


async def process_image_bytes(content: bytes, filename: str = "image.jpg") -> dict:
    """
    处理已读取的图片字节，用于已读取文件内容的情况
    返回包含 content 字段，可供 AI 分析使用
    """
    file_ext = filename.split(".")[-1].lower()

    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )

    try:
        image = Image.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image file: {str(e)}")

    original_size = image.size
    image = strip_exif(image)
    image = compress_image(image)
    thumbnail = generate_thumbnail(image)

    save_format = "JPEG" if file_ext in ["jpg", "jpeg"] else file_ext.upper()
    unique_id = str(uuid.uuid4())
    save_ext = "jpg" if save_format == "JPEG" else file_ext
    image_filename = f"{unique_id}.{save_ext}"
    thumb_filename = f"{unique_id}.{save_ext}"

    image_path = UPLOAD_DIR / image_filename
    image_bytes = save_image_to_bytes(image, save_format)
    with open(image_path, "wb") as f:
        f.write(image_bytes)

    thumb_path = THUMB_DIR / thumb_filename
    thumb_bytes = save_image_to_bytes(thumbnail, save_format)
    with open(thumb_path, "wb") as f:
        f.write(thumb_bytes)

    return {
        "image_url": f"/uploads/{image_filename}",
        "thumb_url": f"/uploads/thumbnails/{thumb_filename}",
        "original_size": original_size,
        "processed_size": image.size,
        "file_size": len(image_bytes),
        "thumb_size": len(thumb_bytes),
        "content": image_bytes  # 用于 AI 分析
    }


def delete_image(image_url: str):
    """删除图片及其缩略图"""
    if not image_url:
        return
    filename = image_url.split("/")[-1]
    image_path = UPLOAD_DIR / filename
    if image_path.exists():
        image_path.unlink()
    thumb_path = THUMB_DIR / filename
    if thumb_path.exists():
        thumb_path.unlink()


def get_image_info(image_url: str) -> dict:
    """获取图片信息"""
    if not image_url:
        return None
    filename = image_url.split("/")[-1]
    image_path = UPLOAD_DIR / filename
    if not image_path.exists():
        return None
    try:
        with Image.open(image_path) as img:
            return {
                "filename": filename,
                "size": img.size,
                "format": img.format,
                "mode": img.mode,
                "file_size": image_path.stat().st_size
            }
    except Exception:
        return None
