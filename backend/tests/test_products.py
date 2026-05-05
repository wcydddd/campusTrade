"""
products 路由测试。
覆盖列表 / 详情 / 发布 / 编辑 / 删除 / boost / AI / 上传图片等接口。

约定：
  - `make_product(seller=...)` 直接插库造商品
  - `make_user(...)` / `verified_user` 等用户 fixture 见 conftest
  - AI 接口、图片处理已在 conftest 中 mock，不会真请求 OpenAI 或落盘
"""
from io import BytesIO
from datetime import datetime, timedelta

import pytest
from bson import ObjectId


# =====================================================
# GET /products  列表
# =====================================================
class TestListProducts:
    async def test_list_returns_available_products(
        self, client, verified_user, make_product
    ):
        await make_product(verified_user, title="A", status="available")
        await make_product(verified_user, title="B", status="available")

        resp = await client.get("/products")
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) == 2
        titles = {item["title"] for item in body}
        assert titles == {"A", "B"}

    async def test_list_excludes_sold_by_default(
        self, client, verified_user, make_product
    ):
        await make_product(verified_user, title="OnSale", status="available")
        await make_product(verified_user, title="AlreadySold", status="sold")

        resp = await client.get("/products")
        assert resp.status_code == 200
        titles = {item["title"] for item in resp.json()}
        assert "OnSale" in titles
        assert "AlreadySold" not in titles

    async def test_list_filter_by_category(
        self, client, verified_user, make_product
    ):
        await make_product(verified_user, title="Book", category="Textbooks")
        await make_product(verified_user, title="Phone", category="Electronics")

        resp = await client.get("/products?category=Textbooks")
        assert resp.status_code == 200
        titles = [item["title"] for item in resp.json()]
        assert titles == ["Book"]

    async def test_list_filter_by_price_range(
        self, client, verified_user, make_product
    ):
        await make_product(verified_user, title="Cheap", price=5.0)
        await make_product(verified_user, title="Mid", price=50.0)
        await make_product(verified_user, title="Pricey", price=500.0)

        resp = await client.get("/products?min_price=10&max_price=100")
        assert resp.status_code == 200
        titles = {item["title"] for item in resp.json()}
        assert titles == {"Mid"}

    async def test_list_filter_by_search_keyword(
        self, client, verified_user, make_product
    ):
        await make_product(verified_user, title="Calculus textbook")
        await make_product(verified_user, title="Used phone")

        resp = await client.get("/products?search=calculus")
        assert resp.status_code == 200
        titles = [item["title"] for item in resp.json()]
        assert titles == ["Calculus textbook"]

    async def test_list_filter_by_sustainable(
        self, client, verified_user, make_product
    ):
        """CA2 Aim 2 — sustainability 筛选：只返回 sustainable=true 的商品。"""
        await make_product(verified_user, title="EcoBag", sustainable=True)
        await make_product(verified_user, title="Plastic", sustainable=False)

        resp = await client.get("/products?sustainable=true")
        assert resp.status_code == 200
        titles = [item["title"] for item in resp.json()]
        assert titles == ["EcoBag"]

        # 反向验证：sustainable=false 时只返回非 sustainable 的
        resp = await client.get("/products?sustainable=false")
        assert resp.status_code == 200
        titles = [item["title"] for item in resp.json()]
        assert titles == ["Plastic"]


# =====================================================
# GET /products/categories
# =====================================================
class TestCategories:
    async def test_returns_category_list(self, client):
        resp = await client.get("/products/categories")
        assert resp.status_code == 200
        body = resp.json()
        assert "categories" in body
        assert isinstance(body["categories"], list)
        assert len(body["categories"]) > 0


# =====================================================
# GET /products/trending
# =====================================================
class TestTrending:
    async def test_trending_sorted_by_views(
        self, client, verified_user, make_product
    ):
        await make_product(verified_user, title="Cold", views=1)
        await make_product(verified_user, title="Hot", views=100)
        await make_product(verified_user, title="Warm", views=10)

        resp = await client.get("/products/trending?limit=3")
        assert resp.status_code == 200
        titles = [item["title"] for item in resp.json()]
        assert titles == ["Hot", "Warm", "Cold"]

    async def test_trending_respects_limit(
        self, client, verified_user, make_product
    ):
        for i in range(5):
            await make_product(verified_user, title=f"P{i}", views=i)

        resp = await client.get("/products/trending?limit=2")
        assert resp.status_code == 200
        assert len(resp.json()) == 2


# =====================================================
# GET /products/user/me
# =====================================================
class TestMyProducts:
    async def test_returns_only_my_products(
        self, client, verified_user, admin_user, auth_headers, make_product
    ):
        await make_product(verified_user, title="Mine")
        await make_product(admin_user, title="Other")

        resp = await client.get(
            "/products/user/me", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        titles = [item["title"] for item in resp.json()]
        assert titles == ["Mine"]

    async def test_requires_authentication(self, client):
        resp = await client.get("/products/user/me")
        assert resp.status_code in (401, 403)


# =====================================================
# GET /products/seller/{seller_id}
# =====================================================
class TestSellerProducts:
    async def test_returns_seller_available_products(
        self, client, verified_user, make_product
    ):
        await make_product(verified_user, title="Visible", status="available")
        await make_product(verified_user, title="Hidden", status="sold")

        resp = await client.get(f"/products/seller/{verified_user['id']}")
        assert resp.status_code == 200
        titles = [item["title"] for item in resp.json()]
        assert titles == ["Visible"]

    async def test_invalid_seller_id_400(self, client):
        resp = await client.get("/products/seller/not-an-objectid")
        assert resp.status_code == 400

    async def test_seller_not_found_404(self, client):
        resp = await client.get(f"/products/seller/{ObjectId()}")
        assert resp.status_code == 404


# =====================================================
# GET /products/{id}  详情
# =====================================================
class TestProductDetail:
    async def test_get_detail_increments_views(
        self, client, verified_user, make_product
    ):
        product = await make_product(verified_user, views=0)
        resp = await client.get(f"/products/{product['id']}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == product["id"]
        assert body["views"] == 1

    async def test_invalid_id_returns_400(self, client):
        resp = await client.get("/products/not-a-valid-id")
        assert resp.status_code == 400

    async def test_not_found_returns_404(self, client):
        resp = await client.get(f"/products/{ObjectId()}")
        assert resp.status_code == 404

    async def test_removed_product_returns_410(
        self, client, verified_user, make_product
    ):
        product = await make_product(verified_user, status="removed")
        resp = await client.get(f"/products/{product['id']}")
        assert resp.status_code == 410


# =====================================================
# POST /products  发布（JSON）
# =====================================================
class TestCreateProduct:
    PAYLOAD = {
        "title": "New listing",
        "description": "Just published",
        "price": 19.99,
        "category": "Textbooks",
        "condition": "good",
        "sustainable": False,
        "images": ["/images/x.jpg"],
    }

    async def test_create_success(self, client, verified_user, auth_headers):
        resp = await client.post(
            "/products",
            headers=auth_headers(verified_user),
            json=self.PAYLOAD,
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == self.PAYLOAD["title"]
        assert body["seller_id"] == verified_user["id"]
        assert body["status"] == "pending"

    async def test_create_requires_auth(self, client):
        resp = await client.post("/products", json=self.PAYLOAD)
        assert resp.status_code in (401, 403)

    async def test_create_unverified_user_forbidden(
        self, client, unverified_user, auth_headers
    ):
        resp = await client.post(
            "/products",
            headers=auth_headers(unverified_user),
            json=self.PAYLOAD,
        )
        assert resp.status_code == 403

    async def test_create_banned_user_forbidden(
        self, client, make_user, auth_headers
    ):
        banned = await make_user(
            email="banned@university.edu", username="banned", banned=True
        )
        resp = await client.post(
            "/products",
            headers=auth_headers(banned),
            json=self.PAYLOAD,
        )
        assert resp.status_code == 403


# =====================================================
# POST /products/with-image  发布（带图）
# =====================================================
class TestCreateProductWithImage:
    async def test_create_with_image_success(
        self, client, verified_user, auth_headers
    ):
        # 构造伪图片字节流
        fake_img = BytesIO(b"\x89PNG\r\n\x1a\nfake")
        resp = await client.post(
            "/products/with-image",
            headers=auth_headers(verified_user),
            data={
                "title": "Photo listing",
                "description": "with image",
                "price": "12.5",
                "category": "Electronics",
                "condition": "good",
                "sustainable": "false",
            },
            files={"file": ("test.png", fake_img, "image/png")},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["title"] == "Photo listing"
        assert len(body["images"]) >= 1

    async def test_create_with_image_no_image_fails(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            "/products/with-image",
            headers=auth_headers(verified_user),
            data={
                "title": "No image",
                "description": "x",
                "price": "1.0",
                "category": "Other",
            },
        )
        assert resp.status_code == 400

    async def test_create_with_multiple_images(
        self, client, verified_user, auth_headers
    ):
        """前端真实场景：用户一次上传多张图。"""
        resp = await client.post(
            "/products/with-image",
            headers=auth_headers(verified_user),
            data={
                "title": "Multi-image listing",
                "description": "3 photos",
                "price": "25.0",
                "category": "Electronics",
                "condition": "good",
                "sustainable": "false",
            },
            files=[
                ("files", ("a.png", BytesIO(b"img1"), "image/png")),
                ("files", ("b.png", BytesIO(b"img2"), "image/png")),
                ("files", ("c.png", BytesIO(b"img3"), "image/png")),
            ],
        )
        assert resp.status_code == 201
        body = resp.json()
        # 3 张图都被保存
        assert len(body["images"]) == 3

    async def test_create_with_existing_images_only(
        self, client, verified_user, auth_headers
    ):
        """AI 工作流：仅复用已上传过的 URL，不再传新文件。"""
        import json
        resp = await client.post(
            "/products/with-image",
            headers=auth_headers(verified_user),
            data={
                "title": "AI workflow listing",
                "description": "Reuse AI-uploaded image",
                "price": "30.0",
                "category": "Other",
                "condition": "good",
                "sustainable": "false",
                "existing_images": json.dumps([
                    "/images/ai-saved-1.jpg",
                    "/images/ai-saved-2.jpg",
                ]),
            },
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "/images/ai-saved-1.jpg" in body["images"]
        assert "/images/ai-saved-2.jpg" in body["images"]
        assert len(body["images"]) == 2

    async def test_create_with_mixed_files_and_existing(
        self, client, verified_user, auth_headers
    ):
        """混合：1 张新文件 + 1 张已存 URL。"""
        import json
        resp = await client.post(
            "/products/with-image",
            headers=auth_headers(verified_user),
            data={
                "title": "Mixed listing",
                "description": "old + new",
                "price": "40.0",
                "category": "Furniture",
                "condition": "good",
                "sustainable": "false",
                "existing_images": json.dumps(["/images/existing.jpg"]),
            },
            files=[
                ("files", ("new.png", BytesIO(b"newimg"), "image/png")),
            ],
        )
        assert resp.status_code == 201
        body = resp.json()
        assert "/images/existing.jpg" in body["images"]
        assert len(body["images"]) == 2  # 1 existing + 1 new

    async def test_create_with_invalid_existing_images_json(
        self, client, verified_user, auth_headers
    ):
        """existing_images 不是合法 JSON 应返回 400。"""
        resp = await client.post(
            "/products/with-image",
            headers=auth_headers(verified_user),
            data={
                "title": "Bad JSON",
                "description": "x",
                "price": "1.0",
                "category": "Other",
                "existing_images": "this is not json {{{",
            },
            files=[("files", ("x.png", BytesIO(b"x"), "image/png"))],
        )
        assert resp.status_code == 400


# =====================================================
# PUT /products/{id}  更新
# =====================================================
class TestUpdateProduct:
    PAYLOAD = {
        "title": "Updated title",
        "description": "Updated description",
        "price": 99.0,
        "category": "Electronics",
        "condition": "like_new",
        "sustainable": True,
        "images": ["/images/x.jpg"],
    }

    async def test_owner_can_update(
        self, client, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="available")
        resp = await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
            json=self.PAYLOAD,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["title"] == "Updated title"
        # 编辑后会回到 pending 等审核
        assert body["status"] == "pending"

    async def test_non_owner_cannot_update(
        self, client, verified_user, admin_user, auth_headers, make_product
    ):
        product = await make_product(verified_user)
        resp = await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(admin_user),
            json=self.PAYLOAD,
        )
        assert resp.status_code == 403

    async def test_update_unknown_product_404(
        self, client, verified_user, auth_headers
    ):
        resp = await client.put(
            f"/products/{ObjectId()}",
            headers=auth_headers(verified_user),
            json=self.PAYLOAD,
        )
        assert resp.status_code == 404

    async def test_edit_product_deletes_removed_images(
        self, client, verified_user, auth_headers, make_product, monkeypatch
    ):
        """
        编辑商品时若图片被去掉，后端应调 delete_image() 真删服务器文件——
        防止废弃图片堆积塞满存储。用 spy 监控 delete_image 调用。
        """
        deleted_urls = []

        async def _spy_delete(image_url):
            deleted_urls.append(image_url)

        monkeypatch.setattr("routes.products.delete_image", _spy_delete)

        # 造一个有 3 张图的商品
        product = await make_product(
            verified_user,
            status="available",
            images=["/images/keep.jpg", "/images/remove1.jpg", "/images/remove2.jpg"],
        )

        # 编辑：保留第 1 张，去掉后 2 张
        resp = await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
            json={
                "title": "Edited",
                "description": "removed 2 images",
                "price": 50.0,
                "category": "Other",
                "condition": "good",
                "sustainable": False,
                "images": ["/images/keep.jpg"],
            },
        )
        assert resp.status_code == 200

        # delete_image 应只为被去掉的 2 张图调用，不动保留的那张
        assert sorted(deleted_urls) == [
            "/images/remove1.jpg", "/images/remove2.jpg"
        ]
        assert "/images/keep.jpg" not in deleted_urls


# =====================================================
# DELETE /products/{id}
# =====================================================
class TestDeleteProduct:
    async def test_owner_can_delete(
        self, client, db, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user)
        resp = await client.delete(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200

        gone = await db.products.find_one({"_id": product["_id"]})
        assert gone is None

    async def test_non_owner_cannot_delete(
        self, client, verified_user, admin_user, auth_headers, make_product
    ):
        product = await make_product(verified_user)
        resp = await client.delete(
            f"/products/{product['id']}",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 403


# =====================================================
# POST /products/{id}/boost
# =====================================================
class TestBoostProduct:
    async def test_owner_can_boost_available(
        self, client, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="available")
        resp = await client.post(
            f"/products/{product['id']}/boost",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    async def test_non_owner_cannot_boost(
        self, client, verified_user, admin_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="available")
        resp = await client.post(
            f"/products/{product['id']}/boost",
            headers=auth_headers(admin_user),
        )
        assert resp.status_code == 403

    async def test_cannot_boost_within_24h(
        self, client, verified_user, auth_headers, make_product
    ):
        recent = datetime.utcnow() - timedelta(hours=1)
        product = await make_product(
            verified_user, status="available", boosted_at=recent
        )
        resp = await client.post(
            f"/products/{product['id']}/boost",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 429

    async def test_cannot_boost_sold(
        self, client, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user, status="sold")
        resp = await client.post(
            f"/products/{product['id']}/boost",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 400


# =====================================================
# POST /products/{id}/images/upload  追加商品图片
# =====================================================
class TestUploadProductImages:
    async def test_owner_can_upload_extra_images(
        self, client, verified_user, auth_headers, make_product
    ):
        from io import BytesIO
        product = await make_product(verified_user)
        resp = await client.post(
            f"/products/{product['id']}/images/upload",
            headers=auth_headers(verified_user),
            files=[
                ("files", ("a.png", BytesIO(b"fake1"), "image/png")),
                ("files", ("b.png", BytesIO(b"fake2"), "image/png")),
            ],
        )
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body["images"], list)
        assert len(body["images"]) == 2

    async def test_non_owner_cannot_upload(
        self, client, verified_user, admin_user, auth_headers, make_product
    ):
        from io import BytesIO
        product = await make_product(verified_user)
        resp = await client.post(
            f"/products/{product['id']}/images/upload",
            headers=auth_headers(admin_user),
            files=[("files", ("x.png", BytesIO(b"fake"), "image/png"))],
        )
        assert resp.status_code == 403

    async def test_upload_to_nonexistent_product_returns_404(
        self, client, verified_user, auth_headers
    ):
        from io import BytesIO
        resp = await client.post(
            f"/products/{ObjectId()}/images/upload",
            headers=auth_headers(verified_user),
            files=[("files", ("x.png", BytesIO(b"fake"), "image/png"))],
        )
        assert resp.status_code == 404

    async def test_upload_invalid_product_id_returns_400(
        self, client, verified_user, auth_headers
    ):
        from io import BytesIO
        resp = await client.post(
            "/products/not-a-valid-id/images/upload",
            headers=auth_headers(verified_user),
            files=[("files", ("x.png", BytesIO(b"fake"), "image/png"))],
        )
        assert resp.status_code == 400


# =====================================================
# GET /products/history/me  浏览历史
# =====================================================
class TestBrowsingHistory:
    async def test_empty_history(self, client, verified_user, auth_headers):
        resp = await client.get(
            "/products/history/me", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        assert resp.json() == {"items": []}

    async def test_returns_recent_views(
        self, client, db, verified_user, auth_headers, make_product
    ):
        from datetime import datetime, timedelta
        p1 = await make_product(verified_user, title="Earlier")
        p2 = await make_product(verified_user, title="Later")

        # 直接往 browsing_history 插记录（避开真实 GET 详情接口的副作用）
        now = datetime.utcnow()
        await db.browsing_history.insert_one({
            "user_id": verified_user["_id"],
            "product_id": p1["_id"],
            "viewed_at": now - timedelta(hours=1),
            "created_at": now - timedelta(hours=1),
        })
        await db.browsing_history.insert_one({
            "user_id": verified_user["_id"],
            "product_id": p2["_id"],
            "viewed_at": now,
            "created_at": now,
        })

        resp = await client.get(
            "/products/history/me", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 2
        # 应按 viewed_at 倒序：Later 在前
        assert items[0]["product"]["title"] == "Later"
        assert items[1]["product"]["title"] == "Earlier"

    async def test_excludes_removed_products(
        self, client, db, verified_user, auth_headers, make_product
    ):
        """浏览过但被管理员下架（removed）的商品不应出现在历史里。"""
        from datetime import datetime
        p = await make_product(verified_user, title="Gone", status="removed")
        await db.browsing_history.insert_one({
            "user_id": verified_user["_id"],
            "product_id": p["_id"],
            "viewed_at": datetime.utcnow(),
            "created_at": datetime.utcnow(),
        })

        resp = await client.get(
            "/products/history/me", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        assert resp.json()["items"] == []

    async def test_requires_authentication(self, client):
        resp = await client.get("/products/history/me")
        assert resp.status_code in (401, 403)


# =====================================================
# 商品其他边界
# =====================================================
class TestProductEdgeCases:
    async def test_seller_profile_hidden_when_banned(
        self, client, make_user, make_product
    ):
        """被封禁的卖家访问 /seller/{id} 应返回 404（路由有此约束）。"""
        banned_seller = await make_user(
            email="banned_seller@university.edu",
            username="banned_seller",
            banned=True,
        )
        await make_product(banned_seller, status="available")
        resp = await client.get(f"/products/seller/{banned_seller['id']}")
        assert resp.status_code == 404

    async def test_detail_marks_is_favorited_for_logged_in_user(
        self, client, db, verified_user, auth_headers, make_product
    ):
        """登录用户已收藏的商品，详情接口 is_favorited 应为 true。"""
        from datetime import datetime
        product = await make_product(verified_user)
        await db.favorites.insert_one({
            "user_id": verified_user["_id"],
            "product_id": product["_id"],
            "created_at": datetime.utcnow(),
        })

        resp = await client.get(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        assert resp.json()["is_favorited"] is True

    async def test_detail_view_writes_browsing_history(
        self, client, db, verified_user, auth_headers, make_product
    ):
        """登录用户查看商品详情会自动 upsert 浏览历史。"""
        product = await make_product(verified_user)

        # 调用前应无记录
        before = await db.browsing_history.find_one({
            "user_id": verified_user["_id"],
            "product_id": product["_id"],
        })
        assert before is None

        await client.get(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
        )

        # 调用后应有一条记录
        after = await db.browsing_history.find_one({
            "user_id": verified_user["_id"],
            "product_id": product["_id"],
        })
        assert after is not None
        assert after["viewed_at"] is not None


# =====================================================
# 跨模块集成：商品变更触发通知
# =====================================================
class TestNotificationSideEffects:
    """验证 products 模块在变更时真的会触发 notifications 模块。"""

    PAYLOAD_BASE = {
        "title": "Same title",
        "description": "Same description",
        "category": "Other",
        "condition": "good",
        "sustainable": False,
        "images": ["/images/x.jpg"],
    }

    async def _favorite(self, db, user, product):
        from datetime import datetime
        await db.favorites.insert_one({
            "user_id": user["_id"],
            "product_id": product["_id"],
            "created_at": datetime.utcnow(),
        })

    async def test_price_drop_notifies_all_favoriters(
        self,
        client,
        db,
        verified_user,
        auth_headers,
        make_product,
        make_user,
        notification_spy,
    ):
        """100 → 80：两个收藏者各收到 1 条 price_drop 通知。"""
        product = await make_product(
            verified_user, status="available", price=100.0
        )
        fav1 = await make_user(email="f1@university.edu", username="f1")
        fav2 = await make_user(email="f2@university.edu", username="f2")
        await self._favorite(db, fav1, product)
        await self._favorite(db, fav2, product)

        resp = await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
            json={**self.PAYLOAD_BASE, "price": 80.0},
        )
        assert resp.status_code == 200

        price_drop = [c for c in notification_spy if c["ntype"] == "price_drop"]
        assert len(price_drop) == 2
        assert {c["user_id"] for c in price_drop} == {fav1["id"], fav2["id"]}

    async def test_no_notification_when_price_unchanged(
        self,
        client,
        db,
        verified_user,
        auth_headers,
        make_product,
        make_user,
        notification_spy,
    ):
        """改其他字段、价格不变：不应触发 price_drop 通知。"""
        product = await make_product(
            verified_user, status="available", price=100.0
        )
        fav = await make_user(email="f@university.edu", username="f")
        await self._favorite(db, fav, product)

        resp = await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
            json={**self.PAYLOAD_BASE, "title": "New title", "price": 100.0},
        )
        assert resp.status_code == 200

        price_drop = [c for c in notification_spy if c["ntype"] == "price_drop"]
        assert len(price_drop) == 0

    async def test_no_notification_when_price_increased(
        self,
        client,
        db,
        verified_user,
        auth_headers,
        make_product,
        make_user,
        notification_spy,
    ):
        """100 → 120 涨价：不应触发 price_drop（不是降价）。"""
        product = await make_product(
            verified_user, status="available", price=100.0
        )
        fav = await make_user(email="f@university.edu", username="f")
        await self._favorite(db, fav, product)

        resp = await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
            json={**self.PAYLOAD_BASE, "price": 120.0},
        )
        assert resp.status_code == 200

        price_drop = [c for c in notification_spy if c["ntype"] == "price_drop"]
        assert len(price_drop) == 0

    async def test_seller_not_notified_for_own_product_drop(
        self,
        client,
        db,
        verified_user,
        auth_headers,
        make_product,
        notification_spy,
    ):
        """边界：卖家自己也收藏了自己的商品，降价时不应给卖家本人发通知。"""
        product = await make_product(
            verified_user, status="available", price=100.0
        )
        await self._favorite(db, verified_user, product)

        resp = await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
            json={**self.PAYLOAD_BASE, "price": 80.0},
        )
        assert resp.status_code == 200

        price_drop = [c for c in notification_spy if c["ntype"] == "price_drop"]
        assert len(price_drop) == 0

    async def test_edit_available_product_saves_snapshot(
        self, client, db, verified_user, auth_headers, make_product
    ):
        """编辑已上架商品时，旧版本应作为 snapshot 保存到 DB。"""
        product = await make_product(
            verified_user, status="available",
            title="Original", price=100.0,
        )
        await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
            json={
                "title": "Edited",
                "description": "new desc",
                "price": 80.0,
                "category": "Other",
                "condition": "good",
                "sustainable": False,
                "images": [],
            },
        )

        after = await db.products.find_one({"_id": product["_id"]})
        # 编辑后状态变 pending（待审核）
        assert after["status"] == "pending"
        # snapshot 中应保存旧版本
        snap = after.get("pending_edit_snapshot")
        assert snap is not None
        assert snap["title"] == "Original"
        assert snap["price"] == 100.0
        assert snap["status"] == "available"

    async def test_admin_reject_edit_restores_snapshot(
        self,
        client,
        db,
        verified_user,
        admin_user,
        auth_headers,
        make_product,
    ):
        """admin 拒绝编辑时，商品应回滚到 snapshot 状态。"""
        product = await make_product(
            verified_user, status="available",
            title="Original", price=100.0,
        )
        # 卖家发起编辑（产生 snapshot）
        await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
            json={
                "title": "Edited",
                "description": "new desc",
                "price": 80.0,
                "category": "Other",
                "condition": "good",
                "sustainable": False,
                "images": [],
            },
        )

        # admin 拒绝
        resp = await client.post(
            f"/admin/products/{product['id']}/review",
            headers=auth_headers(admin_user),
            json={"action": "reject", "reason": "low quality photo"},
        )
        assert resp.status_code == 200

        after = await db.products.find_one({"_id": product["_id"]})
        # 应回到原版本
        assert after["title"] == "Original"
        assert after["price"] == 100.0
        assert after["status"] == "available"
        # snapshot 字段应被清除
        assert "pending_edit_snapshot" not in after

    async def test_admin_approve_edit_applies_changes(
        self,
        client,
        db,
        verified_user,
        admin_user,
        auth_headers,
        make_product,
    ):
        """admin 通过编辑时，新版本应正式生效，snapshot 字段被清除。"""
        product = await make_product(
            verified_user, status="available",
            title="Original", price=100.0,
        )
        await client.put(
            f"/products/{product['id']}",
            headers=auth_headers(verified_user),
            json={
                "title": "Edited",
                "description": "improved",
                "price": 80.0,
                "category": "Other",
                "condition": "good",
                "sustainable": False,
                "images": [],
            },
        )
        resp = await client.post(
            f"/admin/products/{product['id']}/review",
            headers=auth_headers(admin_user),
            json={"action": "approve"},
        )
        assert resp.status_code == 200

        after = await db.products.find_one({"_id": product["_id"]})
        assert after["title"] == "Edited"
        assert after["price"] == 80.0
        # 通过后 snapshot 应被清除（不再需要回滚信息）
        assert "pending_edit_snapshot" not in after

    async def test_product_creation_notifies_all_admins(
        self,
        client,
        verified_user,
        admin_user,
        auth_headers,
        notification_spy,
    ):
        """用户发布商品 → 所有 admin 应各收到一条 admin_review 通知。"""
        resp = await client.post(
            "/products",
            headers=auth_headers(verified_user),
            json={
                "title": "New listing for review",
                "description": "Just published",
                "price": 30.0,
                "category": "Other",
                "condition": "good",
                "sustainable": False,
                "images": [],
            },
        )
        assert resp.status_code == 201

        admin_calls = [c for c in notification_spy if c["ntype"] == "admin_review"]
        # 1 个 admin 应收到 1 条
        assert len(admin_calls) == 1
        assert admin_calls[0]["user_id"] == admin_user["id"]
        assert "review" in admin_calls[0]["title"].lower()
