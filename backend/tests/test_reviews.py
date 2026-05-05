"""
reviews 路由测试。
覆盖：创建评价（受订单状态门禁约束）、查看用户评价、查看自己写的评价。

业务规则：
  - 订单必须 completed 才能评价
  - 只有买家或卖家能给本单评价
  - 同一用户同一订单只能评一次（HTTP 409）
  - 评分范围 1–5
"""
from bson import ObjectId


# =====================================================
# POST /reviews  —— 创建评价
# =====================================================
class TestCreateReview:
    PAYLOAD = {"rating": 5, "comment": "Smooth deal"}

    async def test_buyer_can_review_completed_order(
        self, client, db, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        resp = await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order["id"], **self.PAYLOAD},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["ok"] is True

        # DB 中确实有一条评价
        review = await db.reviews.find_one({
            "order_id": order["_id"],
            "reviewer_user_id": buyer_user["_id"],
        })
        assert review is not None
        assert review["rating"] == 5
        assert review["reviewee_user_id"] == seller_user["_id"]
        assert review["reviewee_role"] == "seller"

    async def test_seller_can_review_completed_order(
        self, client, db, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        resp = await client.post(
            "/reviews",
            headers=auth_headers(seller_user),
            json={"order_id": order["id"], **self.PAYLOAD},
        )
        assert resp.status_code == 201

        review = await db.reviews.find_one({
            "order_id": order["_id"],
            "reviewer_user_id": seller_user["_id"],
        })
        assert review["reviewee_role"] == "buyer"

    async def test_cannot_review_non_completed_order(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="confirmed"
        )
        resp = await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order["id"], **self.PAYLOAD},
        )
        assert resp.status_code == 400

    async def test_cannot_review_pending_order(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="pending"
        )
        resp = await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order["id"], **self.PAYLOAD},
        )
        assert resp.status_code == 400

    async def test_outsider_cannot_review(
        self,
        client,
        buyer_user,
        seller_user,
        admin_user,
        auth_headers,
        make_order,
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        resp = await client.post(
            "/reviews",
            headers=auth_headers(admin_user),
            json={"order_id": order["id"], **self.PAYLOAD},
        )
        assert resp.status_code == 403

    async def test_cannot_review_same_order_twice(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        # 第一次评价
        r1 = await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order["id"], **self.PAYLOAD},
        )
        assert r1.status_code == 201

        # 同一买家再评一次
        r2 = await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order["id"], **self.PAYLOAD},
        )
        assert r2.status_code == 409

    async def test_buyer_and_seller_can_both_review(
        self, client, db, buyer_user, seller_user, auth_headers, make_order
    ):
        """买家和卖家互评不冲突，应各自留下一条记录。"""
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        r1 = await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order["id"], "rating": 5},
        )
        r2 = await client.post(
            "/reviews",
            headers=auth_headers(seller_user),
            json={"order_id": order["id"], "rating": 4},
        )
        assert r1.status_code == 201 and r2.status_code == 201

        count = await db.reviews.count_documents({"order_id": order["_id"]})
        assert count == 2

    async def test_review_order_not_found(
        self, client, buyer_user, auth_headers
    ):
        resp = await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": str(ObjectId()), **self.PAYLOAD},
        )
        assert resp.status_code == 404

    async def test_rating_out_of_range_rejected(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        resp = await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order["id"], "rating": 6},
        )
        # Pydantic 校验 ge=1, le=5，超范围应 422
        assert resp.status_code == 422

    async def test_rating_below_minimum_rejected(
        self, client, buyer_user, seller_user, auth_headers, make_order
    ):
        """rating=0 也应被 Pydantic 校验拒绝（下界）。"""
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        resp = await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order["id"], "rating": 0},
        )
        assert resp.status_code == 422

    async def test_requires_verified_user(
        self, client, unverified_user, seller_user, auth_headers, make_order
    ):
        order, _ = await make_order(
            buyer=unverified_user, seller=seller_user, status="completed"
        )
        resp = await client.post(
            "/reviews",
            headers=auth_headers(unverified_user),
            json={"order_id": order["id"], **self.PAYLOAD},
        )
        assert resp.status_code == 403


# =====================================================
# GET /reviews/user/{user_id}  —— 公开查看某用户的口碑
# =====================================================
class TestGetUserReviews:
    async def test_returns_seller_and_buyer_sections(
        self, client, db, buyer_user, seller_user, auth_headers, make_order
    ):
        # 一笔订单，买家评了卖家
        order, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order["id"], "rating": 5, "comment": "great seller"},
        )

        resp = await client.get(f"/reviews/user/{seller_user['id']}")
        assert resp.status_code == 200
        body = resp.json()
        # 卖家维度有一条评价
        assert body["as_seller"]["summary"]["total_reviews"] == 1
        assert body["as_seller"]["summary"]["avg_rating"] == 5.0
        # 卖家从未作为买家被评过
        assert body["as_buyer"]["summary"]["total_reviews"] == 0

    async def test_user_with_no_reviews(
        self, client, verified_user
    ):
        resp = await client.get(f"/reviews/user/{verified_user['id']}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["as_seller"]["summary"]["total_reviews"] == 0
        assert body["as_buyer"]["summary"]["total_reviews"] == 0
        assert body["as_seller"]["items"] == []

    async def test_invalid_user_id_returns_400(self, client):
        resp = await client.get("/reviews/user/not-a-valid-id")
        assert resp.status_code == 400


# =====================================================
# GET /reviews/me  —— 我写过的评价
# =====================================================
class TestMyReviews:
    async def test_returns_only_my_given_reviews(
        self,
        client,
        buyer_user,
        seller_user,
        auth_headers,
        make_order,
        make_user,
    ):
        # buyer 评了 seller 一笔
        order1, _ = await make_order(
            buyer=buyer_user, seller=seller_user, status="completed"
        )
        await client.post(
            "/reviews",
            headers=auth_headers(buyer_user),
            json={"order_id": order1["id"], "rating": 5},
        )

        # 另一个买家也评了 seller，不应出现在 buyer_user 的列表里
        another_buyer = await make_user(
            email="ab@university.edu", username="ab"
        )
        order2, _ = await make_order(
            buyer=another_buyer, seller=seller_user, status="completed"
        )
        await client.post(
            "/reviews",
            headers=auth_headers(another_buyer),
            json={"order_id": order2["id"], "rating": 4},
        )

        resp = await client.get(
            "/reviews/me", headers=auth_headers(buyer_user)
        )
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["order_id"] == order1["id"]
        assert items[0]["rating"] == 5

    async def test_empty_when_no_reviews_given(
        self, client, verified_user, auth_headers
    ):
        resp = await client.get(
            "/reviews/me", headers=auth_headers(verified_user)
        )
        assert resp.status_code == 200
        assert resp.json() == {"items": []}

    async def test_requires_authentication(self, client):
        resp = await client.get("/reviews/me")
        assert resp.status_code in (401, 403)
