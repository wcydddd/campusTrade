"""
End-to-end real Locust runner.

What it does (one command, no prior setup needed):
  1. Make sure local Docker mongo is running on :27017
  2. Seed campustrade_perf with 60 perfusers + 20 products (via seed_data.py)
  3. Spawn a *temporary* backend on :8001 pointed at local mongo
     (does NOT touch your Atlas backend on :8000)
  4. Wait until /health responds
  5. Run 3 real Locust scenarios in sequence:
       a) API @ 10 users for 60s   → report.html
       b) API @ 50 users for 60s   → report_50u.html
       c) AI  @ 1 user  for 30s    → ai_report.html  (~$0.01–0.05)
  6. Kill the temporary backend
  7. Leave mongo container running (use `docker stop mongo-perf` to stop)

Run from anywhere:
    /Users/wcy/miniconda3/envs/code/bin/python \
        /Users/wcy/Desktop/campusTrade-main/backend/perf_tests/run_locust_real.py

Skip the AI test (no OpenAI cost):
    ... run_locust_real.py --no-ai
"""
import argparse
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BACKEND   = Path(__file__).resolve().parent.parent
PERF_DIR  = BACKEND / "perf_tests"
PYTHON    = "/Users/wcy/miniconda3/envs/code/bin/python"
LOCUST    = "/Users/wcy/miniconda3/envs/code/bin/locust"
UVICORN   = "/Users/wcy/miniconda3/envs/code/bin/uvicorn"
PERF_PORT = 8001
PERF_HOST = f"http://127.0.0.1:{PERF_PORT}"


def section(title):
    print()
    print("═" * 70)
    print(f"  {title}")
    print("═" * 70)


# ── 1. Mongo via Homebrew ──────────────────────────────────────────
def ensure_mongo():
    section("[1/5] Check local Homebrew mongo on :27017")
    # First just try to connect — fastest check
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(1)
    try:
        s.connect(("127.0.0.1", 27017))
        s.close()
        print("✓ mongod listening on :27017")
        return
    except Exception:
        s.close()
    # Not up — try `brew services start`
    if not shutil.which("brew"):
        sys.exit("ERROR: mongod not running on :27017 and brew not found. "
                 "Start mongo manually first.")
    print("mongod not responding — starting via brew services...")
    r = subprocess.run(
        ["brew", "services", "start", "mongodb-community"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        # Try @7.0 variant which is what user has
        subprocess.run(
            ["brew", "services", "start", "mongodb-community@7.0"],
            check=True,
        )
    time.sleep(2)
    print("✓ mongo started")


# ── 2. Seed ────────────────────────────────────────────────────────
def seed():
    section("[2/5] Seed campustrade_perf (60 users + 20 products)")
    r = subprocess.run(
        [PYTHON, str(PERF_DIR / "seed_data.py")],
        cwd=str(BACKEND),
    )
    if r.returncode != 0:
        sys.exit("seed_data.py failed")


# ── 3. Spawn temp backend ──────────────────────────────────────────
def start_backend():
    section(f"[3/5] Start temporary backend on :{PERF_PORT} → local mongo")
    env = os.environ.copy()
    env["MONGODB_URI"] = "mongodb://localhost:27017"
    env["MONGODB_DB_NAME"] = "campustrade_perf"
    proc = subprocess.Popen(
        [UVICORN, "main:app", "--host", "127.0.0.1", "--port", str(PERF_PORT)],
        cwd=str(BACKEND),
        env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    # Wait for /health
    for i in range(40):
        try:
            with urllib.request.urlopen(f"{PERF_HOST}/health", timeout=1) as r:
                if r.status == 200:
                    print(f"✓ backend healthy after {i*0.5:.1f}s")
                    return proc
        except Exception:
            time.sleep(0.5)
    proc.kill()
    sys.exit("Backend failed to start within 20s")


def stop_backend(proc):
    section("[5/5] Stop temporary backend")
    proc.send_signal(signal.SIGINT)
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    print("✓ backend stopped")


# ── 4. Locust scenarios ────────────────────────────────────────────
def run_locust(name, locustfile, users, spawn_rate, duration, html):
    print(f"\n--- {name}  (-u {users} -r {spawn_rate} -t {duration}) ---")
    cmd = [
        LOCUST, "-f", str(PERF_DIR / locustfile),
        "--headless",
        "-u", str(users), "-r", str(spawn_rate), "-t", duration,
        "--host", PERF_HOST,
        "--html", str(PERF_DIR / html),
    ]
    r = subprocess.run(cmd, cwd=str(BACKEND))
    if r.returncode != 0:
        print(f"⚠ locust exit code {r.returncode} (continuing)")


def run_all_locust(skip_ai=False):
    section("[4/5] Run real Locust scenarios")
    run_locust("API @ 10 users", "locustfile.py", 10, 2, "60s", "report.html")
    run_locust("API @ 50 users", "locustfile.py", 50, 5, "60s", "report_50u.html")
    if skip_ai:
        print("\n--- AI scenario SKIPPED (--no-ai) ---")
    else:
        run_locust("AI endpoint", "ai_locustfile.py", 1, 1, "30s", "ai_report.html")


# ── Main ───────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-ai", action="store_true",
                    help="Skip AI scenario (no OpenAI cost)")
    args = ap.parse_args()

    ensure_mongo()
    seed()
    proc = start_backend()
    try:
        run_all_locust(skip_ai=args.no_ai)
    finally:
        stop_backend(proc)

    print()
    print("═" * 70)
    print("  DONE. Fresh HTML reports written to:")
    print(f"    {PERF_DIR}/report.html       (10 users)")
    print(f"    {PERF_DIR}/report_50u.html   (50 users)")
    if not args.no_ai:
        print(f"    {PERF_DIR}/ai_report.html    (AI endpoint)")
    print("═" * 70)
    print("  (Local mongo still running — `brew services stop mongodb-community@7.0` to stop)")
    print("  (Test data lives in DB `campustrade_perf` — your Atlas `campustrade` is untouched)")


if __name__ == "__main__":
    main()
