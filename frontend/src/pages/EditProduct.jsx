import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API_BASE, authFetch, getStoredToken } from "../api";
import "./EditProduct.css";

const ENUM_TO_CATEGORY = {
  "教材": "Textbooks",
  "电子产品": "Electronics",
  "家具": "Furniture",
  "服饰": "Clothing",
  "运动器材": "Sports",
  "其他": "Other",
};

const CONDITION_OPTIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
];

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function EditProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadProduct, setLoadProduct] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("good");
  const [sustainable, setSustainable] = useState(false);
  const [images, setImages] = useState([]);
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadCategories() {
      try {
        const res = await fetch(`${API_BASE}/products/categories`);
        if (!cancelled && res.ok) {
          const { categories: cats } = await res.json();
          setCategories(Array.isArray(cats) ? cats : []);
        }
      } catch (_) {}
    }
    loadCategories();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/products/${id}`);
        if (!cancelled && res.ok) {
          const p = await res.json();
          setTitle(p.title ?? "");
          setDescription(p.description ?? "");
          setPrice(String(p.price ?? ""));
          setCondition(p.condition ?? "good");
          setSustainable(p.sustainable ?? false);
          setImages(p.images ?? []);
          const cat = p.category;
          setCategory(ENUM_TO_CATEGORY[cat] ?? cat ?? (categories[0] || ""));
        } else if (!cancelled && !res.ok) {
          setError("Product not found");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoadProduct(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (categories.length && !category && title) setCategory(categories[0]);
  }, [categories, category, title]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const trimTitle = title.trim();
    const trimDesc = description.trim();
    const numPrice = parseFloat(price);

    if (!trimTitle) return setError("Please enter a title.");
    if (!trimDesc) return setError("Please enter a description.");
    if (Number.isNaN(numPrice) || numPrice < 0) return setError("Please enter a valid price.");
    if (!category) return setError("Please select a category.");

    setLoading(true);
    try {
      const categoryForApi = category || "Other";
      const res = await authFetch(`${API_BASE}/products/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: trimTitle,
          description: trimDesc,
          price: numPrice,
          category: categoryForApi,
          condition,
          sustainable,
          images,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
            : data.message || JSON.stringify(data.detail || "Update failed.");
        throw new Error(msg);
      }
      setSuccess("Product updated.");
      setTimeout(() => navigate("/my-products"), 1500);
    } catch (err) {
      setError(err.message || "Update failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAddImages(files) {
    if (!id || !files?.length) return;
    setError("");
    setUploadingImages(true);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/products/${id}/images/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.message || "Upload failed");
      const newImages = Array.isArray(data.images) ? data.images : [];
      setImages((prev) => [...prev, ...newImages]);
    } catch (e) {
      setError(e.message || "Upload failed");
    } finally {
      setUploadingImages(false);
    }
  }

  function moveImage(from, to) {
    setImages((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const arr = [...prev];
      [arr[from], arr[to]] = [arr[to], arr[from]];
      return arr;
    });
  }

  function removeImage(idx) {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  }

  if (loadProduct) {
    return (
      <div className="edit-product">
        <div className="edit-card">
          <p style={{ textAlign: "center", color: "#888" }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="edit-product">
      <div className="edit-card">
        <div className="edit-header">
          <h2>Edit product</h2>
          <p>Update the details below.</p>
        </div>

        <form className="edit-form" onSubmit={handleSubmit}>
          {/* Title */}
          <div className="edit-field">
            <label className="edit-label">Title *</label>
            <input
              type="text"
              className="edit-input"
              placeholder="Product title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          {/* Description */}
          <div className="edit-field">
            <label className="edit-label">Description *</label>
            <textarea
              className="edit-textarea"
              placeholder="Product description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
            />
          </div>

          {/* Price */}
          <div className="edit-field">
            <label className="edit-label">Price (£) *</label>
            <input
              type="text"
              inputMode="decimal"
              className="edit-input edit-input--price"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>

          {/* Category */}
          <div className="edit-field">
            <label className="edit-label">Category *</label>
            <select className="edit-select" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.length === 0 && <option value="">Loading...</option>}
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Condition */}
          <div className="edit-field">
            <label className="edit-label">Condition</label>
            <select className="edit-select" value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Sustainable checkbox */}
          <label className="edit-checkbox-wrap">
            <input
              type="checkbox"
              checked={sustainable}
              onChange={(e) => setSustainable(e.target.checked)}
            />
            <span className="edit-checkbox-icon">
              <svg viewBox="0 0 12 10">
                <polyline points="1.5 5 4.5 8 10.5 2" />
              </svg>
            </span>
            Sustainable / Recyclable
          </label>

          {/* Images */}
          <div className="edit-field">
            <label className="edit-label">Images (ordered)</label>
            <input
              type="file"
              className="edit-file-input"
              multiple
              accept=".jpg,.jpeg,.png,.webp"
              onChange={(e) => {
                const files = e.target.files;
                if (files?.length) handleAddImages(files);
                e.target.value = "";
              }}
            />
            {uploadingImages && <p className="edit-upload-hint">Uploading images...</p>}

            {images.length > 0 && (
              <div className="edit-images-grid">
                {images.map((u, idx) => (
                  <div key={`${u}-${idx}`} className="edit-img-card">
                    <img src={resolveMediaUrl(u)} alt={`img-${idx}`} />
                    <div className="edit-img-actions">
                      <button
                        type="button"
                        className="edit-img-btn"
                        onClick={() => moveImage(idx, idx - 1)}
                        disabled={idx === 0}
                        title="Move up"
                      >↑</button>
                      <button
                        type="button"
                        className="edit-img-btn"
                        onClick={() => moveImage(idx, idx + 1)}
                        disabled={idx === images.length - 1}
                        title="Move down"
                      >↓</button>
                      <button
                        type="button"
                        className="edit-img-btn edit-img-btn--remove"
                        onClick={() => removeImage(idx)}
                        title="Remove"
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          {error && <p className="edit-error">{error}</p>}
          {success && <p className="edit-success">{success}</p>}

          {/* Actions */}
          <div className="edit-actions">
            <button type="submit" className="edit-save-btn" disabled={loading}>
              {loading ? "Saving..." : "Save changes"}
            </button>
            <Link to="/my-products" className="edit-cancel-link">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
