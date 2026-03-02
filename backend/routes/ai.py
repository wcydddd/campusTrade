from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from utils.ai_helper import analyze_image, get_categories
from utils.security import get_current_user
from config import settings
import os
import uuid
from pathlib import Path

router = APIRouter(prefix="/ai", tags=["AI"])

# Ensure upload directory exists
UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(exist_ok=True)

# Allowed image formats
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = settings.max_upload_size_mb * 1024 * 1024  # Convert to bytes


@router.post("/analyze")
async def analyze_product_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    AI analyzes product image and generates title, description, category and keywords
    - Only for logged-in users
    - Supports jpg, jpeg, png, webp formats
    - Max file size: 10MB
    """
    
    # Check file format
    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Read file content
    content = await file.read()
    
    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )
    
    # Call AI analysis
    result = await analyze_image(content)
    
    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result["error"]
        )
    
    return {
        "success": True,
        "data": result["data"]
    }


@router.post("/analyze-and-save")
async def analyze_and_save_image(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """
    AI analyzes product image and saves image to server
    Returns AI analysis result + image URL
    """
    
    # Check file format
    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Read file content
    content = await file.read()
    
    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size: {settings.max_upload_size_mb}MB"
        )
    
    # Generate unique filename
    filename = f"{uuid.uuid4()}.{file_ext}"
    filepath = UPLOAD_DIR / filename
    
    # Save file
    with open(filepath, "wb") as f:
        f.write(content)
    
    # Call AI analysis
    result = await analyze_image(content)
    
    if not result["success"]:
        # Remove saved file
        os.remove(filepath)
        raise HTTPException(
            status_code=500,
            detail=result["error"]
        )
    
    return {
        "success": True,
        "data": result["data"],
        "image_url": f"/uploads/{filename}"
    }


@router.get("/categories")
async def list_categories():
    """Get all available product categories"""
    return {
        "categories": get_categories()
    }
