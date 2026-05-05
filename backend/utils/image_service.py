"""
Image service — GridFS-backed storage.
Processes images (strip EXIF, compress, thumbnail) then stores
both the main image and thumbnail in MongoDB GridFS.
Returns URLs of the form /images/{file_id}.
"""

from PIL import Image
import io
import uuid
from bson import ObjectId
from fastapi import UploadFile, HTTPException
from config import settings
from utils.database import get_gridfs_bucket

ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = settings.max_upload_size_mb * 1024 * 1024

THUMBNAIL_SIZE = (300, 300)
COMPRESS_QUALITY = 85
MAX_IMAGE_SIZE = (1920, 1920)

MIME_MAP = {
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
}


def strip_exif(image: Image.Image) -> Image.Image:
    data = list(image.getdata())
    image_without_exif = Image.new(image.mode, image.size)
    image_without_exif.putdata(data)
    return image_without_exif


def compress_image(image: Image.Image, max_size: tuple = MAX_IMAGE_SIZE) -> Image.Image:
    if image.width <= max_size[0] and image.height <= max_size[1]:
        return image
    ratio = min(max_size[0] / image.width, max_size[1] / image.height)
    new_size = (int(image.width * ratio), int(image.height * ratio))
    return image.resize(new_size, Image.Resampling.LANCZOS)


def generate_thumbnail(image: Image.Image, size: tuple = THUMBNAIL_SIZE) -> Image.Image:
    thumb = image.copy()
    thumb.thumbnail(size, Image.Resampling.LANCZOS)
    return thumb


def save_image_to_bytes(
    image: Image.Image, fmt: str = "JPEG", quality: int = COMPRESS_QUALITY
) -> bytes:
    buffer = io.BytesIO()
    if fmt.upper() == "PNG":
        image.save(buffer, format=fmt, optimize=True)
    else:
        if image.mode == "RGBA":
            image = image.convert("RGB")
        image.save(buffer, format=fmt, quality=quality, optimize=True)
    buffer.seek(0)
    return buffer.getvalue()


def _validate_extension(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Allowed: %s" % ", ".join(ALLOWED_EXTENSIONS),
        )
    return ext


def _validate_size(content: bytes) -> None:
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File too large. Maximum size: %dMB" % settings.max_upload_size_mb,
        )


async def _upload_to_gridfs(data: bytes, filename: str, content_type: str) -> str:
    """Upload bytes to GridFS and return the string file_id."""
    bucket = get_gridfs_bucket()
    file_id = await bucket.upload_from_stream(
        filename,
        io.BytesIO(data),
        metadata={"content_type": content_type},
    )
    return str(file_id)


async def process_and_save_image(file: UploadFile) -> dict:
    """
    Full pipeline: validate → strip EXIF → compress → thumbnail → save to GridFS.
    Returns: {"image_url": "/images/{id}", "thumb_url": "/images/{id}"}
    """
    filename = file.filename or "image.jpg"
    ext = _validate_extension(filename)

    content = await file.read()
    _validate_size(content)

    try:
        image = Image.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid image file: %s" % str(e))

    image = strip_exif(image)
    image = compress_image(image)
    thumbnail = generate_thumbnail(image)

    save_format = "JPEG" if ext in ("jpg", "jpeg") else ext.upper()
    save_ext = "jpg" if save_format == "JPEG" else ext
    content_type = MIME_MAP.get(save_ext, "application/octet-stream")
    unique_name = "%s.%s" % (uuid.uuid4(), save_ext)

    image_bytes = save_image_to_bytes(image, save_format)
    image_id = await _upload_to_gridfs(image_bytes, unique_name, content_type)

    thumb_bytes = save_image_to_bytes(thumbnail, save_format)
    thumb_name = "thumb_%s" % unique_name
    thumb_id = await _upload_to_gridfs(thumb_bytes, thumb_name, content_type)

    return {
        "image_url": "/images/%s" % image_id,
        "thumb_url": "/images/%s" % thumb_id,
    }


def process_image_bytes(content: bytes, filename: str = "image.jpg") -> dict:
    """
    Synchronous image processing for AI workflow.
    Validates, processes, but does NOT save — returns processed bytes
    and metadata for the caller to upload via GridFS asynchronously.
    """
    ext = _validate_extension(filename)
    _validate_size(content)

    try:
        image = Image.open(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid image file: %s" % str(e))

    image = strip_exif(image)
    image = compress_image(image)
    thumbnail = generate_thumbnail(image)

    save_format = "JPEG" if ext in ("jpg", "jpeg") else ext.upper()
    save_ext = "jpg" if save_format == "JPEG" else ext
    content_type = MIME_MAP.get(save_ext, "application/octet-stream")
    unique_name = "%s.%s" % (uuid.uuid4(), save_ext)

    image_bytes = save_image_to_bytes(image, save_format)
    thumb_bytes = save_image_to_bytes(thumbnail, save_format)

    return {
        "image_bytes": image_bytes,
        "thumb_bytes": thumb_bytes,
        "filename": unique_name,
        "thumb_filename": "thumb_%s" % unique_name,
        "content_type": content_type,
        "content": image_bytes,
    }


async def save_processed_to_gridfs(processed: dict) -> dict:
    """Upload pre-processed image + thumbnail bytes to GridFS."""
    image_id = await _upload_to_gridfs(
        processed["image_bytes"], processed["filename"], processed["content_type"]
    )
    thumb_id = await _upload_to_gridfs(
        processed["thumb_bytes"], processed["thumb_filename"], processed["content_type"]
    )
    return {
        "image_url": "/images/%s" % image_id,
        "thumb_url": "/images/%s" % thumb_id,
    }


async def delete_image(image_url: str) -> None:
    """Delete an image (and its thumbnail) from GridFS by URL."""
    if not image_url:
        return
    file_id_str = image_url.rsplit("/", 1)[-1]
    try:
        file_id = ObjectId(file_id_str)
    except Exception:
        return
    bucket = get_gridfs_bucket()
    try:
        await bucket.delete(file_id)
    except Exception:
        pass


async def upload_raw_to_gridfs(content: bytes, filename: str, content_type: str) -> str:
    """Upload raw bytes to GridFS without image processing. Returns /images/{id} URL."""
    _validate_size(content)
    file_id = await _upload_to_gridfs(content, filename, content_type)
    return "/images/%s" % file_id
