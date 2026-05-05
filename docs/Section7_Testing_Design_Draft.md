# 7. Evaluation and Testing Design

> **Owners:** Wenhan Huang & Chenyang Wang

This chapter sets out the *design* of the evaluation and testing process for the
CampusTrade platform. Concrete results obtained by executing the design described
below are reported separately in Chapter 8 (Testing Results).

## 7.1 Overall Testing Strategy

CampusTrade is a multi-layer system spanning a React 19 single-page frontend, a
FastAPI/MongoDB backend that exposes 66 HTTP endpoints and a WebSocket channel,
and an external GPT-4o vision integration. To validate a system of this shape
with confidence we adopted a **layered testing strategy** informed by the
Testing Trophy model [1] rather than the classical pyramid. The trophy model
favours API-level integration tests over isolated unit tests for web
applications where most business logic resides inside route handlers tightly
coupled to the database, the HTTP layer and Pydantic validation; modern
in-memory MongoDB replacements (e.g. `mongomock-motor`) and ASGI transports
(e.g. `httpx.AsyncClient(ASGITransport(...))`) make integration tests run
nearly as fast as unit tests, eliminating the historical reason to prefer the
latter by volume.

Five distinct test layers were designed, each with a different objective,
tooling and pass criterion:

| Layer | Tooling | Objective |
|-------|---------|-----------|
| Unit | pytest | Validate pure functions in `utils/` (hashing, JWT, OTP, image processing) |
| API Integration | pytest + httpx + mongomock-motor | Validate every REST/WS endpoint end-to-end with stubbed externals |
| End-to-End | Cypress in real browser | Validate frontend ↔ backend full workflows |
| Model Accuracy | pytest + live OpenAI API | Validate GPT-4o category prediction on a labelled dataset |
| Performance | Locust against real backend + local MongoDB | Validate API and AI endpoint response time under load |

This structure is justified by two principles. First, *defects-per-test-cost*:
an integration test catches Pydantic-validation, business-logic, database and
serialisation defects in a single run, whereas the same coverage in pure unit
tests would require three or four times the test code. Second,
*confidence-per-layer*: end-to-end and performance tests provide guarantees
that integration tests by design cannot give (real browser interaction,
real network latency, real concurrency), and model-accuracy evaluation
provides a numeric guarantee for the AI feature that no other layer can
substitute.

## 7.2 Scope: System Aspects Covered

Test scope was derived from two complementary sources. *Top-down* coverage was
taken from the four Aims of the original CA2 proposal, ensuring that every
declared objective has corresponding automated tests. *Bottom-up* coverage was
taken from a chapter-by-chapter walk-through of the CampusTrade User Manual
(91 pages, 17 chapters), ensuring that every documented user-facing feature is
exercised. Table 7.1 summarises the resulting traceability.

**Table 7.1.** Traceability between system aspects and test categories.

| CA2 Aim | System Aspect | Primary Test Category | Pass Threshold |
|---------|--------------|------------------------|----------------|
| 1.1 | University email verification | Unit + API integration | 100 % |
| 1.2 | Password hashing + JWT | Unit + API integration | 100 % |
| 1.3 | Verified-only messaging / publishing | API integration + E2E | 100 % |
| 2 | Sustainability filter | API integration | 100 % |
| 3.1 | AI listing creation (title / desc / category) | API integration + E2E | 100 % |
| 3.2 | AI category prediction accuracy | Model accuracy evaluation | ≥ 80 % |
| 4.1 | Responsive UI | Component test (Vitest) | renders at 375/768/1024 px |
| 4.2 | Backend APIs | API integration | 100 % |
| 4.3 | Database schema | Implicit via API integration | 100 % |
| (NFR) | API performance | Locust | p95 < 200 ms @ 10 users |
| (NFR) | AI endpoint performance | Locust | p95 < 8 s |
| (NFR) | Login lockout under brute force | API integration | 429 after 5 failures |

