import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { API_BASE } from "../api";

const CATEGORY_DISPLAY = {
  "教材": "Textbooks",
  "电子产品": "Electronics",
  "家具": "Furniture",
  "服饰": "Clothing",
  "运动器材": "Sports",
  "其他": "Other",
  Kitchen: "Other",
  Stationery: "Other",
};

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function fetchProduct() {
      try {
        const res = await fetch(`${API_BASE}/products/${id}`);
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) setProduct(null);
          else setError("Failed to load product");
          return;
        }
        const data = await res.json();
        setProduct({
          id: data.id,
          name: data.title,
          price: data.price,
          condition: data.condition || "good",
          category: data.category,
          description: data.description,
          image: data.images?.length
            ? (data.images[0].startsWith("http") ? data.images[0] : `${API_BASE}${data.images[0]}`)
            : "https://dummyimage.com/600x400/cccccc/000000&text=CampusTrade",
        });
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load product");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (id) fetchProduct();
    return () => { cancelled = true; };
  }, [id]);

  const fallbackImg =
    "https://dummyimage.com/600x400/cccccc/000000&text=CampusTrade";

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <p>Loading...</p>
      </div>
    );
  }
  if (error || !product) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <h2>{error || "Product not found"}</h2>
        <button onClick={() => navigate("/")}>Back to Home</button>
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 1000,
        margin: "40px auto",
        padding: 24,
        display: "flex",
        gap: 40,
        flexWrap: "wrap",
      }}
    >
      {/* 图片区域 */}
      <div style={{ flex: 1, minWidth: 300 }}>
        <img
          src={product.image}
          alt={product.name}
          onError={(e) => {
            e.currentTarget.src = fallbackImg;
          }}
          style={{
            width: "100%",
            borderRadius: 12,
            objectFit: "cover",
          }}
        />
      </div>

      {/* 信息区域 */}
      <div style={{ flex: 1, minWidth: 280 }}>
        <button onClick={() => navigate(-1)} style={{ marginBottom: 20 }}>
          ← Back
        </button>

        <h1 style={{ marginBottom: 10 }}>{product.name}</h1>

        <p style={{ fontSize: 22, fontWeight: "bold", marginBottom: 12 }}>
          £{product.price}
        </p>

        <p style={{ marginBottom: 20 }}>
          <strong>Condition:</strong> {product.condition}
        </p>
        {product.category && (
          <p style={{ marginBottom: 20 }}>
            <strong>Category:</strong> {CATEGORY_DISPLAY[product.category] ?? product.category}
          </p>
        )}
        {product.description && (
          <p style={{ marginBottom: 20, color: "#555" }}>{product.description}</p>
        )}

        <button
          onClick={() => navigate(`/chat/${product.id}`)}
          style={{
            padding: "10px 20px",
            fontSize: 16,
            cursor: "pointer",
          }}
        >
          Chat with Seller
        </button>
      </div>
    </div>
  );
}