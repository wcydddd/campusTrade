# CampusTrade Performance Testing (Locust)

Performance tests for **CA2 Aim 4 / Table II** acceptance criteria:

| Target           | Spec              | Tool   |
| ---------------- | ----------------- | ------ |
| API response p95 | < 200 ms          | Locust |
| AI endpoint p95  | < 8 s             | Locust |

The 322 pytest tests verify **functional correctness** (does it return the right data).
Locust verifies **performance** (does it respond fast enough under load).

---

## Architecture

```
┌──────────┐   HTTP    ┌──────────┐   Mongo    ┌──────────┐
│  Locust  │ ────────▶ │  uvicorn │ ─────────▶ │ MongoDB  │
│ (driver) │           │ (FastAPI)│            │ (local)  │
└──────────┘           └──────────┘            └──────────┘
```

Three separate processes — one terminal each.

---

## One-time setup

### 1. Install Locust

```bash
conda activate code
pip install locust
```

### 2. Make sure Docker is running

(Mac: open Docker Desktop. Or install via `brew install --cask docker`.)

---

## Running a perf test (4 steps)

### Step 1 — Start local MongoDB

```bash
docker run -d -p 27017:27017 --name mongo-perf mongo:6
```

If you've run it before, restart instead:
```bash
docker start mongo-perf
```

To completely wipe and restart:
```bash
docker rm -f mongo-perf
docker run -d -p 27017:27017 --name mongo-perf mongo:6
```

### Step 2 — Seed test data

```bash
cd /Users/wcy/Desktop/campusTrade-main/backend
python perf_tests/seed_data.py
```

Expected output:
```
[seed] ✅ Seeded campustrade_perf
       Test user : perftest@university.edu / PerfTest123!
       Products  : 20
       Favorites : 5
       Messages  : 3
```

### Step 3 — Start backend pointing at local Mongo

**New terminal**:

```bash
cd /Users/wcy/Desktop/campusTrade-main/backend
conda activate code
MONGODB_URI=mongodb://localhost:27017 \
MONGODB_DB_NAME=campustrade_perf \
uvicorn main:app --host 127.0.0.1 --port 8000
```

Wait for `Uvicorn running on http://127.0.0.1:8000`.

Sanity check (in yet another terminal):
```bash
curl http://127.0.0.1:8000/health
# {"status":"healthy","service":"campustrade-api"}
```

### Step 4 — Run Locust

**Another terminal**:

#### A. Main perf test (CA2 spec: 10 users, 60s)

```bash
cd /Users/wcy/Desktop/campusTrade-main/backend
locust -f perf_tests/locustfile.py --headless \
    -u 10 -r 2 -t 60s \
    --host http://127.0.0.1:8000 \
    --html perf_tests/report.html
```

Flags:
- `-u 10`: 10 concurrent users (CA2 baseline)
- `-r 2`: ramp up 2 users/sec
- `-t 60s`: run for 60 seconds
- `--html report.html`: generate detailed HTML report

#### B. Heavier load smoke test (50 users)

```bash
locust -f perf_tests/locustfile.py --headless -u 50 -r 5 -t 60s \
    --host http://127.0.0.1:8000
```

#### C. AI endpoint test (separate, costs ~$0.10)

```bash
locust -f perf_tests/ai_locustfile.py --headless \
    -u 1 -r 1 -t 30s \
    --host http://127.0.0.1:8000 \
    --html perf_tests/ai_report.html
```

#### D. Interactive web UI mode (for exploration)

```bash
locust -f perf_tests/locustfile.py --host http://127.0.0.1:8000
```

Then open http://localhost:8089. Set users/spawn rate/duration in the form.

---

## Expected output

```
 Name                                   # reqs   # fails  Avg  p50  p95  RPS
 GET /                                       45        0    8    7    14   0.8
 GET /health                                 47        0    7    6    11   0.8
 GET /products                              468        0   85   82   148  7.8
 GET /products/{id}                         234        0   97   93   170  3.9
 GET /products/categories                    93        0    9    8    13   1.6
 GET /products/trending                      47        0   42   40    71   0.8
 GET /products?category=*                   141        0   88   85   152  2.4
 ...
 ──────────────────────────────────────────────────────────────────────────
 Aggregated                                1582        0   78   75   162  26.4

============================================================
CA2 Performance Verification
============================================================
Total requests :       1582
Failures       :          0  (0.00%)
Throughput     :       26.4 req/s
Avg response   :         78 ms
p95 response   :        162 ms   (CA2 target: <200 ms)
p99 response   :        198 ms
------------------------------------------------------------
✅ p95 162ms meets CA2 target 200ms
============================================================
```

---

## Cleanup

After perf testing:

```bash
# Stop backend (Ctrl+C in its terminal)

# Stop & remove Mongo container
docker rm -f mongo-perf
```

---

## Troubleshooting

| Symptom                                     | Cause / Fix                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `Connection refused` on Locust start        | Backend not running. Step 3.                                             |
| All requests fail with 401                  | DB not seeded with test user. Step 2.                                    |
| `Failed to connect to mongodb://localhost`  | Mongo container not running. `docker ps` to verify.                      |
| Backend connects to Atlas instead of local  | `MONGODB_URI` env var not set. Re-export and restart uvicorn.            |
| AI endpoint p95 >> 8s                       | OpenAI rate limit. Check `Retry-After` headers. Reduce `-u 1 -t 20s`.    |
| `bcrypt` warnings during seed               | Cosmetic. Ignore.                                                        |
| HTML report missing                         | Ensure `--html perf_tests/report.html` flag passed.                      |

---

## Files in this directory

| File                | Purpose                                            |
| ------------------- | -------------------------------------------------- |
| `seed_data.py`      | Populate local Mongo with deterministic test data  |
| `locustfile.py`     | Main perf test (CA2 baseline, free)                |
| `ai_locustfile.py`  | AI endpoint perf test (separate, costs money)      |
| `test_image.png`    | Single test image used by AI test                  |
| `report.html`       | (generated) HTML perf report                       |
| `ai_report.html`    | (generated) HTML AI perf report                    |
