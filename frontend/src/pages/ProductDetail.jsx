import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { API_BASE } from "../api";
import { useAuth } from "../context/AuthContext";

const CATEGORY_DISPLAY = {
  教材: "Textbooks",
  电子产品: "Electronics",
  家具: "Furniture",
  服饰: "Clothing",
  运动器材: "Sports",
  其他: "Other",
  Kitchen: "Other",
  Stationery: "Other",
};

// ✅ 统一补全媒体 URL
function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fallbackImg =
    "https://dummyimage.com/600x400/cccccc/000000&text=CampusTrade";

  useEffect(() => {
    let cancelled = false;

    async function fetchProduct() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE}/products/${id}`);
        if (cancelled) return;

        if (!res.ok) {
          if (res.status === 404) setProduct(null);
          else setError("Failed to load product");
          return;
        }

        const data = await res.json();

        // ✅ C1：详情页优先加载大图 image_url（或 imageUrl）
        const fullRaw =
          data.image_url ||
          data.imageUrl ||
          (data.images?.length ? data.images[0] : "");

        // ✅ 如果没有大图，就退回缩略图 thumb_url（或 images）
        const thumbRaw =
          data.thumb_url ||
          data.thumbnail_url ||
          data.thumbUrl ||
          data.thumbnailUrl ||
          "";

        const image =
          resolveMediaUrl(fullRaw) ||
          resolveMediaUrl(thumbRaw) ||
          (data.images?.length ? resolveMediaUrl(data.images[0]) : "") ||
          fallbackImg;

        setProduct({
          id: data.id,
          seller_id: data.seller_id,
          name: data.title,
          price: data.price,
          condition: data.condition || "good",
          category: data.category,
          description: data.description,
          image,
        });
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load product");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (id) fetchProduct();
    return () => {
      cancelled = true;
    };
  }, [id]);

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
          loading="eager" // 详情页：用户就是来看商品图的
          onError={(e) => {
            // 避免死循环
            if (e.currentTarget.src !== fallbackImg) {
              e.currentTarget.src = fallbackImg;
            }
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
            <strong>Category:</strong>{" "}
            {CATEGORY_DISPLAY[product.category] ?? product.category}
          </p>
        )}

        {product.description && (
          <p style={{ marginBottom: 20, color: "#555" }}>
            {product.description}
          </p>
        )}

        {user && product.seller_id && user.id !== product.seller_id && (
          <button
            onClick={() => navigate(`/chat/${product.seller_id}?product=${product.id}`)}
            style={{
              padding: "10px 20px",
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Chat with Seller
          </button>
        )}
        {user && product.seller_id && user.id === product.seller_id && (
          <p style={{ color: "#64748b", fontSize: 14, fontStyle: "italic" }}>
            This is your product.
          </p>
        )}
      </div>
    </div>
  );
}