System aspects deliberately *out of automated scope* are User Acceptance
Testing with real students (planned for the post-implementation phase, will
produce qualitative usability feedback) and full WebSocket business-logic
testing of `_handle_chat` / `_handle_read` (the protocol layer is verified;
the persistence side-effects are covered by the equivalent REST path to keep
the test design tractable).

## 7.3 Test Categories

This section details each category called out in the assignment template
(functional, permission, transaction-flow, UI, deployment) plus three
additional categories required to fully cover CampusTrade's design (E2E, AI
accuracy, performance).

### 7.3.1 Functional Testing (API Integration)

**Purpose.** Verify that every backend endpoint accepts valid input, returns
the documented response shape, persists the correct database state and
rejects malformed input with the appropriate HTTP error code.

**Scope.** All 66 endpoints across 12 route modules plus the two top-level
endpoints in `main.py` (`/`, `/health`). Each endpoint has at least one
*happy-path* test (success case) and one or more *failure-path* tests
(parameter error, resource not found, conflict, etc.).

**Method.** pytest with the `httpx.AsyncClient(transport=ASGITransport(app))`
pattern, which delivers requests directly to the FastAPI application without
starting a TCP server. MongoDB is replaced by `mongomock-motor`, an in-memory
implementation of the Motor async API; each test obtains a fresh database
instance through the `db` fixture in `tests/conftest.py`.

**Why critical.** Without this layer a regression in any single endpoint
would not be detected until manual UI testing or production. With 66
endpoints and 7 developers contributing, manual coverage cannot scale.

### 7.3.2 Permission and Access Control Testing

**Purpose.** Verify that the three-tier authorisation model (anonymous /
verified user / admin) is enforced consistently and that users cannot affect
data they do not own.

**Scope.** Every endpoint that uses `Depends(get_current_user)`,
`Depends(require_verified_user)` or `Depends(get_current_admin_user)` has at
least one negative test confirming that an unauthenticated, unverified, or
non-admin caller is rejected with HTTP 401/403. Cross-user isolation is
tested explicitly for favourites, messages, notifications, orders, and
admin-actionable products.

**Method.** A `make_user(role="user|admin", banned=False, verified=True)`
factory fixture creates the four user variants on demand; an
`auth_headers(user)` factory produces the corresponding `Authorization`
header. Each protected endpoint is tested at every relevant authorisation
level.

**Why critical.** Permission defects are the most common security vulnerability
class in web applications and have the highest blast radius — a single missing
`Depends` could allow any user to ban any other user. Tests in this category
caught the implicit requirement that `/auth/me/avatar` must remain accessible
to *any* authenticated user (not just verified ones), which would have been
easy to overconstrain.

### 7.3.3 Transaction Flow Testing

**Purpose.** Verify that the multi-step order lifecycle (pending → confirmed
→ completed, with cancellation paths from pending and confirmed) transitions
only along allowed edges, and that side effects on related entities (product
status, notifications, reviews) fire correctly.

**Scope.** All four states of the order state machine, all six legal
transitions, and the rejection of every illegal transition (e.g. a buyer
cannot mark an order *confirmed*; a seller cannot cancel a *completed*
order). The full pipeline (`create → confirm → complete`) is also exercised
once end-to-end as an integration test in `test_orders.py` and once again
through the real UI in `cypress/e2e/order.cy.js`.

**Method.** A `make_order(buyer, seller, status=...)` fixture seeds the
database with an order in any state, allowing isolated tests of each
transition. Cross-module side effects (the seller-notification on
`/orders/.../confirm`) are verified using the `notification_spy` fixture
described in §7.4.

**Why critical.** The order state machine is the platform's revenue-bearing
path; an incorrect transition could silently transfer ownership of products
or fail to compensate sellers.

### 7.3.4 UI / Component Testing

**Purpose.** Verify that React components render correctly, respond to user
input, validate forms client-side, and maintain global state via Context
correctly.

**Scope.** Form validation tests for the seven forms with non-trivial rules
(Register, Login, Forgot/Reset/Change Password, Publish/Edit Product); render
tests for the five reusable components in `src/components/`; smoke tests for
24 routed pages prioritised P0/P1/P2; tests for the three React Contexts
(Auth, Unread, WebSocket) covering token persistence, real-time updates and
log-out propagation; responsive breakpoint tests at 375 px, 768 px and 1024 px.

