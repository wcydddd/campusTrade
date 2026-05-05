"""
CampusTrade backend perf test (main).

Two user types:
  - BrowsingUser (anonymous, 70%) — typical visitor browsing the marketplace
  - AuthenticatedUser (30%) — logged-in user reading own data

Targets ~15 endpoints across products / auth / favorites / messages /
notifications / reviews. AI endpoint is in ai_locustfile.py (separate
because it costs real money and has OpenAI rate limits).

Run prerequisites:
  1. Start local Mongo:
        docker run -d -p 27017:27017 --name mongo-perf mongo:6
  2. Seed data:
        python perf_tests/seed_data.py
  3. Start backend pointing at local Mongo:
        MONGODB_URI=mongodb://localhost:27017 \\
        MONGODB_DB_NAME=campustrade_perf \\
        uvicorn main:app --host 127.0.0.1 --port 8000

Run perf test (CA2 spec: 10 concurrent users, p95 < 200ms):
    locust -f perf_tests/locustfile.py --headless \\
        -u 10 -r 2 -t 60s \\
        --host http://127.0.0.1:8000 \\
        --html perf_tests/report.html

Higher load smoke (50 users):
    locust -f perf_tests/locustfile.py --headless -u 50 -r 5 -t 60s \\
        --host http://127.0.0.1:8000

Web UI mode (interactive):
    locust -f perf_tests/locustfile.py --host http://127.0.0.1:8000
    # then open http://localhost:8089
"""
import itertools
import random
import threading

from locust import HttpUser, task, between, events

# 主测试账号（用于 ai_locustfile.py 等少量脚本）
TEST_EMAIL = "perftest@university.edu"
TEST_PASSWORD = "PerfTest123!"
PARTNER_EMAIL = "perfpartner@university.edu"

# Locust 测试账号池：seed_data.py 创建了 perfuser0..perfuser59
# 每个 Locust 虚拟用户从池里抽一个独立邮箱，避免单账号被限流
LOCUST_POOL_SIZE = 60
_account_pool = itertools.cycle([
    f"perfuser{i}@university.edu" for i in range(LOCUST_POOL_SIZE)
])
_pool_lock = threading.Lock()


def _next_account() -> str:
    """线程安全地从账号池里取下一个邮箱。"""
    with _pool_lock:
        return next(_account_pool)


# IP 池：所有 Locust 用户都来自 127.0.0.1，会触发后端的 IP 维度限流。
# 通过伪造 X-Forwarded-For 让 rate_limiter._get_client_ip 看到不同 IP，
# 每个虚拟用户分到独立的限流桶，模拟"不同设备的用户"。
_ip_counter = itertools.count()
_ip_lock = threading.Lock()


def _next_fake_ip() -> str:
    with _ip_lock:
        n = next(_ip_counter)
    # 10.0.x.y 私网段，确保不会撞到任何真实公网地址
    return f"10.0.{(n // 256) % 256}.{n % 256}"

CA2_P95_TARGET_MS = 200

# 由 BrowsingUser.on_start 第一次 fetch 商品列表后，写入这个共享缓存
_product_ids_cache: list[str] = []
_partner_id_cache: list[str] = []


def _ensure_product_ids(client) -> list[str]:
    """从运行中的后端动态拿真实 product id（避免硬编码）。"""
    global _product_ids_cache
    if _product_ids_cache:
        return _product_ids_cache
    resp = client.get("/products?limit=20", name="warmup: fetch product ids")
    if resp.status_code == 200:
        _product_ids_cache = [p["id"] for p in resp.json()]
    return _product_ids_cache


def _ensure_partner_id(client) -> str | None:
    """获取 partner 用户 id（用于 /products/seller/{id} 测试）。"""
    global _partner_id_cache
    if _partner_id_cache:
        return _partner_id_cache[0]
    # 通过商品列表里的 seller_id 推断（避开需要 admin 的 /admin/users）
    resp = client.get("/products?limit=20")
    if resp.status_code == 200:
        seller_ids = list({p["seller_id"] for p in resp.json()})
        if seller_ids:
            _partner_id_cache = seller_ids
            return seller_ids[0]
    return None


