"""
Separate AI endpoint perf test (POST /ai/analyze).

⚠️  Costs real money — run with VERY small parameters to limit charges.
   Each call ~$0.01-0.02. We aim for ~5-10 total calls per run = ~$0.10.

Run:
    locust -f perf_tests/ai_locustfile.py --headless \\
        -u 1 -r 1 -t 30s \\
        --host http://127.0.0.1:8000 \\
        --html perf_tests/ai_report.html

Why -u 1 / -t 30s ?
  - 1 user × 30 seconds × wait(3-5s) ≈ 5-10 calls total
  - Stays under OpenAI's free-tier RPM limit (3 RPM for new accounts)
  - Total cost <= $0.20

CA2 target: AI Endpoint < 8s response.
"""
from pathlib import Path
from locust import HttpUser, task, between, events

TEST_EMAIL = "perftest@university.edu"
TEST_PASSWORD = "PerfTest123!"
TEST_IMAGE = Path(__file__).parent / "test_image.png"

CA2_AI_TARGET_MS = 8000  # 8 seconds


class AIAnalyzeUser(HttpUser):
    wait_time = between(3, 5)

    def on_start(self):
        # Warmup login
        with self.client.post(
            "/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
            name="POST /auth/login (warmup)",
            catch_response=True,
        ) as resp:
            if resp.status_code != 200:
                resp.failure(f"login failed {resp.status_code}")
                self.headers = {}
                self.image_bytes = b""
                return
            self.headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
            resp.success()

        # Cache test image once
        with open(TEST_IMAGE, "rb") as f:
            self.image_bytes = f.read()

    @task
    def analyze_image(self):
        if not self.image_bytes:
            return
        self.client.post(
            "/ai/analyze",
            headers=self.headers,
            files={"file": ("test.png", self.image_bytes, "image/png")},
            name="POST /ai/analyze",
        )


@events.quitting.add_listener
def _check_ai_target(environment, **_):
    stats = environment.stats.get("POST /ai/analyze", "POST")
    if stats is None or stats.num_requests == 0:
        print("\n[ai-perf] No /ai/analyze calls recorded — skip target check.")
        return

    p95 = stats.get_response_time_percentile(0.95)
    avg = stats.avg_response_time
    print("\n" + "=" * 60)
    print("CA2 AI Endpoint Performance Verification")
    print("=" * 60)
    print(f"AI calls       : {stats.num_requests}")
    print(f"Avg response   : {avg:>10.0f} ms")
    if p95 is not None:
        print(f"p95 response   : {p95:>10.0f} ms"
              f"   (CA2 target: <{CA2_AI_TARGET_MS} ms = 8s)")
    print("-" * 60)
    if p95 is not None and p95 > CA2_AI_TARGET_MS:
        print(f"❌ p95 {p95:.0f}ms exceeds CA2 AI target {CA2_AI_TARGET_MS}ms")
        environment.process_exit_code = 1
    elif p95 is not None:
        print(f"✅ p95 {p95:.0f}ms meets CA2 AI target {CA2_AI_TARGET_MS}ms")
    print("=" * 60)
