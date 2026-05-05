# Chapter X: Testing and Evaluation Design

## X.1 Overview and Strategy

The CampusTrade platform is a multi-layer system spanning a React 19 single-page
frontend, a FastAPI/MongoDB backend exposing 66 HTTP endpoints plus a WebSocket
channel, and an external GPT-4o vision model integration. To deliver this with
confidence we adopted a **layered testing strategy** mapped to the *Testing Trophy*
model [1] rather than the classical pyramid, since modern web applications keep most
of their business logic inside route handlers tightly coupled to the database and
HTTP layer, making integration tests substantially more cost-effective per defect
caught than pure unit tests.

Five distinct test categories were designed, each with a different objective,
tooling and pass criterion:

| Layer | Tooling | Purpose | CA2 Aim covered |
|-------|---------|---------|-----------------|
| Unit Tests | pytest | Validate pure functions in `utils/` | 1.1, 1.2 |
| API Integration Tests | pytest + httpx ASGITransport + mongomock-motor | Validate every REST/WS endpoint end-to-end | 1.1–1.3, 2, 3.1, 4.2, 4.3 |
| End-to-End Tests | Cypress in real browser | Validate frontend ↔ backend full workflows | 1.3, 4.1 |
| Model Accuracy Evaluation | pytest + live OpenAI API | Validate AI category prediction accuracy on labelled images | 3.2 |
| Performance Tests | Locust against real backend + local MongoDB | Validate API and AI endpoint response times under load | non-functional |

Together these five layers exercise every documented user-facing feature in the
CampusTrade User Manual (17 chapters) and every Aim listed in the original CA2
proposal.

## X.2 Backend Testing (pytest)

### X.2.1 Methodology

The backend test suite uses **API integration tests** as its primary coverage
mechanism. Each test sends a real HTTP request through `httpx.AsyncClient` with an
`ASGITransport` adapter that delivers the request directly to the FastAPI
application without starting a TCP server. This approach exercises the full request
pipeline — routing, dependency injection, Pydantic validation, business logic and
data access — while remaining faster than starting a subprocess.

MongoDB persistence is replaced by `mongomock-motor`, which exposes the Motor
async API on top of an in-memory document store. The `db` fixture in
`tests/conftest.py` patches `utils.database.db.client` per test, so every test
case receives an isolated in-memory database instance with no risk of pollution
between tests.

External services that would otherwise prevent offline execution are stubbed in a
single `_mute_external` autouse fixture:

- SMTP / Resend email senders → no-op coroutines
- OpenAI vision API → returns canned analysis result
- GridFS image storage → returns synthetic URLs
- WebSocket push (`manager.send_personal`) → no-op
- Rate limiter → bypassed (so independent test cases do not interfere)
- Notification helpers → no-op

The unit-test layer sits underneath this and tests pure functions directly in
`tests/test_utils.py` and `tests/test_image_service.py`, covering password hashing,
JWT round-trip, university-email validation, OTP generation and EXIF-stripping
image processing. These tests do not need any fixture and run in well under a
second.

### X.2.2 Cross-Module Verification via Spy Pattern

Several user-visible features depend on side-effects that span multiple modules
(e.g. placing an order should notify the seller, and dropping a price should
notify every user who has favourited the product). These cannot be verified by
asserting HTTP status codes alone. We therefore introduced a `notification_spy`
fixture that replaces the noop notification mock with a recording double:

```python
async def _spy(user_id, ntype, title, body, link=None, meta=None):
    calls.append({...})

monkeypatch.setattr("routes.orders.create_notification", _spy)
monkeypatch.setattr("routes.products.create_notification", _spy)
monkeypatch.setattr("routes.notifications.create_notification", _spy)
```

Tests then assert on the recorded call list — for example, that exactly one
`product_takedown` notification reaches the seller after an administrator removes
a listing, or that two `price_drop` notifications are dispatched (one per
favouriter) when an item's price is reduced. This pattern caught one real
documentation/code inconsistency (login lockout duration: documented as 5 minutes,
implemented as 15 minutes).

### X.2.3 Coverage Summary

The final pytest suite contains **328 test cases across 15 modules**, all passing
in approximately 70 seconds on a single laptop. Test cases are organised by route
file, with class-based grouping that mirrors the endpoint and an additional
`TestNotificationSideEffects` class per module for cross-module spy assertions.

