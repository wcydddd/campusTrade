import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./PublishProduct.css";

// 后端 POST /products 使用 Pydantic 枚举（中文），GET /products/categories 返回英文
// 发布时若走 JSON 接口需映射为中文；走 with-image 时后端接受字符串，与 categories 一致
const CATEGORY_TO_ENUM = {
  Electronics: "电子产品",
  Textbooks: "教材",
  Furniture: "家具",
  Clothing: "服饰",
  Sports: "运动器材",
  Kitchen: "其他",
  Stationery: "其他",
  Other: "其他",
};

const CONDITION_OPTIONS = [
  { value: "new", label: "New" },
  { value: "like_new", label: "Like new" },
  { value: "good", label: "Good" },
  { value: "fair", label: "Fair" },
];

export default function PublishProduct() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("good");
  const [sustainable, setSustainable] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/products/categories`);
        if (!cancelled && res.ok) {
          const { categories: cats } = await res.json();
          setCategories(Array.isArray(cats) ? cats : []);
          if (cats?.length && !category) setCategory(cats[0]);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load categories");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const trimTitle = title.trim();
    const trimDesc = description.trim();
    const numPrice = parseFloat(price);

    if (!trimTitle) return setError("Please enter a title.");
    if (!trimDesc) return setError("Please enter a description.");
    if (Number.isNaN(numPrice) || numPrice < 0)
      return setError("Please enter a valid price.");
    if (!category) return setError("Please select a category.");

    setLoading(true);
    try {
      // ===== 分支 1：带图片，用 /products/with-image（直接 fetch，手动加 token）=====
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        formData.append("title", trimTitle);
        formData.append("description", trimDesc);
        formData.append("price", String(numPrice));
        formData.append("category", category);
        formData.append("condition", condition);
        formData.append("sustainable", sustainable ? "true" : "false");

        const token = localStorage.getItem("token");
        const res = await fetch(`${API_BASE}/products/with-image`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || data.message || "Publish failed.");

        setSuccess("Product published.");
        setTimeout(() => navigate("/home"), 1500);
        return;
      }

      const categoryForApi = CATEGORY_TO_ENUM[category] ?? "其他";

      const res = await authFetch(`${API_BASE}/products`, {
        method: "POST",
        body: JSON.stringify({
          title: trimTitle,
          description: trimDesc,
          price: numPrice,
          category: categoryForApi,
          condition,
          sustainable,
          images: [],
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.message || "Publish failed.");

      setSuccess("Product published.");
      setTimeout(() => navigate("/home"), 1500);
    } catch (err) {
      setError(err.message || "Publish failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="publish-product">
      <div className="publish-product-card">
        <h2>Publish product</h2>
        <p className="publish-product-hint">
          Fill in the details and optionally upload an image.
        </p>

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
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />

          <label>Category *</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.length === 0 && <option value="">Loading...</option>}
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label>Condition</label>
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
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

          <label>Choose photo (optional, jpg/png/webp)</label>
          <div className="publish-product-file-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              className="publish-product-file-input"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
            <button
              type="button"
              className="publish-product-file-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file
            </button>
            <span className="publish-product-file-name">
              {imageFile ? imageFile.name : "No file chosen"}
            </span>
          </div>

          {error && <p className="publish-product-error">{error}</p>}
          {success && <p className="publish-product-success">{success}</p>}

          <div className="publish-product-actions">
            <button type="submit" disabled={loading}>
              {loading ? "Publishing..." : "Publish"}
            </button>
            <Link to="/home">Back to Home</Link>
          </div>
        </form>
      </div>
    </div>
  );
}