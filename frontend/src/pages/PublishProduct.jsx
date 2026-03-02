import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch, logout } from "../api";

/* ─── Constants & Mappings ─── */

const CATEGORY_TO_ENUM = {
  Electronics: "Electronics",
  Textbooks: "Textbooks",
  Furniture: "Furniture",
  Clothing: "Clothing",
  Sports: "Sports",
  Kitchen: "Other",
  Stationery: "Other",
  Other: "Other",
};

const CONDITION_OPTIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like New" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
];

const ALLOWED_EXTS = ["jpg", "jpeg", "png", "webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/* ─── Helpers ─── */

function validateImageFile(file) {
  if (!file) return "Please select an image.";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTS.includes(ext)) {
    return "Only JPG, PNG and WebP formats are supported.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File size must not exceed 10 MB (current: ${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  }
  return null;
}

function matchCategory(aiCategory, categories) {
  if (!aiCategory || !categories.length) return null;
  const lower = aiCategory.toLowerCase().trim();

  const direct = categories.find((c) => c.toLowerCase() === lower);
  if (direct) return direct;

  for (const cat of categories) {
    if (cat.toLowerCase().includes(lower) || lower.includes(cat.toLowerCase())) {
      return cat;
    }
  }
  return null;
}

function extractErrorMsg(data, fallback = "Request failed.") {
  const d = data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d.map((e) => e.msg || e.message || JSON.stringify(e)).join("; ");
  }
  if (d && typeof d === "object") return d.msg || d.message || JSON.stringify(d);
  return data?.message || fallback;
}

/* ─── Spinner ─── */