# =====================================================
# 匿名浏览用户（70% weight）
# =====================================================
class BrowsingUser(HttpUser):
    """模拟未登录的浏览者：浏览商品、看详情、按分类筛选。"""
    weight = 7
    wait_time = between(1, 3)

    def on_start(self):
        # 每个虚拟用户用独立 IP（绕过 IP 限流，模拟真实多用户场景）
        self.client.headers.update({"X-Forwarded-For": _next_fake_ip()})
        self.product_ids = _ensure_product_ids(self.client)
        self.partner_id = _ensure_partner_id(self.client)

    # ── 商品浏览（高频）──
    @task(10)
    def list_products(self):
        self.client.get("/products", name="GET /products")

    @task(3)
    def list_filter_category(self):
        cat = random.choice(
            ["Textbooks", "Electronics", "Furniture", "Clothing", "Kitchen"]
        )
        self.client.get(
            f"/products?category={cat}",
            name="GET /products?category=*",
        )

    @task(2)
    def list_filter_sustainable(self):
        self.client.get(
            "/products?sustainable=true",
            name="GET /products?sustainable=true",
        )

    @task(2)
    def list_filter_price(self):
        self.client.get(
            "/products?min_price=10&max_price=100",
            name="GET /products?price-range",
        )

    @task(2)
    def list_search(self):
        self.client.get(
            "/products?search=test",
            name="GET /products?search=*",
        )

    @task(5)
    def view_product_detail(self):
        if self.product_ids:
            pid = random.choice(self.product_ids)
            self.client.get(f"/products/{pid}", name="GET /products/{id}")

    @task(2)
    def get_categories(self):
        self.client.get("/products/categories", name="GET /products/categories")

    @task(1)
    def get_trending(self):
        self.client.get("/products/trending", name="GET /products/trending")

    @task(1)
    def view_seller_products(self):
        if self.partner_id:
            self.client.get(
                f"/products/seller/{self.partner_id}",
                name="GET /products/seller/{id}",
            )

    # ── 监控级（低频但永远要快）──
    @task(1)
    def homepage(self):
        self.client.get("/", name="GET /")

    @task(1)
    def health(self):
        self.client.get("/health", name="GET /health")


# =====================================================
# 已登录用户（30% weight）
# =====================================================
class AuthenticatedUser(HttpUser):
    """模拟登录用户读取自己的数据。"""
    weight = 3
    wait_time = between(2, 5)

    def on_start(self):
        # 每个虚拟用户：独立邮箱 + 独立伪 IP（双重避开限流）
        self.client.headers.update({"X-Forwarded-For": _next_fake_ip()})
        my_email = _next_account()
        with self.client.post(
            "/auth/login",
            json={"email": my_email, "password": TEST_PASSWORD},
            name="POST /auth/login (warmup)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                token = resp.json()["access_token"]
                self.headers = {"Authorization": f"Bearer {token}"}
                resp.success()
            else:
                self.headers = {}
                resp.failure(f"login failed: {resp.status_code} ({my_email})")
        self.product_ids = _ensure_product_ids(self.client)

    # ── 个人信息 ──
    @task(5)
    def get_me(self):
        self.client.get("/auth/me", headers=self.headers, name="GET /auth/me")

    # ── 收藏 ──
    @task(3)
    def list_favorites(self):
        self.client.get("/favorites", headers=self.headers, name="GET /favorites")

    # ── 我的商品 ──
    @task(2)
    def list_my_products(self):
        self.client.get(
            "/products/user/me",
            headers=self.headers,
            name="GET /products/user/me",
        )

    @task(2)
    def view_my_history(self):
        self.client.get(
            "/products/history/me",
            headers=self.headers,
            name="GET /products/history/me",
        )

    # ── 消息 ──
    @task(3)
    def list_conversations(self):
        self.client.get(
            "/messages/conversations",
            headers=self.headers,
            name="GET /messages/conversations",
        )

    @task(2)
    def messages_unread_count(self):
        self.client.get(
            "/messages/unread-count",
            headers=self.headers,
            name="GET /messages/unread-count",
        )

    # ── 通知 ──
    @task(3)
    def list_notifications(self):
        self.client.get(
            "/notifications",
            headers=self.headers,
            name="GET /notifications",
        )

    @task(3)
    def notification_unread(self):
        self.client.get(
            "/notifications/unread-count",
            headers=self.headers,
            name="GET /notifications/unread-count",
        )

    # ── 评价 ──
    @task(1)
    def my_reviews(self):
        self.client.get(
            "/reviews/me",
            headers=self.headers,
            name="GET /reviews/me",
        )

    # ── 订单 ──
    @task(1)
    def my_orders(self):
        self.client.get(
            "/orders",
            headers=self.headers,
            name="GET /orders",
        )


# =====================================================
# 测试结束时校验 CA2 性能目标
# =====================================================
@events.quitting.add_listener
def _check_ca2_target(environment, **_):
    stats = environment.stats.total
    p95 = stats.get_response_time_percentile(0.95)
    p99 = stats.get_response_time_percentile(0.99)
    avg = stats.avg_response_time
    rps = stats.total_rps
    fail_pct = (stats.num_failures / stats.num_requests * 100
                if stats.num_requests else 0)

    print("\n" + "=" * 60)
    print("CA2 Performance Verification")
    print("=" * 60)
    print(f"Total requests : {stats.num_requests:>10}")
    print(f"Failures       : {stats.num_failures:>10}  ({fail_pct:.2f}%)")
    print(f"Throughput     : {rps:>10.1f} req/s")
    print(f"Avg response   : {avg:>10.0f} ms")
    if p95 is not None:
        print(f"p95 response   : {p95:>10.0f} ms"
              f"   (CA2 target: <{CA2_P95_TARGET_MS} ms)")
    if p99 is not None:
        print(f"p99 response   : {p99:>10.0f} ms")
    print("-" * 60)

    if p95 is not None and p95 > CA2_P95_TARGET_MS:
        print(f"❌ p95 {p95:.0f}ms exceeds CA2 target {CA2_P95_TARGET_MS}ms")
        environment.process_exit_code = 1
    elif p95 is not None:
        print(f"✅ p95 {p95:.0f}ms meets CA2 target {CA2_P95_TARGET_MS}ms")
    print("=" * 60)
