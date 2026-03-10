import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./PublishProduct.css";

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

  if (loadProduct) {
    return <div className="publish-product"><p className="publish-product-hint">Loading...</p></div>;
  }

  return (
    <div className="publish-product">
      <div className="publish-product-card">
        <h2>Edit product</h2>
        <p className="publish-product-hint">Update the details below.</p>

        <form onSubmit={handleSubmit}>
          <label>Title *</label>
          <input
            type="text"
            placeholder="Product title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />

          <label>Description *</label>
          <textarea
            placeholder="Product description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />

          <label>Price (£) *</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
          />

          <label>Category *</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.length === 0 && <option value="">Loading...</option>}
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <label>Condition</label>
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={sustainable}
              onChange={(e) => setSustainable(e.target.checked)}
            />
            Sustainable / Recyclable
          </label>

          {error && <p className="publish-product-error">{error}</p>}
          {success && <p className="publish-product-success">{success}</p>}

          <div className="publish-product-actions">
            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save changes"}
            </button>
            <Link to="/my-products">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
