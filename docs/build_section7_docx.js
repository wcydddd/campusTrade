/**
 * Build §7 "Evaluation and Testing Design" as a Word .docx file.
 * Layered structure (5 backend layers + 1 frontend) — matches test_report.pdf.
 * Run: node build_section7_docx.js
 */
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat,
} = require("docx");

// ── Style helpers ───────────────────────────────────────────
const FONT = "Calibri";
const border = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const cellBorders = { top: border, bottom: border, left: border, right: border };

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: FONT, size: 22, ...opts })],
  });
}

function pRich(parts, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: parts.map(part =>
      new TextRun({
        text: part.text,
        font: FONT, size: 22,
        bold: part.bold, italics: part.italic,
      })
    ),
    ...opts,
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80 },
    children: [new TextRun({ text, font: FONT, size: 22 })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, font: FONT, size: 32, bold: true, color: "1F4E79" })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: "2E75B6" })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 220, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: "555555" })],
  });
}

function tableCaption(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, font: FONT, size: 20, italics: true, color: "555555" })],
  });
}

function makeTable(columnWidths, headers, rows) {
  const headerShading = { fill: "1F4E79", type: ShadingType.CLEAR };
  const totalWidth = columnWidths.reduce((a, b) => a + b, 0);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      borders: cellBorders,
      width: { size: columnWidths[i], type: WidthType.DXA },
      shading: headerShading,
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text: h, font: FONT, size: 20, bold: true, color: "FFFFFF" })],
      })],
    })),
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, i) => {
      const altShade = ri % 2 === 0 ? null : { fill: "F7F9FC", type: ShadingType.CLEAR };
      return new TableCell({
        borders: cellBorders,
        width: { size: columnWidths[i], type: WidthType.DXA },
        shading: altShade || undefined,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: String(cell), font: FONT, size: 20 })],
        })],
      });
    }),
  }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths,
    rows: [headerRow, ...dataRows],
  });
}

// helper: write a 4-paragraph layer description
function layer(num, title, purpose, scope, method, why) {
  return [
    h3(`7.3.${num} ${title}`),
    pRich([{ text: "Purpose. ", bold: true }, { text: purpose }]),
    pRich([{ text: "Scope. ", bold: true }, { text: scope }]),
    pRich([{ text: "Tools and method. ", bold: true }, { text: method }]),
    pRich([{ text: "Rationale. ", bold: true }, { text: why }]),
  ];
}

// ── Body content ────────────────────────────────────────────
const children = [];

children.push(h1("7. Evaluation and Testing Design"));
children.push(pRich([
  { text: "Owners: ", bold: true },
  { text: "Wenhan Huang & Chenyang Wang", italic: true },
]));
children.push(p(
  "This chapter sets out the design of the evaluation process for the CampusTrade " +
  "platform, as required by the design-document specification. It defines the testing " +
  "strategy, the layers along which testing is organised, the data and environment " +
  "design that makes the suite reproducible, and the acceptance criteria against which " +
  "the system is judged. Concrete results obtained by executing this design are " +
  "reported separately in Chapter 8."
));

// ── 7.1 Strategy ────────────────────────────────────────────
children.push(h2("7.1 Overall Testing Strategy"));
children.push(p(
  "CampusTrade combines a React frontend, a FastAPI/MongoDB backend with 66 HTTP " +
  "endpoints and a WebSocket channel, and a GPT-4o vision integration. To validate " +
  "this multi-layer system we followed the Testing Trophy model [1], which favours " +
  "API-level integration tests for web applications because most business logic lives " +
  "inside route handlers tied to the HTTP layer, validation and the database. Modern " +
  "tools (mongomock-motor for in-memory MongoDB, httpx.AsyncClient with ASGITransport " +
  "for in-process HTTP) make these tests run almost as fast as unit tests, removing " +
  "the traditional cost argument against them."
));
children.push(p(
  "This results in a layered design: a focused set of unit tests for genuinely pure " +
  "functions (cryptographic primitives, image transformations, OTP helpers); a large " +
  "API-integration suite as the primary safety net; end-to-end browser tests for full " +
  "user workflows; a model-accuracy evaluation for the AI feature; and load testing " +
  "for non-functional response-time requirements. A separate frontend component-test " +
  "layer (Vitest + React Testing Library) sits alongside the backend layers."
));
children.push(p(
  "The six resulting test layers are summarised in Table 7.1. Each row of the table " +
  "is described in detail in §7.3."
));