function Spinner({ className = "" }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

/* ═══════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════ */

export default function PublishProduct() {
  const navigate = useNavigate();

  /* ── Category list ── */
  const [categories, setCategories] = useState([]);

  /* ── Form fields ── */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("good");
  const [sustainable, setSustainable] = useState(false);

  /* ── Manual image upload ── */
  const [imageFile, setImageFile] = useState(null);
  const fileInputRef = useRef(null);

  /* ── AI upload state ── */
  const aiInputRef = useRef(null);
  const [aiFile, setAiFile] = useState(null);
  const [aiLocalPreview, setAiLocalPreview] = useState(null);
  const [aiImageUrl, setAiImageUrl] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  /* ── Global state ── */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /* ── Load categories ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/products/categories`);
        if (!cancelled && res.ok) {
          const { categories: cats } = await res.json();
          setCategories(Array.isArray(cats) ? cats : []);
          if (cats?.length) setCategory((prev) => prev || cats[0]);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load categories.");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ── Cleanup blob URL ── */
  useEffect(() => {
    return () => { if (aiLocalPreview) URL.revokeObjectURL(aiLocalPreview); };
  }, [aiLocalPreview]);

  /* ═══ AI file selection (click / drag) ═══ */

  const pickAiFile = useCallback(
    (file) => {
      setAiError("");
      setAiMessage("");
      const err = validateImageFile(file);
      if (err) {
        setAiError(err);
        setAiFile(null);
        if (aiLocalPreview) URL.revokeObjectURL(aiLocalPreview);
        setAiLocalPreview(null);
        return;
      }
      if (aiLocalPreview) URL.revokeObjectURL(aiLocalPreview);
      setAiFile(file);
      setAiLocalPreview(URL.createObjectURL(file));
      setAiImageUrl(null);
      setAiMessage("");
    },
    [aiLocalPreview],
  );

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickAiFile(f);
  };

  /* ═══ Apply AI data to form ═══ */

  function applyAiData(data) {
    if (data.title) setTitle(data.title);
    if (data.description) setDescription(data.description);
    if (data.category) {
      const matched = matchCategory(data.category, categories);
      if (matched) setCategory(matched);
    }
  }

  /* ═══ AI Preview (/ai/analyze — no image save) ═══ */

  async function handleAiPreview() {
    if (!aiFile) return setAiError("Please select an image first.");
    const valErr = validateImageFile(aiFile);
    if (valErr) {
      setAiError(valErr);
      setAiFile(null);
      setAiLocalPreview(null);
      return;
    }

    setAiError("");
    setAiMessage("");
    setAiLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", aiFile);

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/ai/analyze`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      if (res.status === 401) {
        logout();
        setAiError("Session expired. Please log in again.");
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "AI analysis failed.");

      applyAiData(json.data);
      setAiMessage(
        "Preview complete! AI results have been filled into the form. " +
        "The image was not saved — use \"AI Smart Publish\" to include it.",
      );
    } catch (e) {
      setAiError(e.message || "AI preview failed.");
    } finally {
      setAiLoading(false);
    }
  }

  /* ═══ AI Smart Publish (/ai/analyze-and-save — save image + analyze) ═══ */

  async function handleAiSave() {
    if (!aiFile) return setAiError("Please select an image first.");
    const valErr = validateImageFile(aiFile);
    if (valErr) {
      setAiError(valErr);
      setAiFile(null);
      setAiLocalPreview(null);
      return;
    }

    setAiError("");
    setAiMessage("");
    setAiLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", aiFile);

      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/ai/analyze-and-save`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      if (res.status === 401) {
        logout();
        setAiError("Session expired. Please log in again.");
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "AI recognition failed.");

      applyAiData(json.data);
      if (json.image_url) setAiImageUrl(json.image_url);
      setAiMessage(
        "Image saved and AI results filled into the form. " +
        "Please review, add price & condition, then click \"Confirm & Publish\".",
      );
    } catch (e) {
      setAiError(e.message || "AI smart publish failed.");
    } finally {
      setAiLoading(false);
    }
  }

  /* ═══ Final submit ═══ */

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const t = title.trim();
    const d = description.trim();
    const p = parseFloat(price);

    if (!t) return setError("Please enter a title.");
    if (!d) return setError("Please enter a description.");
    if (Number.isNaN(p) || p < 0) return setError("Please enter a valid price.");
    if (!category) return setError("Please select a category.");

    setLoading(true);
    try {
      /* Branch 1: AI-saved image — JSON endpoint + images */
      if (aiImageUrl) {
        const catApi = CATEGORY_TO_ENUM[category] ?? "Other";
        const res = await authFetch(`${API_BASE}/products`, {
          method: "POST",
          body: JSON.stringify({
            title: t,
            description: d,
            price: p,
            category: catApi,
            condition,
            sustainable,
            images: [aiImageUrl],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(extractErrorMsg(data, "Publish failed."));
        setSuccess("Product published successfully!");
        setTimeout(() => navigate("/home"), 1500);
        return;
      }

      /* Branch 2: Manual image upload — FormData endpoint */
      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        fd.append("title", t);
        fd.append("description", d);
        fd.append("price", String(p));
        fd.append("category", category);
        fd.append("condition", condition);
        fd.append("sustainable", sustainable ? "true" : "false");

        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/products/with-image`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(extractErrorMsg(data, "Publish failed."));
        setSuccess("Product published successfully!");
        setTimeout(() => navigate("/home"), 1500);
        return;
      }

      /* Branch 3: No image — JSON endpoint */
      const catApi = CATEGORY_TO_ENUM[category] ?? "Other";
      const res = await authFetch(`${API_BASE}/products`, {
        method: "POST",
        body: JSON.stringify({
          title: t,
          description: d,
          price: p,
          category: catApi,
          condition,
          sustainable,
          images: [],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(extractErrorMsg(data, "Publish failed."));
      setSuccess("Product published successfully!");
      setTimeout(() => navigate("/home"), 1500);
    } catch (err) {
      setError(err.message || "Publish failed.");
    } finally {
      setLoading(false);
    }
  }

  /* ═══════════════════════════════════════════
     Render
     ═══════════════════════════════════════════ */

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-2xl space-y-6">

        {/* ── Page header ── */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">Publish Product</h1>
          <p className="mt-1 text-sm text-gray-500">
            Fill in details manually, or let AI auto-fill from an image
          </p>
        </div>

        {/* ═══════ AI Smart Recognition Card ═══════ */}
        <section className="rounded-xl bg-white p-6 shadow-md ring-1 ring-black/5">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-base">
              🤖
            </span>
            <h2 className="text-lg font-semibold text-gray-800">AI Smart Recognition</h2>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            Upload a product photo and AI will generate the title, description and category for you
          </p>

          {/* Drag & drop / click upload zone */}
          <div
            role="button"
            tabIndex={0}
            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all ${
              dragging
                ? "border-indigo-500 bg-indigo-50"
                : aiLocalPreview
                  ? "border-indigo-300 bg-indigo-50/30"
                  : "border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/40"
            } ${aiLocalPreview ? "p-4" : "p-10"}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => aiInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && aiInputRef.current?.click()}
          >
            <input
              ref={aiInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickAiFile(f);
                e.target.value = "";
              }}
            />

            {aiLocalPreview ? (
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
                <img
                  src={aiLocalPreview}
                  alt="Preview"
                  className="h-36 w-36 flex-shrink-0 rounded-lg object-cover shadow"
                />
                <div className="text-center sm:text-left">
                  <p className="text-sm font-medium text-gray-700 break-all">
                    {aiFile?.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {(aiFile?.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <p className="mt-2 text-xs text-indigo-500">
                    Click or drag to replace image
                  </p>
                  {aiImageUrl && (
                    <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Saved to server
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <svg
                  className="mb-3 h-10 w-10 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <p className="text-sm font-medium text-gray-600">
                  Click to upload or drag an image here
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Supports JPG / PNG / WebP, max 10 MB
                </p>
              </>
            )}

            {/* Loading overlay */}
            {aiLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/80 backdrop-blur-sm">
                <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-indigo-200 border-t-indigo-600" />
                <p className="text-sm font-medium text-indigo-600">
                  AI is analysing your image…
                </p>
              </div>
            )}
          </div>

          {/* AI error */}
          {aiError && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              {aiError}
            </div>
          )}

          {/* AI success / info */}
          {aiMessage && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
              {aiMessage}
            </div>
          )}

          {/* AI action buttons */}
          {aiFile && (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={aiLoading}
                onClick={handleAiPreview}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-4 py-2 text-sm font-medium text-indigo-600 shadow-sm transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiLoading ? <Spinner /> : "🔍"} AI Preview
              </button>
              <button
                type="button"
                disabled={aiLoading}
                onClick={handleAiSave}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {aiLoading ? <Spinner className="border-white/40 border-t-white" /> : "🚀"}{" "}
                AI Smart Publish
              </button>
            </div>
          )}
        </section>

        {/* ═══════ Product Info Form Card ═══════ */}
        <section className="rounded-xl bg-white p-6 shadow-md ring-1 ring-black/5">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Product Details</h2>

          {/* AI image thumbnail (shown when AI has saved an image) */}
          {aiImageUrl && aiLocalPreview && (
            <div className="mb-5 flex items-center gap-4 rounded-lg bg-indigo-50/60 p-3 ring-1 ring-indigo-100">
              <img
                src={aiLocalPreview}
                alt="Product"
                className="h-20 w-20 flex-shrink-0 rounded-lg object-cover shadow-sm"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">AI-recognised product image</p>
                <p className="mt-0.5 text-xs text-gray-400 break-all">{aiFile?.name}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Title */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Product title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Description */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder="Product description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Price + Condition row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Price (&pound;) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Condition <span className="text-red-500">*</span>
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {CONDITION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {categories.length === 0 && <option value="">Loading…</option>}
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Sustainable */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={sustainable}
                onChange={(e) => setSustainable(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              Sustainable / Recyclable
            </label>

            {/* Manual image upload (hidden when AI has saved an image) */}
            {!aiImageUrl && (
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Upload image (optional, jpg / png / webp)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    Choose file
                  </button>
                  <span className="truncate text-sm text-gray-500">
                    {imageFile ? imageFile.name : "No file chosen"}
                  </span>
                </div>
              </div>
            )}

            {/* Error & Success */}
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700">
                {success}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-4 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="border-white/40 border-t-white" />
                    Publishing…
                  </span>
                ) : (
                  "Confirm & Publish"
                )}
              </button>
              <Link
                to="/home"
                className="text-sm text-indigo-600 transition-colors hover:text-indigo-800 hover:underline"
              >
                Back to Home
              </Link>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