**Method.** Vitest with React Testing Library, jsdom environment, MSW for API
stubbing. Tests assert on user-visible behaviour (text, role, label) rather
than internal implementation, following the Testing Library guiding
principle.

**Why critical.** UI defects directly affect every user; client-side
validation defects let invalid data reach the server, increasing the load on
backend validation and degrading user experience with confusing error
messages.

### 7.3.5 End-to-End Testing

**Purpose.** Verify that the frontend, backend and database remain consistent
under realistic user flows that span multiple HTTP requests and multiple user
sessions, executed in a real browser against an unmocked stack.

**Scope.** Six Cypress specifications covering the four workflows mandated by
the CA2 plan (Registration, AI Listing, Message, Search) plus two additional
high-value flows (Login, full Order lifecycle).

**Method.** Cypress 15 in headless Chromium, against a Vite dev server
(port 5173) and a uvicorn-served FastAPI backend (port 8000) connected to a
real local MongoDB instance. A `cy.apiLogin()` custom command obtains JWTs by
direct API calls to bypass UI typing latency; randomised `X-Forwarded-For`
headers spread requests across distinct virtual IPs to avoid the IP-based
rate limiter triggering between tests.

**Why critical.** Integration tests cannot detect mismatches between the
frontend's request shape and the backend's response shape, nor browser-level
issues such as CORS or cookie handling; only true end-to-end execution can.

### 7.3.6 AI Model Accuracy Evaluation

**Purpose.** Quantitatively verify that the GPT-4o category-prediction
feature meets the CA2 Aim 3.2 target of ≥ 80 % accuracy on a labelled image
set.

**Scope.** A balanced dataset of 50 product photographs across five visually
distinct categories (Clothing, Electronics, Kitchen, Sports, Textbooks),
ten images per category, organised as
`tests/ai_test_dataset/<Category>/*.png`. Every image is sent through the
production code path `utils.ai_helper.analyze_image()` with no mocking.

**Method.** A pytest module gated behind the environment variable
`RUN_AI_EVAL=1`, so that CI runs do not incur OpenAI charges by default. The
module enumerates the dataset, calls the live API for each image, compares
the returned category to the ground-truth directory name and reports both
overall accuracy and a per-category confusion summary.

**Why critical.** No other test category can verify that the AI integration
*does the right thing* on real photographs; integration tests only verify
the *plumbing* by mocking the AI response.

### 7.3.7 Performance and Load Testing

**Purpose.** Verify that the system meets the response-time targets specified
in CA2 Plan Table II (API p95 < 200 ms with 10 concurrent users; AI endpoint
p95 < 8 s) and that performance does not degrade catastrophically under
heavier load.

**Scope.** A primary `locustfile.py` exercising 22 read endpoints in a
70/30 anonymous-vs-authenticated traffic mix; a secondary `ai_locustfile.py`
exercising the AI analysis endpoint with a single user (to limit OpenAI
spend).

**Method.** Locust 2.43 running against the production code path with the
real backend (uvicorn) and a local MongoDB instance pre-seeded with 60
independent test accounts and 20 products. To produce isolated measurements
each virtual user is assigned a unique account from the pool *and* a unique
`X-Forwarded-For` header so that neither the IP-based nor the user-key-based
rate limiter is triggered.

**Why critical.** Performance defects often only surface under concurrent
load and cannot be detected by single-request testing. The 50-user run
(five times the planned baseline) provides headroom validation that the
system can absorb realistic peak traffic.

### 7.3.8 Deployment Smoke Testing

**Purpose.** Verify that a freshly deployed instance responds to monitoring
probes and serves the OpenAPI documentation, providing a fast first signal
that deployment succeeded.

**Scope.** Two monitoring endpoints in `main.py`: `GET /` (welcome banner)
and `GET /health` (returns `{"status": "healthy", "service": "..."}`). The
health endpoint must remain accessible without authentication so that
external monitoring services can probe it without holding a JWT.