| Module | Endpoints | Tests |
|--------|-----------|-------|
| `routes/auth.py` | 11 | 39 |
| `routes/products.py` | 13 | 51 |
| `routes/favorites.py` | 3 | 14 |
| `routes/orders.py` | 4 | 31 |
| `routes/reviews.py` | 3 | 17 |
| `routes/messages.py` | 5 | 20 |
| `routes/notifications.py` | 6 | 22 |
| `routes/reports.py` | 1 | 8 |
| `routes/admin.py` | 12 | 41 |
| `routes/images.py` | 1 | 5 |
| `routes/ai.py` | 4 | 19 |
| `routes/ws.py` | 1 | 10 |
| `main.py` | 2 | 3 |
| `utils/security.py` + `utils/otp.py` (unit) | — | 23 |
| `utils/image_service.py` (unit) | — | 19 |
| **Total** | **66** | **328** |

## X.3 Frontend Testing (Vitest + React Testing Library)

The frontend suite is being delivered alongside the backend tests and follows the
same structural decisions: Vitest provides a Jest-compatible runner that integrates
natively with the existing Vite build, React Testing Library encourages assertions
on user-visible behaviour rather than implementation details, and Mock Service
Worker (MSW) is used to stub backend responses inside component tests.

The plan covers seven form-validation specifications (Register, Login, Forgot
Password, Reset Password, Change Password, Publish Product, Edit Product), the
five reusable components in `src/components/`, three React Contexts (Auth, Unread,
WebSocket) that hold global state, and the central `api.js` HTTP wrapper. Page-level
smoke tests cover the 24 routed pages, with priority assigned to the seven
high-traffic pages (Home, Login, Register, ProductDetail, PublishProduct, Chat,
MyOrders) before lower-traffic management pages. Responsive breakpoint tests at
375 px, 768 px and 1024 px verify the user-manual's CA2 Aim 4.1 commitment of a
mobile-friendly UI.

This frontend layer is owned by a separate team member; the testing handover
document at `frontend/TESTING_TASKS.pdf` provides full specifications, code
templates and acceptance criteria.

## X.4 End-to-End Testing (Cypress)

The end-to-end layer runs the full system in a real Chromium browser against an
unmocked backend connected to a local MongoDB instance. This validates that the
React frontend, the FastAPI service and the database remain consistent under
realistic user flows that span multiple HTTP requests, multiple sessions, and
real-time WebSocket interactions.

Six specification files were authored, exceeding the four workflows mandated by
the original CA2 plan (Table I):

| Spec | Workflow | Tests |
|------|----------|-------|
| `registration.cy.js` | Account registration with university-email validation | 5 |
| `login.cy.js` | Sign-in, JWT persistence, error handling | 4 |
| `ai_listing.cy.js` | Photo upload → AI analysis (live OpenAI) → publish | 2 |
| `message.cy.js` | Verified-only messaging with cross-account verification | 3 |
| `search.cy.js` | Keyword and price-range filtering | 3 |
| `order.cy.js` | Buyer places order → seller confirms → buyer completes | 3 |
| **Total** | | **20** |

A custom Cypress command `cy.apiLogin()` injects authenticated tokens via direct
API calls to bypass the login UI and avoid triggering the rate limiter; randomised
`X-Forwarded-For` headers are sent with every login so that Cypress's repeated
calls from a single host do not exceed the IP-based throttle. The complete suite
finishes in 25 seconds with zero flaky tests.

## X.5 AI Model Accuracy Evaluation

CA2 Aim 3.2 requires the AI category-suggestion feature to achieve at least 80 %
accuracy on a 50-image test set. Because this evaluation requires real GPT-4o calls
that incur cost, it is gated behind the environment variable `RUN_AI_EVAL=1` and
excluded from the default CI run.

The evaluation script in `tests/test_ai_accuracy.py` enumerates the labelled
dataset under `tests/ai_test_dataset/<Category>/`, where the directory name is
treated as the ground-truth label. For each image the script invokes
`utils.ai_helper.analyze_image()` against the live OpenAI API, compares the
returned category against the directory label, and tallies overall and
per-category accuracy.

The evaluation was executed once on a balanced dataset of 50 images (5 categories
× 10 images: Clothing, Electronics, Kitchen, Sports, Textbooks). All 50 images
were classified correctly, yielding 100.00 % accuracy — comfortably above the
80 % requirement. The full per-category breakdown and total runtime
(141 seconds, approximately US $0.08) are recorded in §5 of the test report.

## X.6 Performance Testing (Locust)

Performance targets specified in the CA2 plan (API response p95 < 200 ms with 10
concurrent users; AI endpoint p95 < 8 s) were verified using Locust. To produce
realistic measurements the testing environment was switched from cloud MongoDB
Atlas to a local MongoDB community server, removing wide-area network latency
that would otherwise dominate the response time. The backend was started under
uvicorn against a freshly seeded `campustrade_perf` database containing 60
independent test accounts and 20 sample products.

