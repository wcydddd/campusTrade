import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { API_BASE, authFetch } from "../api";
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
  const [favorited, setFavorited] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [orderMsg, setOrderMsg] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("spam");
  const [reportDesc, setReportDesc] = useState("");
  const [reportMsg, setReportMsg] = useState("");
  const [reporting, setReporting] = useState(false);

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
          seller_id: data.seller_id || data.user_id || "",
          name: data.title,
          price: data.price,
          condition: data.condition || "good",
          category: data.category,
          description: data.description,
          image,
          status: data.status || "available",
        });
        setFavorited(!!data.is_favorited);
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

  async function toggleFavorite() {
    const prev = favorited;
    setFavorited(!prev);
    try {
      const res = await authFetch(`${API_BASE}/favorites/${id}`, {
        method: prev ? "DELETE" : "POST",
      });
      if (!res.ok) setFavorited(prev);
    } catch {
      setFavorited(prev);
    }
  }

  async function handleOrder() {
    if (!window.confirm(`Place order for "${product.name}" at £${product.price}?`)) return;
    setOrdering(true);
    setOrderMsg("");
    try {
      const res = await authFetch(`${API_BASE}/orders`, {
        method: "POST",
        body: JSON.stringify({ product_id: product.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrderMsg("Order placed successfully!");
      } else {
        setOrderMsg(data.detail || data.message || "Order failed");
      }
    } catch (e) {
      setOrderMsg(e.message || "Order failed");
    } finally {
      setOrdering(false);
    }
  }

  async function handleReport() {
    setReporting(true);
    setReportMsg("");
    try {
      const res = await authFetch(`${API_BASE}/reports`, {
        method: "POST",
        body: JSON.stringify({ product_id: id, reason: reportReason, description: reportDesc }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReportMsg("Report submitted successfully.");
        setReportOpen(false);
        setReportDesc("");
      } else {
        setReportMsg(data.detail || "Failed to submit report");
      }
    } catch (e) {
      setReportMsg(e.message || "Failed");
    } finally {
      setReporting(false);
    }
  }

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
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => navigate(-1)}>← Back</button>
          <button
            onClick={toggleFavorite}
            style={{
              background: "none",
              border: "none",
              fontSize: 26,
              cursor: "pointer",
              color: favorited ? "#ef4444" : "#cbd5e1",
              transition: "color 0.15s, transform 0.15s",
              transform: favorited ? "scale(1.15)" : "scale(1)",
            }}
            title={favorited ? "Remove from favorites" : "Add to favorites"}
          >
            {favorited ? "♥" : "♡"}
          </button>
        </div>

        <h1 style={{ marginBottom: 10 }}>{product.name}</h1>

        {product.status === "sold" && (
          <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 999, background: "#fee2e2", color: "#991b1b", fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
            SOLD
          </span>
        )}

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

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {product.status !== "sold" && user && product.seller_id && user.id !== product.seller_id && (
            <button
              onClick={handleOrder}
              disabled={ordering}
              style={{
                padding: "12px 24px",
                fontSize: 16,
                cursor: ordering ? "not-allowed" : "pointer",
                background: "#4f46e5",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              {ordering ? "Placing..." : "Buy Now"}
            </button>
          )}
          {user && product.seller_id && user.id !== product.seller_id && (
            <button
              onClick={() => navigate(`/chat/${product.seller_id}?product=${product.id}`)}
              style={{
                padding: "12px 24px",
                fontSize: 16,
                cursor: "pointer",
                background: "#0f172a",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              Chat with Seller
            </button>
          )}
        </div>
        {orderMsg && (
          <p style={{ marginTop: 12, color: orderMsg.includes("success") ? "#16a34a" : "#ef4444", fontWeight: 600 }}>
            {orderMsg}
          </p>
        )}
        {user && product.seller_id && user.id === product.seller_id && (
          <p style={{ color: "#64748b", fontSize: 14, fontStyle: "italic" }}>
            This is your product.
          </p>
        )}

        {user && product.seller_id && user.id !== product.seller_id && (
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => setReportOpen(!reportOpen)}
              style={{
                background: "none", border: "none", color: "#94a3b8",
                cursor: "pointer", fontSize: 13, textDecoration: "underline",
              }}
            >
              Report this product
            </button>

            {reportOpen && (
              <div style={{
                marginTop: 10, padding: 16, background: "#f8fafc",
                borderRadius: 10, border: "1px solid #e2e8f0",
              }}>
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Reason</label>
                <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ddd", marginBottom: 10 }}>
                  <option value="spam">Spam</option>
                  <option value="fraud">Fraud / Scam</option>
                  <option value="inappropriate">Inappropriate content</option>
                  <option value="prohibited_item">Prohibited item</option>
                  <option value="wrong_category">Wrong category</option>
                  <option value="other">Other</option>
                </select>
                <label style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Description (optional)</label>
                <textarea value={reportDesc} onChange={(e) => setReportDesc(e.target.value)}
                  placeholder="Provide more details..."
                  style={{ width: "100%", padding: 8, borderRadius: 8, border: "1px solid #ddd", minHeight: 60, resize: "vertical", marginBottom: 10 }} />
                <button onClick={handleReport} disabled={reporting}
                  style={{
                    padding: "8px 18px", background: "#ef4444", color: "#fff",
                    border: "none", borderRadius: 8, cursor: reporting ? "not-allowed" : "pointer", fontWeight: 600,
                  }}>
                  {reporting ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            )}
            {reportMsg && (
              <p style={{ marginTop: 8, fontSize: 13, color: reportMsg.includes("success") ? "#16a34a" : "#ef4444" }}>
                {reportMsg}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}