**Method.** Pytest with the standard `client` fixture; covered by
`tests/test_main.py`. In production these endpoints will additionally be
probed by uptime-monitoring software at one-minute intervals.

**Why critical.** A deployment that brings up the process but cannot serve
basic requests (e.g. due to a missing environment variable, database
connection failure or static-asset mis-mount) can otherwise go undetected
until the first user attempts a transaction.

## 7.4 Test Data and Environment Design

Test design follows the principle of **deterministic isolation**: each test
must produce the same result regardless of execution order or shared state.
Three design decisions implement this principle.

**In-memory database.** Production MongoDB is replaced in pytest by
`mongomock-motor`, which exposes the Motor async API on top of an in-memory
document store. The `db` fixture in `tests/conftest.py` patches
`utils.database.db.client` per test so each case receives a fresh database;
no state leaks between cases.

**Mocked external services.** A single `_mute_external` autouse fixture
replaces SMTP/Resend (no real emails sent), the OpenAI API (returns a fixed
canned analysis result), GridFS image storage (returns synthetic URLs), the
WebSocket push (`manager.send_personal` becomes a no-op), the rate limiter
(bypassed so test order does not cause throttling), and the notification
helpers. Tests that specifically need to assert on these side effects use
opt-in fixtures: `notification_spy` records every `create_notification` call
into a list, and `fake_gridfs` provides an in-memory file store with the
GridFS API surface.

**Test data factories.** Rather than hand-crafting database documents in each
test, factory fixtures (`make_user`, `make_product`, `make_order`,
`make_review`, `make_notif`) create the relevant entity in one call with
sensible defaults, accepting overrides for the fields under test. This keeps
test bodies short (typically 10–20 lines) and ensures database documents
remain consistent with the production schema.

**Account and IP pools for performance and E2E.** For Locust and Cypress,
where a single shared test account would trigger rate limiting,
`perf_tests/seed_data.py` creates a pool of 60 independent accounts
(`perfuser0..perfuser59@university.edu`). Each virtual user (Locust) or
test case (Cypress) draws a unique account from the pool and additionally
sends a randomised `X-Forwarded-For` header to bypass the IP-dimension
throttle. This change reduced an initial 6.4 % failure rate (caused
entirely by login throttling) to a clean 0 % under five-times-baseline
load.

## 7.5 Acceptance Criteria

A test case is considered *passed* if and only if it terminates with no
assertion failure and no uncaught exception. A category is considered
*meeting target* according to Table 7.2.

**Table 7.2.** Acceptance criteria per test category.

| Category | Pass Criterion | Numerical Target |
|----------|----------------|------------------|
| Unit | All cases pass | 100 % |
| API Integration | All cases pass | 100 % |
| End-to-End | All Cypress specs green | 100 % |
| AI Accuracy | Category prediction matches ground-truth label | ≥ 80 % |
| Performance (API @ 10 users) | p95 latency below threshold | < 200 ms |
| Performance (API @ 50 users) | Stability under 5× baseline | 0 failures |
| Performance (AI) | p95 latency below threshold | < 8 s |
| Deployment | `/health` returns 200 with `status=healthy` | 100 % |

The full execution log, per-test breakdown, performance graphs and AI
accuracy table are documented separately in Chapter 8 (Testing Results).
The complete suite is reproducible from a fresh clone with three commands:

```bash
cd backend && pytest                                   # 328 cases
RUN_AI_EVAL=1 pytest tests/test_ai_accuracy.py        # 50 images
cd frontend && npx cypress run                         # 20 specs
```

## References

[1] K. C. Dodds, "Write tests. Not too many. Mostly integration.",
    https://kentcdodds.com/blog/write-tests, 2019.

[2] FastAPI documentation, "Testing",
    https://fastapi.tiangolo.com/tutorial/testing/.

[3] Cypress documentation, "Real World Testing",
    https://learn.cypress.io.

[4] Locust documentation, "Writing a locustfile",
    https://docs.locust.io/en/stable/writing-a-locustfile.html.
