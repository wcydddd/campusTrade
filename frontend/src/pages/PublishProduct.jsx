import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch, getStoredToken, logout } from "../api";

/* ─── Constants & Mappings ─── */

const CATEGORY_TO_ENUM = {
  Electronics: "Electronics",
  Textbooks: "Textbooks",
  Furniture: "Furniture",
  Clothing: "Clothing",
  Sports: "Sports",
  Kitchen: "Kitchen",
  Stationery: "Stationery",
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

/** C3: review threshold (maps to backend ai_confidence) */
const AI_CONF_THRESHOLD = 0.75;

/* ─── Helpers ─── */

function validateImageFile(file) {
  if (!file) return "Please select an image.";
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!ext || !ALLOWED_EXTS.includes(ext)) {
    return "Only JPG, PNG and WebP formats are supported.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File size must not exceed 10 MB (current: ${(file.size / 1024 / 1024).toFixed(
      1
    )} MB).`;
  }
  return null;
}

function matchCategory(aiCategory, categories) {
  if (!aiCategory || !categories.length) return null;
  const lower = String(aiCategory).toLowerCase().trim();

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

/** C3: Extract needs_review / ai_confidence from backend response (handles different structures) */
function extractReviewSignal(json) {
  const needsReview =
    json?.needs_review ??
    json?.data?.needs_review ??
    json?.needsReview ??
    json?.data?.needsReview ??
    false;

  const confRaw =
    json?.ai_confidence ??
    json?.data?.ai_confidence ??
    json?.aiConfidence ??
    json?.data?.aiConfidence ??
    null;

  const aiConfidence = confRaw === null || confRaw === undefined ? null : Number(confRaw);

  return {
    needsReview: Boolean(needsReview),
    aiConfidence: Number.isFinite(aiConfidence) ? aiConfidence : null,
  };
}

/** C3: Whether to open the review confirmation dialog */
function shouldOpenReviewDialog({ needsReview, aiConfidence }) {
  if (needsReview) return true;
  if (aiConfidence !== null && aiConfidence < AI_CONF_THRESHOLD) return true;
  return false;
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

  /* ── Manual image upload (multiple) ── */
  const [imageFiles, setImageFiles] = useState([]);
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

  /* ── C2: AI usage/quota ── */
  const [aiRemaining, setAiRemaining] = useState(null); // null=unknown, number=remaining
  const [aiUsageLoading, setAiUsageLoading] = useState(false);
  const [aiUsageError, setAiUsageError] = useState("");

  /* ── C3: Review dialog state ── */
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDraft, setReviewDraft] = useState({
    title: "",
    description: "",
    category: "",
    aiConfidence: null,
    needsReview: false,
    mode: "preview", // preview | save
  });

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
    return () => {
      cancelled = true;
    };
  }, []);

  /* ── C2: fetch AI usage ── */
  async function fetchAiUsage() {
    setAiUsageError("");
    setAiUsageLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/ai/usage`);
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        logout();
        setAiUsageError("Session expired. Please log in again.");
        return;
      }

      if (res.status === 429) {
        setAiUsageError("Too many requests. Please try again in a few minutes.");
        return;
      }

      if (!res.ok) {
        setAiUsageError(extractErrorMsg(data, "Failed to load AI usage."));
        return;
      }

      const remaining = data?.daily_remaining ?? data?.remaining ?? data?.left ?? data?.quota ?? 0;
      const n = Number(remaining);
      setAiRemaining(Number.isFinite(n) ? n : 0);
    } catch (e) {
      setAiUsageError(e.message || "Failed to load AI usage.");
    } finally {
      setAiUsageLoading(false);
    }
  }

  // Fetch quota on page load
  useEffect(() => {
    fetchAiUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Cleanup blob URL ── */
  useEffect(() => {
    return () => {
      if (aiLocalPreview) URL.revokeObjectURL(aiLocalPreview);
    };
  }, [aiLocalPreview]);

  useEffect(() => {
    return () => {
      imageFiles.forEach((f) => {
        if (f?.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, [imageFiles]);

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
    [aiLocalPreview]
  );

  const onDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    setDragging(false);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickAiFile(f);
  };

  /* ═══ Apply AI data to form ═══ */

  function applyAiData(data) {
    if (data?.title) setTitle(data.title);
    if (data?.description) setDescription(data.description);
    if (data?.category) {
      const matched = matchCategory(data.category, categories);
      if (matched) setCategory(matched);
    }
  }

  /** C3: Open Review Dialog */
  function openReviewDialog(payload, signal, mode) {
    setReviewDraft({
      title: payload?.title || "",
      description: payload?.description || "",
      category: payload?.category || "",
      aiConfidence: signal.aiConfidence,
      needsReview: signal.needsReview,
      mode,
    });
    setReviewOpen(true);
  }

  const categoryOptionsForDialog = useMemo(() => {
    // Use backend categories directly in dialog dropdown
    return Array.isArray(categories) ? categories : [];
  }, [categories]);

  /* ═══ AI Preview (/ai/analyze — no image save) ═══ */

  async function handleAiPreview() {
    if (aiRemaining === 0) return setAiError("Today's AI quota has reached the limit.");
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

      const token = getStoredToken();
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

      if (res.status === 429) {
        setAiRemaining(0);
        setAiError("Today's AI quota has reached the limit. Please try tomorrow.");
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "AI analysis failed.");

      const payload = json?.data || {};
      const signal = extractReviewSignal(json);

      // C3: Open dialog if flagged; otherwise apply directly
      if (shouldOpenReviewDialog(signal)) {
        openReviewDialog(payload, signal, "preview");
        setAiMessage("AI result requires confirmation. Please review and apply.");
      } else {
        applyAiData(payload);
        setAiMessage(
          'Preview complete! AI results have been filled into the form. The image was not saved — use "AI Smart Publish" to include it.'
        );
      }

      // Refresh quota after AI call
      await fetchAiUsage();
    } catch (e) {
      setAiError(e.message || "AI preview failed.");
    } finally {
      setAiLoading(false);
    }
  }

  /* ═══ AI Smart Publish (/ai/analyze-and-save — save image + analyze) ═══ */

  async function handleAiSave() {
    if (aiRemaining === 0) return setAiError("Today's AI quota has reached the limit.");
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

      const token = getStoredToken();
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

      if (res.status === 429) {
        setAiRemaining(0);
        setAiError("Today's AI quota has reached the limit. Please try tomorrow.");
        return;
      }

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "AI recognition failed.");

      const payload = json?.data || {};
      const signal = extractReviewSignal(json);

      // Store the saved image_url (does not affect dialog)
      if (json.image_url) setAiImageUrl(json.image_url);

      // C3: Open dialog if flagged; otherwise apply directly
      if (shouldOpenReviewDialog(signal)) {
        openReviewDialog(payload, signal, "save");
        setAiMessage("AI result requires confirmation. Please review and apply.");
      } else {
        applyAiData(payload);
        setAiMessage(
          'Image saved and AI results filled into the form. Please review, add price & condition, then click "Confirm & Publish".'
        );
      }

      // Refresh quota after AI call
      await fetchAiUsage();
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
      /* Branch 1: AI-saved image only (no extra manual images) */
      if (aiImageUrl && imageFiles.length === 0) {
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
        setSuccess("Product submitted! It will appear after admin review.");
        setTimeout(() => navigate("/my-products"), 2000);
        return;
      }

      /* Branch 2: Manual image upload (supports appending AI image url) */
      if (imageFiles.length > 0 || aiImageUrl) {
        const fd = new FormData();
        imageFiles.forEach((item) => fd.append("files", item.file));
        if (aiImageUrl) {
          fd.append("existing_images", JSON.stringify([aiImageUrl]));
        }
        fd.append("title", t);
        fd.append("description", d);
        fd.append("price", String(p));
        fd.append("category", category);
        fd.append("condition", condition);
        fd.append("sustainable", sustainable ? "true" : "false");

        const token = getStoredToken();
        const res = await fetch(`${API_BASE}/products/with-image`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(extractErrorMsg(data, "Publish failed."));
        setSuccess("Product submitted! It will appear after admin review.");
        setTimeout(() => navigate("/my-products"), 2000);
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
      setSuccess("Product submitted! It will appear after admin review.");
      setTimeout(() => navigate("/my-products"), 2000);
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
    <div className="min-h-screen bg-[#f4f4f4]">
      {/* ── Full-width yellow header ── */}
      <div className="w-full bg-[#FFDA00] px-4 py-10 text-center shadow-sm">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
          Publish Product
        </h1>
        <p className="mt-2 text-sm font-medium text-yellow-900/60">
          Fill in details manually, or let AI auto-fill from an image
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 md:px-8">
        {/* ═══════ AI Smart Recognition Card ═══════ */}
        <section className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-blue-100/50">
          {/* ── Gradient title bar ── */}
          <div className="flex items-center gap-3 bg-gradient-to-r from-blue-50 via-indigo-50/80 to-blue-50 px-6 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
              🤖
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">AI Smart Recognition</h2>
              <p className="text-xs text-gray-500">Upload a photo and AI fills in the details</p>
            </div>

            {/* ✅ C2: quota indicator */}
            <div className="ml-auto flex-shrink-0 text-sm">
              {aiUsageLoading ? (
                <span className="text-gray-400">Checking…</span>
              ) : aiRemaining === null ? (
                <span className="text-gray-400">Quota: —</span>
              ) : (
                <span className="text-gray-500">
                  Today:{" "}
                  <b className={`text-base ${aiRemaining <= 0 ? "text-red-500" : "text-blue-600"}`}>
                    {aiRemaining}
                  </b>
                </span>
              )}
            </div>
          </div>

          {/* ── Card body ── */}
          <div className="space-y-4 px-6 pb-6 pt-5">

          {/* ✅ C2: usage error */}
          {aiUsageError && (
            <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
              {aiUsageError}
            </div>
          )}

          {/* Drag & drop / click upload zone */}
          <div
            role="button"
            tabIndex={0}
            className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border transition-all ${
              dragging
                ? "border-blue-400 bg-blue-50/60 shadow-inner"
                : aiLocalPreview
                ? "border-blue-200 bg-gradient-to-b from-blue-50/30 to-white"
                : "border-gray-200 bg-gradient-to-b from-gray-50/80 to-white hover:border-blue-300 hover:shadow-md"
            } ${aiLocalPreview ? "p-5" : "py-14 px-6"}`}
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
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
                <img
                  src={aiLocalPreview}
                  alt="Preview"
                  className="h-40 w-40 flex-shrink-0 rounded-xl object-cover shadow-md ring-1 ring-black/5"
                />
                <div className="text-center sm:text-left">
                  <p className="text-sm font-medium text-gray-700 break-all">{aiFile?.name}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {(aiFile?.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <p className="mt-2 text-xs font-medium text-blue-500">Click or drag to replace image</p>
                  {aiImageUrl && (
                    <span className="mt-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Saved to server
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 shadow-sm">
                  <svg
                    className="h-8 w-8 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-700">Click to upload or drag an image here</p>
                <p className="mt-1.5 text-xs text-gray-400">Supports JPG / PNG / WebP, max 10 MB</p>
              </>
            )}

            {/* Loading overlay */}
            {aiLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-white/80 backdrop-blur-sm">
                <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-600" />
                <p className="text-sm font-medium text-blue-600">AI is analysing your image…</p>
              </div>
            )}
          </div>

          {/* AI error */}
          {aiError && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
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
            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">
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
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={aiLoading || aiRemaining === 0}
                onClick={handleAiPreview}
                className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-600 shadow-sm transition-all hover:bg-blue-50 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                title={aiRemaining === 0 ? "No AI quota left today" : ""}
              >
                {aiLoading ? <Spinner /> : "🔍"} AI Preview
              </button>
              <button
                type="button"
                disabled={aiLoading || aiRemaining === 0}
                onClick={handleAiSave}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
                title={aiRemaining === 0 ? "No AI quota left today" : ""}
              >
                {aiLoading ? <Spinner className="border-white/40 border-t-white" /> : "🚀"}{" "}
                AI Smart Publish
              </button>
            </div>
          )}

          </div>
        </section>

        {/* ═══════ Product Info Form Card ═══════ */}
        <section className="overflow-hidden rounded-2xl bg-white shadow-lg shadow-gray-200/60">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-lg font-bold text-gray-900">Product Details</h2>
            <p className="mt-0.5 text-xs text-gray-400">Fill in the information below to list your item</p>
          </div>

          <div className="px-6 pb-6 pt-5">
          {/* AI image thumbnail (shown when AI has saved an image) */}
          {aiImageUrl && aiLocalPreview && (
            <div className="mb-5 flex items-center gap-4 rounded-xl bg-blue-50/50 p-3.5 ring-1 ring-blue-100">
              <img
                src={aiLocalPreview}
                alt="Product"
                className="h-20 w-20 flex-shrink-0 rounded-xl object-cover shadow-sm"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">AI-recognised product image</p>
                <p className="mt-0.5 text-xs text-gray-400 break-all">{aiFile?.name}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
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
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {/* Price + Condition row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-gray-400">£</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-2.5 pl-8 pr-4 text-sm transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-gray-700">
                  Condition <span className="text-red-500">*</span>
                </label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                className="w-full rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-2.5 text-sm transition-all focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
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
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm font-medium text-gray-700 transition-all hover:border-blue-300 hover:bg-blue-50/30">
              <input
                type="checkbox"
                checked={sustainable}
                onChange={(e) => setSustainable(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
              />
              <span>🌱</span>
              Sustainable / Recyclable
            </label>

            {/* Manual image upload */}
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Product Images
              </label>
              {aiImageUrl && (
                <p className="mb-3 text-xs text-blue-600">
                  AI image is already included. You can add more images below.
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={(e) => {
                  const selected = Array.from(e.target.files || []);
                  if (!selected.length) return;
                  const valid = [];
                  for (const f of selected) {
                    const err = validateImageFile(f);
                    if (!err) valid.push({ file: f, preview: URL.createObjectURL(f) });
                  }
                  setImageFiles((prev) => [...prev, ...valid]);
                  e.target.value = "";
                }}
              />
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {imageFiles.map((item, idx) => (
                  <div key={`${item.file.name}-${idx}`} className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white">
                    <img
                      src={item.preview}
                      alt={item.file.name}
                      className="aspect-square w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/50 to-transparent px-2 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 backdrop-blur-sm"
                          disabled={idx === 0}
                          onClick={() =>
                            setImageFiles((prev) => {
                              const arr = [...prev];
                              [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                              return arr;
                            })
                          }
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 backdrop-blur-sm"
                          disabled={idx === imageFiles.length - 1}
                          onClick={() =>
                            setImageFiles((prev) => {
                              const arr = [...prev];
                              [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                              return arr;
                            })
                          }
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg bg-red-500/90 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm"
                        onClick={() =>
                          setImageFiles((prev) => {
                            const target = prev[idx];
                            if (target?.preview) URL.revokeObjectURL(target.preview);
                            return prev.filter((_, i) => i !== idx);
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add image button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 text-gray-400 transition-all hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-500"
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="text-xs font-semibold">Add Images</span>
                </button>
              </div>
              {imageFiles.length > 0 && (
                <p className="mt-2 text-xs text-gray-400">{imageFiles.length} image(s) selected · JPG, PNG, WebP</p>
              )}
            </div>

            {/* Error & Success */}
            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">
                {success}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-5 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-[#FFDA00] px-10 py-3 text-sm font-extrabold text-gray-900 shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 disabled:shadow-none disabled:hover:translate-y-0"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Spinner className="border-gray-900/30 border-t-gray-900" />
                    Publishing…
                  </span>
                ) : (
                  "Confirm & Publish"
                )}
              </button>
              <Link
                to="/home"
                className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
              >
                Back to Home
              </Link>
            </div>
          </form>
          </div>
        </section>
      </div>

      {/* ═══════ C3: Review Dialog ═══════ */}
      {reviewOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setReviewOpen(false)}
        >
          <div
            style={{
              width: "min(860px, 100%)",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: 18 }}>Confirm AI Result</h3>
                <span style={{ fontSize: 13, color: "#6b7280" }}>
                  Mode: {reviewDraft.mode === "save" ? "AI Smart Publish" : "AI Preview"}
                </span>
                {reviewDraft.aiConfidence !== null && (
                  <span style={{ fontSize: 13, color: "#6b7280" }}>
                    Confidence: {(reviewDraft.aiConfidence * 100).toFixed(0)}%
                  </span>
                )}
                {reviewDraft.needsReview && (
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "#fff7ed",
                      color: "#c2410c",
                      border: "1px solid #fed7aa",
                    }}
                  >
                    needs_review
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p style={{ margin: "10px 0 14px", color: "#4b5563", fontSize: 13 }}>
              Backend flagged this AI result for manual confirmation. Please review and edit before applying.
              (Trigger condition: <code>needs_review=true</code> or <code>ai_confidence&lt;{AI_CONF_THRESHOLD}</code>)
            </p>

            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Title</label>
                <input
                  value={reviewDraft.title}
                  onChange={(e) => setReviewDraft((p) => ({ ...p, title: e.target.value }))}
                  style={{
                    width: "100%",
                    marginTop: 6,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Description</label>
                <textarea
                  value={reviewDraft.description}
                  onChange={(e) => setReviewDraft((p) => ({ ...p, description: e.target.value }))}
                  rows={5}
                  style={{
                    width: "100%",
                    marginTop: 6,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    resize: "vertical",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Category</label>
                <select
                  value={reviewDraft.category}
                  onChange={(e) => setReviewDraft((p) => ({ ...p, category: e.target.value }))}
                  style={{
                    width: "100%",
                    marginTop: 6,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <option value="">(Select)</option>
                  {categoryOptionsForDialog.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  applyAiData({
                    title: reviewDraft.title,
                    description: reviewDraft.description,
                    category: reviewDraft.category,
                  });
                  setReviewOpen(false);
                  setAiMessage("AI results applied after manual confirmation.");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#4f46e5",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Apply to Form
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