children.push(makeTable(
  [2200, 3300, 3860],
  ["Layer", "Tools", "Objective"],
  [
    ["Unit", "pytest", "Validate pure functions in utils/ (hashing, JWT, OTP, image processing)"],
    ["API Integration", "pytest + httpx ASGITransport + mongomock-motor", "Validate every REST/WS endpoint end-to-end with stubbed externals"],
    ["End-to-End", "Cypress in real browser (Chromium)", "Validate frontend ↔ backend full workflows"],
    ["Model Accuracy", "pytest + live OpenAI API", "Validate GPT-4o category prediction on a labelled dataset"],
    ["Performance", "Locust + real backend + local MongoDB", "Validate response time and stability under load"],
    ["Frontend Component", "Vitest + React Testing Library + jsdom", "Validate UI components, forms, and global state"],
  ]
));
children.push(tableCaption("Table 7.1. The six testing layers of CampusTrade."));

// ── 7.2 Scope ───────────────────────────────────────────────
children.push(h2("7.2 Test Scope"));
children.push(p(
  "Tests are organised by system module, mirroring the structure of the backend code " +
  "base. Table 7.2 lists every backend test module together with its test count, the " +
  "layers from Table 7.1 it draws on, and the CampusTrade feature it covers. Modules " +
  "labelled with a User-Manual chapter implement features documented in the User " +
  "Manual that go beyond the four CA2 Aims (e.g. favourites, notifications, reports, " +
  "administrator console); they receive the same testing rigour as Aim-driven features."
));

children.push(makeTable(
  [2300, 2400, 1100, 3560],
  ["Test module", "Feature covered", "Tests", "Layers used"],
  [
    ["test_auth.py", "Account, login, password reset, profile, avatar, lockout (Aim 1.1, 1.2)", "39", "Unit + API Integration"],
    ["test_products.py", "Listing CRUD, search, filter, AI publish, edit-snapshot (Aim 2, 3.1, 4.2, 4.3)", "51", "API Integration + cross-module spy"],
    ["test_favorites.py", "Favourites + price-drop alerts (Manual Ch 5)", "14", "API Integration + spy"],
    ["test_orders.py", "Order lifecycle: place / confirm / complete / cancel (Manual Ch 7)", "31", "API Integration + spy"],
    ["test_reviews.py", "Mutual rating after completed orders (Manual Ch 10)", "17", "API Integration"],
    ["test_messages.py", "Verified-only chat, REST persistence (Aim 1.3, Manual Ch 8)", "20", "API Integration"],
    ["test_notifications.py", "In-app notifications: bell, mark-read, clear-all (Manual Ch 9)", "22", "API Integration + spy"],
    ["test_reports.py", "User-driven content reporting (Manual Ch 11)", "8", "API Integration + spy"],
    ["test_admin.py", "Admin: ban / role / verify / takedown / approve (Manual Ch 15)", "41", "API Integration + spy"],
    ["test_images.py", "GridFS image streaming (Aim 4.3)", "5", "API Integration + fake-FS"],
    ["test_ai.py", "AI quota + analyze + analyze-and-save (Aim 3.1, 3.2)", "19", "API Integration"],
    ["test_ws.py", "WebSocket auth + protocol (Aim 1.3)", "10", "Synchronous TestClient"],
    ["test_main.py", "Health / root (Aim 4.4: Deployment)", "3", "API Integration (smoke)"],
    ["test_image_service.py", "EXIF strip, compress, thumbnail, validators", "19", "Unit"],
    ["test_utils.py", "Password hash, JWT, OTP, university-email check", "23", "Unit"],
    ["test_ai_accuracy.py", "AI category prediction on 50 labelled images (Aim 3.2)", "50 imgs", "Model Accuracy"],
    ["perf_tests/locustfile.py + ai_locustfile.py", "API and AI endpoint response time under load", "3 runs", "Performance"],
    ["frontend/cypress/e2e/*.cy.js", "Registration, Login, AI Listing, Message, Search, Order (Plan Table I)", "20", "End-to-End"],
    ["frontend/src/__tests__/* (planned)", "Forms, components, contexts, 24 pages, responsive (Aim 4.1)", "TBD", "Frontend Component"],
  ]
));
children.push(tableCaption("Table 7.2. Backend, end-to-end and frontend test modules with feature coverage."));

children.push(p(
  "System aspects deliberately excluded from automated coverage are User Acceptance " +
  "Testing with real students (planned for the post-implementation phase to gather " +
  "qualitative usability feedback) and the WebSocket business handlers _handle_chat / " +
  "_handle_read (the protocol layer is verified; the persistence side-effects are " +
  "already covered by the equivalent REST path, which keeps the test design tractable)."
));

// ── 7.3 Categories (= 6 layers) ─────────────────────────────
children.push(h2("7.3 Test Layers in Detail"));
children.push(p(
  "Each test layer introduced in Table 7.1 is described below in terms of its purpose, " +
  "scope, tooling and rationale. Together they give end-to-end coverage from the " +
  "lowest-level pure functions up to user-visible workflows in a real browser."
));

children.push(...layer(
  1, "Unit Tests",
  "Verify the correctness of small pure functions in isolation, with no I/O and no framework involvement.",
  "Forty-two tests across two files: tests/test_utils.py covers password hashing, JWT round-trip, OTP generation, and university-email validation; tests/test_image_service.py covers EXIF stripping, image compression, thumbnail generation and file-extension/size validators.",
  "Standard pytest with no fixtures or mocks. Each test imports the function under test directly and asserts on its return value or on a raised exception.",
  "These functions sit on the security-critical path (password storage, JWT issuance, image privacy via EXIF stripping) and are best validated in isolation, where any defect surfaces as a single sub-second failure rather than as an obscure HTTP-level error."
));

children.push(...layer(
  2, "API Integration Tests",
  "Verify that every backend endpoint accepts valid input, returns the documented response shape, persists the correct database state and rejects malformed input with the appropriate HTTP error code; verify that cross-module side effects (notifications, image deletion) actually fire.",
  "Two hundred and seventy-one tests across thirteen route modules plus main.py, covering all 66 documented endpoints. Each endpoint has at least one happy-path test and one or more failure-path tests (parameter error, resource not found, conflict, authorization). Five aspects are exercised at this layer: (a) functional CRUD; (b) authorization across the three-tier permission model (anonymous / verified / admin); (c) business state machines, principally the order lifecycle pending → confirmed → completed/cancelled; (d) cross-module side effects, verified using a notification_spy fixture that records every create_notification call; and (e) deployment smoke for the public /health and / endpoints.",
  "pytest with the httpx.AsyncClient(transport=ASGITransport(app)) pattern, which delivers requests directly to the FastAPI application without starting a TCP server. MongoDB is replaced by mongomock-motor; each test obtains a fresh database instance through the db fixture in tests/conftest.py. External services (SMTP, OpenAI, GridFS, WebSocket push, rate limiter) are replaced by no-op or canned-response stubs in a single _mute_external autouse fixture; tests that need to assert on those side effects opt in to dedicated spy or fake fixtures.",
  "API integration tests are the primary safety net of the suite. A single test exercises Pydantic validation, the route handler's business logic, the database schema and the JSON serialiser in one run, providing higher defect-detection-per-test than pure unit tests would. Catching a regression here costs seconds; the equivalent regression caught only in production would damage user trust."
));

children.push(...layer(
  3, "End-to-End Tests",
  "Verify that the React frontend, the FastAPI backend and the MongoDB database remain consistent under realistic user flows that span multiple HTTP requests and multiple sessions, executed in a real browser against an unmocked stack.",
  "Six Cypress specifications: registration.cy.js (account creation and university-email enforcement), login.cy.js (sign-in and JWT persistence), ai_listing.cy.js (real OpenAI photo upload and publish), message.cy.js (verified-only messaging across two accounts), search.cy.js (keyword and price-range filtering), and order.cy.js (full buyer-confirms-completes lifecycle).",
  "Cypress 15 in headless Chromium against a live Vite dev server (port 5173) and a uvicorn-served FastAPI backend (port 8000) connected to a real local MongoDB instance pre-seeded with sixty independent test accounts. A custom cy.apiLogin() command obtains JWTs by direct API calls to bypass UI-typing latency, and randomised X-Forwarded-For headers spread requests across distinct virtual IPs to avoid the per-IP rate limiter triggering between consecutive tests.",
  "Integration tests cannot detect mismatches between the frontend's request shape and the backend's response shape, nor browser-level issues such as CORS, cookie handling or render race conditions. Only true end-to-end execution catches these classes of defect."
));

