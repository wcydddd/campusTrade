from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from bson import ObjectId
from gridfs.errors import NoFile

from utils.database import get_gridfs_bucket

router = APIRouter(prefix="/images", tags=["Images"])


@router.get("/{image_id}")
async def get_image(image_id: str):
    """Stream an image from GridFS by its ObjectId."""
    try:
        file_id = ObjectId(image_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image id")

    bucket = get_gridfs_bucket()

    try:
        grid_out = await bucket.open_download_stream(file_id)
    except NoFile:
        raise HTTPException(status_code=404, detail="Image not found")

    content_type = "application/octet-stream"
    if grid_out.metadata and "content_type" in grid_out.metadata:
        content_type = grid_out.metadata["content_type"]
    elif grid_out.filename:
        ext = grid_out.filename.rsplit(".", 1)[-1].lower() if "." in grid_out.filename else ""
        mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
        content_type = mime.get(ext, content_type)

    async def stream_chunks():
        while True:
            chunk = await grid_out.read(64 * 1024)
            if not chunk:
                break
            yield chunk

    return StreamingResponse(
        stream_chunks(),
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )
