from fastapi import APIRouter, HTTPException, Depends, status, Query, UploadFile, File, Form
from typing import List, Optional
from bson import ObjectId
from datetime import datetime
from pathlib import Path

from utils.database import get_database
from utils.security import get_current_user, get_optional_user
from utils.ai_helper import analyze_image, get_categories
from utils.image_service import process_and_save_image, process_image_bytes, delete_image
from models.product import ProductCreate, ProductResponse, ProductInDB, ProductStatus
from config import settings

router = APIRouter(prefix="/products", tags=["Products"])

UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(exist_ok=True)
ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
MAX_FILE_SIZE = settings.max_upload_size_mb * 1024 * 1024


# =====================================================
# Utility functions
# =====================================================

def _to_response(doc: dict, is_favorited: bool = None) -> ProductResponse:
    """Convert a MongoDB document to a response model."""
    return ProductResponse(
        id=str(doc["_id"]),
        seller_id=str(doc["seller_id"]),
        title=doc["title"],
        description=doc["description"],
        price=doc["price"],
        category=doc["category"],
        condition=doc["condition"],
        sustainable=doc.get("sustainable", False),
        images=doc.get("images", []),
        status=doc.get("status", "available"),
        views=doc.get("views", 0),
        created_at=doc.get("created_at"),
        updated_at=doc.get("updated_at"),
        thumb_url=doc.get("thumb_url"),
        is_favorited=is_favorited,
    )


async def get_verified_user(current_user: dict, db):
    """Get the current user and ensure they are verified and not banned."""
    try:
        uid = ObjectId(current_user["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    user = await db.users.find_one({"_id": uid})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("banned"):
        raise HTTPException(status_code=403, detail="Account is banned. You cannot perform this action.")
    if not user.get("is_verified", False):
        raise HTTPException(status_code=403, detail="User not verified. Please verify your email first.")

    return user, uid


# =====================================================
# GET /products - List products (public)
# =====================================================

@router.get("", response_model=List[ProductResponse])
async def list_products(
    sustainable: Optional[bool] = Query(default=None, description="Filter by sustainable"),
    category: Optional[str] = Query(default=None, description="Filter by category"),
    min_price: Optional[float] = Query(default=None, description="Minimum price"),
    max_price: Optional[float] = Query(default=None, description="Maximum price"),
    search: Optional[str] = Query(default=None, description="Search in title/description"),
    include_sold: bool = Query(default=False, description="Include sold products (default: exclude)"),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """List products with optional filters. Sold products excluded by default."""
    db = get_database()

    query = {"status": {"$nin": ["removed", "pending", "rejected"]}}
    if not include_sold:
        query["status"] = {"$nin": ["sold", "removed", "pending", "rejected"]}
    
    if sustainable is not None:
        query["sustainable"] = sustainable
    
    if category:
        query["category"] = category
    
    if min_price is not None or max_price is not None:
        query["price"] = {}
        if min_price is not None:
            query["price"]["$gte"] = min_price
        if max_price is not None:
            query["price"]["$lte"] = max_price
        if not query["price"]:
            del query["price"]
    
    if search:
        query["$or"] = [
            {"title": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
        ]

    docs = await db.products.find(query).sort("created_at", -1).to_list(length=200)

    fav_set = set()
    if current_user:
        try:
            uid = ObjectId(current_user["user_id"])
            product_ids = [d["_id"] for d in docs]
            if product_ids:
                fav_docs = await db.favorites.find(
                    {"user_id": uid, "product_id": {"$in": product_ids}}
                ).to_list(length=len(product_ids))
                fav_set = {f["product_id"] for f in fav_docs}
        except Exception:
            pass

    return [_to_response(d, is_favorited=(d["_id"] in fav_set)) for d in docs]


# =====================================================
# GET /products/categories - List all categories
# =====================================================

@router.get("/categories")
async def list_product_categories():
    """Get all available product categories."""
    return {"categories": get_categories()}


# =====================================================
# GET /products/trending - Trending products (most viewed)
# =====================================================

@router.get("/trending", response_model=List[ProductResponse])
async def list_trending(
    limit: int = Query(12, ge=1, le=50, description="Max number of trending products"),
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """Get trending products sorted by view count. Public access."""
    db = get_database()
    docs = (
        await db.products
        .find({"status": "available"})
        .sort("views", -1)
        .limit(limit)
        .to_list(length=limit)
    )

    fav_set = set()
    if current_user:
        try:
            uid = ObjectId(current_user["user_id"])
            product_ids = [d["_id"] for d in docs]
            if product_ids:
                fav_docs = await db.favorites.find(
                    {"user_id": uid, "product_id": {"$in": product_ids}}
                ).to_list(length=len(product_ids))
                fav_set = {f["product_id"] for f in fav_docs}
        except Exception:
            pass

    return [_to_response(d, is_favorited=(d["_id"] in fav_set)) for d in docs]


# =====================================================
# GET /products/user/me - Current user's products (auth required)
# =====================================================

@router.get("/user/me", response_model=List[ProductResponse])
async def get_my_products(current_user: dict = Depends(get_current_user)):
    """Get all products published by the current user."""
    db = get_database()

    try:
        uid = ObjectId(current_user["user_id"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid user id")

    docs = await db.products.find({"seller_id": uid}).sort("created_at", -1).to_list(length=100)
    return [_to_response(d) for d in docs]


# =====================================================
# GET /products/{id} - Product detail (public)
# =====================================================

@router.get("/{id}", response_model=ProductResponse)
async def get_product(
    id: str,
    current_user: Optional[dict] = Depends(get_optional_user),
):
    """Get product detail and increment view count."""
    db = get_database()

    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    doc = await db.products.find_one({"_id": pid})
    if not doc:
        raise HTTPException(status_code=404, detail="Product not found")
    if doc.get("status") == "removed":
        raise HTTPException(status_code=410, detail="Product has been removed by admin")

    await db.products.update_one({"_id": pid}, {"$inc": {"views": 1}})
    doc = await db.products.find_one({"_id": pid})

    is_fav = False
    if current_user:
        try:
            uid = ObjectId(current_user["user_id"])
            fav = await db.favorites.find_one({"user_id": uid, "product_id": pid})
            is_fav = fav is not None
        except Exception:
            pass

    return _to_response(doc, is_favorited=is_fav)


# =====================================================
# POST /products - Create product (JSON, auth required)
# =====================================================

@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    payload: ProductCreate, 
    current_user: dict = Depends(get_current_user)
):
    """Create a product with manually entered information. Verified users only."""
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    now = datetime.utcnow()
    doc = ProductInDB(
        seller_id=uid,
        **payload.model_dump(),
        created_at=now,
        updated_at=now,
    ).model_dump(by_alias=True)

    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _to_response(doc)


# =====================================================
# POST /products/with-image - Create product with image upload
# =====================================================

@router.post("/with-image", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product_with_image(
    file: UploadFile = File(..., description="Product image"),
    title: str = Form(..., description="Product title"),
    description: str = Form(..., description="Product description"),
    price: float = Form(..., description="Price"),
    category: str = Form(..., description="Category"),
    condition: str = Form(default="good", description="Condition: new/like_new/good/fair"),
    sustainable: bool = Form(default=False, description="Whether the product is sustainable"),
    current_user: dict = Depends(get_current_user)
):
    """Create a product with an uploaded image. Verified users only. Image is compressed and thumbnail generated."""
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    result = await process_and_save_image(file)
    image_url = result["image_url"]
    thumb_url = result.get("thumb_url")

    now = datetime.utcnow()
    doc = {
        "seller_id": uid,
        "title": title,
        "description": description,
        "price": price,
        "category": category,
        "condition": condition,
        "sustainable": sustainable,
        "images": [image_url],
        "thumb_url": thumb_url,
        "status": "pending",
        "views": 0,
        "created_at": now,
        "updated_at": now,
    }

    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _to_response(doc)


# =====================================================
# POST /products/ai-create - AI-powered product creation
# =====================================================

@router.post("/ai-create", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product_with_ai(
    file: UploadFile = File(..., description="Product image"),
    price: float = Form(..., description="Price (user must provide)"),
    condition: str = Form(default="good", description="Condition: new/like_new/good/fair"),
    sustainable: bool = Form(default=False, description="Whether the product is sustainable"),
    current_user: dict = Depends(get_current_user)
):
    """AI-powered product creation: upload an image, AI generates title/description/category. Image is compressed."""
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    content = await file.read()
    result = process_image_bytes(content, file.filename or "image.jpg")
    image_url = result["image_url"]
    thumb_url = result.get("thumb_url")
    file_content = result["content"]

    ai_result = await analyze_image(file_content)

    if not ai_result["success"]:
        delete_image(image_url)
        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {ai_result.get('error', 'Unknown error')}"
        )

    ai_data = ai_result["data"]

    now = datetime.utcnow()
    doc = {
        "seller_id": uid,
        "title": ai_data["title"],
        "description": ai_data["description"],
        "price": price,
        "category": ai_data["category"],
        "condition": condition,
        "sustainable": sustainable,
        "images": [image_url],
        "thumb_url": thumb_url,
        "keywords": ai_data.get("keywords", []),
        "status": "pending",
        "views": 0,
        "ai_generated": True,
        "created_at": now,
        "updated_at": now,
    }

    res = await db.products.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _to_response(doc)


# =====================================================
# POST /products/ai-preview - AI preview (no save)
# =====================================================

@router.post("/ai-preview")
async def preview_ai_analysis(
    file: UploadFile = File(..., description="Product image"),
    current_user: dict = Depends(get_current_user)
):
    """AI preview: analyze image and return AI-generated fields without saving."""
    db = get_database()
    user, uid = await get_verified_user(current_user, db)

    file_ext = file.filename.split(".")[-1].lower() if file.filename else ""
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

    ai_result = await analyze_image(content)
    
    if not ai_result["success"]:
        raise HTTPException(
            status_code=500,
            detail=f"AI analysis failed: {ai_result.get('error', 'Unknown error')}"
        )

    return {
        "success": True,
        "preview": ai_result["data"],
        "message": "This is a preview. Use /products/ai-create to publish."
    }


# =====================================================
# PUT /products/{id} - Update product (owner only)
# =====================================================

@router.put("/{id}", response_model=ProductResponse)
async def update_product(
    id: str,
    payload: ProductCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update a product. Edited products go back to pending review."""
    db = get_database()

    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    existing = await db.products.find_one({"_id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    user, uid = await get_verified_user(current_user, db)

    if str(existing["seller_id"]) != str(uid):
        raise HTTPException(status_code=403, detail="You can only update your own products")

    now = datetime.utcnow()
    update_data = {**payload.model_dump(), "updated_at": now, "status": ProductStatus.PENDING.value}
    await db.products.update_one(
        {"_id": pid},
        {"$set": update_data}
    )

    updated = await db.products.find_one({"_id": pid})
    return _to_response(updated)


# =====================================================
# DELETE /products/{id} - Delete product (owner only)
# =====================================================

@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def delete_product(
    id: str, 
    current_user: dict = Depends(get_current_user)
):
    """Delete a product. Only the owner can delete it."""
    db = get_database()

    try:
        pid = ObjectId(id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid product id")

    existing = await db.products.find_one({"_id": pid})
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")

    user, uid = await get_verified_user(current_user, db)

    if str(existing["seller_id"]) != str(uid):
        raise HTTPException(status_code=403, detail="You can only delete your own products")

    for image_url in existing.get("images", []):
        delete_image(image_url)

    await db.products.delete_one({"_id": pid})
    return {"ok": True, "message": "Product deleted successfully"}