children.push(...layer(
  4, "Model Accuracy Evaluation",
  "Quantitatively verify that the GPT-4o category-prediction feature meets the CA2 Aim 3.2 target of at least 80 % accuracy on a labelled image set.",
  "A balanced dataset of 50 product photographs across five visually distinct categories — Clothing, Electronics, Kitchen, Sports and Textbooks — with ten images per category, organised as tests/ai_test_dataset/<Category>/*.png. Every image is sent through the production code path utils.ai_helper.analyze_image() with no mocking.",
  "A pytest module gated behind the environment variable RUN_AI_EVAL=1, so that ordinary CI runs do not incur OpenAI charges by default. The module enumerates the dataset, calls the live API for each image, compares the returned category to the ground-truth directory name and reports both overall accuracy and a per-category confusion summary.",
  "No other test layer can verify that the AI integration produces the correct answer on real photographs; integration tests verify only the plumbing by mocking the AI response. Aim 3.2 is a numeric requirement and therefore must be evaluated numerically."
));

children.push(...layer(
  5, "Performance Tests",
  "Verify that the system meets the four performance test cases specified in CA2 Plan Table II: (a) API response p95 < 200 ms with 10 concurrent users, (b) stability under 50 concurrent users with zero error rate, (c) AI endpoint average response < 8 s, and (d) the public /health endpoint returning HTTP 200.",
  "A primary locustfile exercising twenty-two read endpoints in a 70/30 anonymous-vs-authenticated traffic mix, run at the two load levels mandated by Plan Table II (10 users for the response-time test and 50 users for the stability test). A secondary AI locustfile exercises the analyze-and-save endpoint with a single user to limit OpenAI spend; broader behavioural validation of the AI feature on multiple images is delegated to §7.3.4 Model Accuracy Evaluation. The /health smoke check is exercised as part of the API integration suite (tests/test_main.py).",
  "Locust 2.43 against the production code path with the real backend (uvicorn) and a local MongoDB instance pre-seeded with sixty independent test accounts and twenty sample products. To produce isolated measurements, each virtual user is assigned a unique account and a unique X-Forwarded-For header so that neither the IP-based nor the user-key-based rate limiter is triggered. The 50-user run uses a 60-second duration rather than the originally planned 5 minutes, prioritising fast feedback during development; a longer soak run is recommended before production deployment to surface any slow-onset issues such as memory leaks.",
  "Performance defects often surface only under concurrent load and cannot be detected by single-request testing. By exercising both load levels mandated in Plan Table II, the suite verifies both response-time guarantees (the 10-user run) and stability guarantees (the 50-user run) of the platform."
));

children.push(...layer(
  6, "Frontend Component Testing",
  "Verify that React components render correctly, respond to user input, validate forms client-side, and maintain global state via Context correctly. This layer sits alongside the backend layers and is delivered by a separate team member.",
  "Form-validation tests for the seven forms with non-trivial rules (Register, Login, Forgot/Reset/Change Password, Publish/Edit Product); render tests for the five reusable components in src/components/; smoke tests for the 24 routed pages prioritised P0/P1/P2; tests for the three React Contexts (Auth, Unread, WebSocket) covering token persistence, real-time updates and log-out propagation; responsive breakpoint tests at 375 px, 768 px and 1024 px.",
  "Vitest with React Testing Library, jsdom environment, and Mock Service Worker for API stubbing. Tests assert on user-visible behaviour (text, role, label) rather than on internal implementation, following the React Testing Library guiding principle.",
  "UI defects directly affect every user. Client-side validation defects let invalid data reach the server, increasing backend load and degrading user experience with confusing error messages. Component testing catches these before they reach end-to-end runs, where each failure is far more expensive to debug."
));

// ── 7.4 Test Data ───────────────────────────────────────────
children.push(h2("7.4 Test Data and Environment Design"));
children.push(pRich([
  { text: "Test design follows the principle of " },
  { text: "deterministic isolation", italic: true },
  { text: ": each test must produce the same result regardless of execution order or shared state. Four design decisions implement this principle." },
]));

children.push(pRich([
  { text: "In-memory database. ", bold: true },
  { text: "Production MongoDB is replaced in pytest by mongomock-motor, which exposes the Motor async API on top of an in-memory document store. The db fixture in tests/conftest.py patches utils.database.db.client per test so each case receives a fresh database; no state leaks between cases." },
]));

children.push(pRich([
  { text: "Mocked external services. ", bold: true },
  { text: "A single _mute_external autouse fixture replaces SMTP/Resend (no real emails sent), the OpenAI API (returns a fixed canned analysis result), GridFS image storage (returns synthetic URLs), the WebSocket push (manager.send_personal becomes a no-op), the rate limiter (bypassed so test order does not cause throttling), and the notification helpers. Tests that specifically need to assert on these side effects use opt-in fixtures: notification_spy records every create_notification call into a list, and fake_gridfs provides an in-memory file store with the GridFS API surface." },
]));

