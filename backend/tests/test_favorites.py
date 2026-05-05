"""
favorites 路由测试。
覆盖：列表 / 添加收藏 / 取消收藏，以及鉴权、重复收藏、跨用户隔离等边界。
"""
from bson import ObjectId


# =====================================================
# GET /favorites
# =====================================================
class TestGetFavorites:
    async def test_empty_when_no_favorites(
        self, client, verified_user, auth_headers
    ):
        resp = await client.get(
            "/favorites", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_returns_user_favorites(
        self, client, db, verified_user, auth_headers, make_product
    ):
        p1 = await make_product(verified_user, title="Fav A")
        p2 = await make_product(verified_user, title="Fav B")
        await db.favorites.insert_one({
            "user_id": verified_user["_id"],
            "product_id": p1["_id"],
            "created_at": __import__("datetime").datetime.utcnow(),
        })
        await db.favorites.insert_one({
            "user_id": verified_user["_id"],
            "product_id": p2["_id"],
            "created_at": __import__("datetime").datetime.utcnow(),
        })

        resp = await client.get(
            "/favorites", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        titles = {item["title"] for item in resp.json()}
        assert titles == {"Fav A", "Fav B"}

    async def test_does_not_leak_other_users_favorites(
        self,
        client,
        db,
        verified_user,
        admin_user,
        auth_headers,
        make_product,
    ):
        # admin 收藏了一个商品
        product = await make_product(admin_user, title="admin's pick")
        await db.favorites.insert_one({
            "user_id": admin_user["_id"],
            "product_id": product["_id"],
            "created_at": __import__("datetime").datetime.utcnow(),
        })

        # verified_user 自己一个收藏都没有 → 应该返回空列表
        resp = await client.get(
            "/favorites", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        assert resp.json() == []

    async def test_requires_authentication(self, client):
        resp = await client.get("/favorites")
        assert resp.status_code in (401, 403)


# =====================================================
# POST /favorites/{product_id}
# =====================================================
class TestAddFavorite:
    async def test_add_favorite_success(
        self, client, db, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user)
        resp = await client.post(
            f"/favorites/{product['id']}",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # DB 中确实有一条记录
        fav = await db.favorites.find_one({
            "user_id": verified_user["_id"],
            "product_id": product["_id"],
        })
        assert fav is not None

    async def test_duplicate_add_is_idempotent(
        self, client, db, verified_user, auth_headers, make_product
    ):
        """重复收藏不应报错，且 DB 中只保留一条记录。"""
        product = await make_product(verified_user)
        headers = auth_headers(verified_user)

        # 第一次收藏
        r1 = await client.post(f"/favorites/{product['id']}", headers=headers)
        assert r1.status_code == 200

        # 第二次收藏同一商品
        r2 = await client.post(f"/favorites/{product['id']}", headers=headers)
        assert r2.status_code == 200
        assert "already" in r2.json()["message"].lower()

        # DB 中应该仍然只有一条
        count = await db.favorites.count_documents({
            "user_id": verified_user["_id"],
            "product_id": product["_id"],
        })
        assert count == 1

    async def test_add_nonexistent_product_returns_404(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            f"/favorites/{ObjectId()}",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 404

    async def test_add_invalid_product_id_returns_400(
        self, client, verified_user, auth_headers
    ):
        resp = await client.post(
            "/favorites/not-a-valid-id",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 400

    async def test_requires_authentication(self, client, verified_user, make_product):
        product = await make_product(verified_user)
        resp = await client.post(f"/favorites/{product['id']}")
        assert resp.status_code in (401, 403)


# =====================================================
# DELETE /favorites/{product_id}
# =====================================================
class TestRemoveFavorite:
    async def test_remove_favorite_success(
        self, client, db, verified_user, auth_headers, make_product
    ):
        product = await make_product(verified_user)
        # 先写一条收藏
        await db.favorites.insert_one({
            "user_id": verified_user["_id"],
            "product_id": product["_id"],
            "created_at": __import__("datetime").datetime.utcnow(),
        })

        resp = await client.delete(
            f"/favorites/{product['id']}",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # DB 中应已删除
        fav = await db.favorites.find_one({
            "user_id": verified_user["_id"],
            "product_id": product["_id"],
        })
        assert fav is None

    async def test_remove_when_not_favorited_is_idempotent(
        self, client, verified_user, auth_headers, make_product
    ):
        """取消未收藏的商品也应返回 200，便于前端无脑调用。"""
        product = await make_product(verified_user)
        resp = await client.delete(
            f"/favorites/{product['id']}",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200

    async def test_remove_only_affects_current_user(
        self,
        client,
        db,
        verified_user,
        admin_user,
        auth_headers,
        make_product,
    ):
        """A 取消自己的收藏，不会影响 B 的收藏记录。"""
        product = await make_product(verified_user)
        # 两人都收藏了同一商品
        await db.favorites.insert_one({
            "user_id": verified_user["_id"],
            "product_id": product["_id"],
            "created_at": __import__("datetime").datetime.utcnow(),
        })
        await db.favorites.insert_one({
            "user_id": admin_user["_id"],
            "product_id": product["_id"],
            "created_at": __import__("datetime").datetime.utcnow(),
        })

        # verified_user 取消收藏
        resp = await client.delete(
            f"/favorites/{product['id']}",
            headers=auth_headers(verified_user),
        )
        assert resp.status_code == 200

        # admin 的收藏还在
        admin_fav = await db.favorites.find_one({
            "user_id": admin_user["_id"],
            "product_id": product["_id"],
        })
        assert admin_fav is not None

    async def test_requires_authentication(self, client, verified_user, make_product):
        product = await make_product(verified_user)
        resp = await client.delete(f"/favorites/{product['id']}")
        assert resp.status_code in (401, 403)


# =====================================================
# 边界：商品被删除后的收藏
# =====================================================
class TestFavoritesEdgeCases:
    async def test_list_silently_skips_deleted_products(
        self, client, db, verified_user, auth_headers, make_product
    ):
        """
        如果用户收藏的商品后来被删除（DB 中 product 不存在），
        GET /favorites 应当静默跳过，不能因此整接口报错。
        """
        from datetime import datetime
        # 收藏两件商品
        p_alive = await make_product(verified_user, title="Alive")
        p_gone = await make_product(verified_user, title="WillBeDeleted")
        await db.favorites.insert_one({
            "user_id": verified_user["_id"],
            "product_id": p_alive["_id"],
            "created_at": datetime.utcnow(),
        })
        await db.favorites.insert_one({
            "user_id": verified_user["_id"],
            "product_id": p_gone["_id"],
            "created_at": datetime.utcnow(),
        })

        # 直接从 DB 删除其中一件商品（模拟卖家把商品下架/删除的场景）
        await db.products.delete_one({"_id": p_gone["_id"]})

        resp = await client.get(
            "/favorites", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        body = resp.json()
        # 列表中只应剩下还存在的那件
        assert len(body) == 1
        assert body[0]["title"] == "Alive"