Two locustfiles were authored. The primary `locustfile.py` defines two user
classes with a 70/30 weighting between anonymous browsers (11 read-only
endpoints) and authenticated users (11 authenticated endpoints), simulating a
realistic browse-heavy traffic mix. The secondary `ai_locustfile.py` exercises
only the AI endpoint with a single user.

To avoid contaminating the measurement, every virtual user is assigned a
distinct test account from the 60-account pool and a unique
`X-Forwarded-For` header so that neither the user-key nor the IP-based rate
limiter is triggered. This change took the 50-user run from a misleading 6.4 %
failure rate (caused entirely by login throttling) to a clean 0 % failures.

Three runs were recorded:

| Run | Users | Duration | Requests | Failures | p95 | CA2 Target |
|-----|-------|----------|----------|----------|-----|------------|
| Baseline | 10 | 60 s | 257 | 0 | 12 ms | < 200 ms ✓ |
| Heavy | 50 | 60 s | 1246 | 0 | 32 ms | < 200 ms ✓ |
| AI | 1 | 30 s | 4 calls | 0 | 5 300 ms | < 8 s ✓ |

The system meets every performance target with substantial headroom; even at five
times the planned baseline load p95 latency is one-sixth of the threshold.

## X.7 Continuous Verification of Documented Behaviour

The 91-page CampusTrade User Manual was used as a final acceptance checklist.
Each chapter (Account & Login, Profile, Browse & Search, Product Release,
Favourites, Browsing History, Orders, Chat, Notifications, Ratings, Reporting,
Seller Homepage, AI Quota, Logout, Administrator Functions, Safety) was traced
to corresponding test cases. The trace surfaced two gaps not previously noticed:
the 60-second cooldown on `/auth/forgot-password` (now covered by
`test_forgot_password_cooldown_silently_skips_resend`) and the deletion side
effect when a user removes images during product editing (now covered by
`test_edit_product_deletes_removed_images` using the spy pattern). It also
identified one documentation/code inconsistency — the user manual states a
five-minute lockout while the code uses fifteen minutes — which has been logged
for the team to reconcile before final release.

## X.8 Limitations and Future Work

Two areas of the system remain outside the current automated coverage. The
WebSocket *business* logic (`_handle_chat`, `_handle_read`) is verified at the
protocol layer (auth, ping, malformed messages) but its persistence side-effects
are tested only via the equivalent REST path, since instrumenting Cypress for a
real WebSocket session interleaved with database assertions adds substantially
more complexity than the marginal benefit. User Acceptance Testing with real
campus students is scheduled for the post-implementation phase and will produce
qualitative usability feedback rather than additional automated assertions.

Performance testing was conducted on a single laptop against a single MongoDB
instance and therefore reports best-case latencies. A future deployment to a
shared cloud environment should re-run the Locust suite to validate behaviour
under shared-tenant resource constraints.

## X.9 Reproducibility

All test artefacts are stored in the project repository:

- `backend/tests/` — pytest test files (16 specs, 328 cases) and `conftest.py`
- `backend/tests/test_report.pdf` — generated test report (16 sections, includes
  per-test breakdown, performance graphs, AI accuracy table)
- `backend/perf_tests/` — Locust files and seed script
- `frontend/cypress/` — Cypress E2E specifications and fixtures
- `frontend/TESTING_TASKS.pdf` — frontend-test specification handover document

The full suite can be reproduced from a fresh clone with three commands:

```bash
# Backend pytest (322 cases)
cd backend && pytest

# AI accuracy evaluation (50 cases, requires OPENAI_API_KEY)
RUN_AI_EVAL=1 pytest tests/test_ai_accuracy.py

# Cypress E2E (20 cases, requires backend + frontend running)
cd frontend && npx cypress run
```

---

## References

[1] K. C. Dodds, "Write tests. Not too many. Mostly integration.",
    https://kentcdodds.com/blog/write-tests, 2019.

[2] FastAPI documentation, "Testing", https://fastapi.tiangolo.com/tutorial/testing/.

[3] Cypress documentation, "Real World Testing with Cypress",
    https://learn.cypress.io.

[4] OpenAI, "Vision: gpt-4o image understanding",
    https://platform.openai.com/docs/guides/vision.

[5] Locust documentation, "Writing a locustfile",
    https://docs.locust.io/en/stable/writing-a-locustfile.html.