children.push(pRich([
  { text: "Test-data factories. ", bold: true },
  { text: "Rather than hand-crafting database documents in each test, factory fixtures (make_user, make_product, make_order, make_review, make_notif) create the relevant entity in one call with sensible defaults, accepting overrides for the fields under test. This keeps test bodies short (typically 10-20 lines) and ensures database documents remain consistent with the production schema." },
]));

children.push(pRich([
  { text: "Account and IP pools for performance and end-to-end. ", bold: true },
  { text: "For Locust and Cypress, where a single shared test account would trigger rate limiting, perf_tests/seed_data.py creates a pool of sixty independent accounts (perfuser0..perfuser59@university.edu). Each virtual user (Locust) or test case (Cypress) draws a unique account from the pool and additionally sends a randomised X-Forwarded-For header to bypass the IP-dimension throttle. This change reduced an initial 6.4 % failure rate (caused entirely by login throttling) to a clean 0 % under five-times-baseline load." },
]));

// ── 7.5 Acceptance ──────────────────────────────────────────
children.push(h2("7.5 Acceptance Criteria"));
children.push(pRich([
  { text: "A test case is considered " },
  { text: "passed", italic: true },
  { text: " if and only if it terminates with no assertion failure and no uncaught exception. A layer is considered " },
  { text: "meeting target", italic: true },
  { text: " according to Table 7.3." },
]));

children.push(makeTable(
  [3200, 4400, 1760],
  ["Layer", "Pass criterion", "Numerical target"],
  [
    ["Unit", "All cases pass", "100 %"],
    ["API Integration", "All cases pass", "100 %"],
    ["End-to-End", "All Cypress specs green", "100 %"],
    ["Model Accuracy", "Category matches ground-truth label", "≥ 80 %"],
    ["Performance (API @ 10 users)", "p95 latency below threshold", "< 200 ms"],
    ["Performance (API @ 50 users)", "Stability under 5× baseline", "0 failures"],
    ["Performance (AI)", "p95 latency below threshold", "< 8 s"],
    ["Frontend Component", "All cases pass", "100 %"],
  ]
));
children.push(tableCaption("Table 7.3. Acceptance criteria per test layer."));

children.push(p(
  "The full execution log, per-test breakdown, performance graphs and AI accuracy " +
  "table are documented separately in Chapter 8 (Testing Results). The complete suite " +
  "is reproducible from a fresh clone with three commands:"
));

children.push(new Paragraph({
  spacing: { after: 80 },
  children: [new TextRun({
    text: "cd backend && pytest                                   # 328 cases",
    font: "Consolas", size: 20,
  })],
}));
children.push(new Paragraph({
  spacing: { after: 80 },
  children: [new TextRun({
    text: "RUN_AI_EVAL=1 pytest tests/test_ai_accuracy.py        # 50 images",
    font: "Consolas", size: 20,
  })],
}));
children.push(new Paragraph({
  spacing: { after: 200 },
  children: [new TextRun({
    text: "cd frontend && npx cypress run                         # 20 specs",
    font: "Consolas", size: 20,
  })],
}));

// ── References ──────────────────────────────────────────────
children.push(h2("References"));
children.push(p("[1] K. C. Dodds, \"Write tests. Not too many. Mostly integration.\", https://kentcdodds.com/blog/write-tests, 2019."));
children.push(p("[2] FastAPI documentation, \"Testing\", https://fastapi.tiangolo.com/tutorial/testing/."));
children.push(p("[3] Cypress documentation, \"Real World Testing\", https://learn.cypress.io."));
children.push(p("[4] Locust documentation, \"Writing a locustfile\", https://docs.locust.io/en/stable/writing-a-locustfile.html."));

// ── Build doc ───────────────────────────────────────────────
const doc = new Document({
  creator: "CampusTrade Team",
  title: "Section 7: Evaluation and Testing Design",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: FONT, color: "1F4E79" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: "2E75B6" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: FONT, color: "555555" },
        paragraph: { spacing: { before: 220, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 },  // A4
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = "/Users/wcy/Desktop/campusTrade-main/docs/Section7_Testing_Design.docx";
  fs.writeFileSync(out, buf);
  console.log(`✓ Generated: ${out}`);
});
