import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./MyProducts.css";

// Backend returns category in Chinese; show English to user
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

function MyProducts() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [boostingId, setBoostingId] = useState("");
  const [actionMsg, setActionMsg] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authFetch(`${API_BASE}/products/user/me`);
        if (!cancelled && res.ok) {
          const list = await res.json();
          setProducts(Array.isArray(list) ? list : []);
        } else if (!cancelled && !res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.detail || data.message || "Failed to load");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id, title) {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try {
      const res = await authFetch(`${API_BASE}/products/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setProducts((prev) => prev.filter((p) => p.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || data.message || "Delete failed");
      }
    } catch (e) {
      alert(e.message || "Delete failed");
    }
  }

  async function handleBoost(id) {
    setActionMsg("");
    setBoostingId(id);
    try {
      const res = await authFetch(`${API_BASE}/products/${id}/boost`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setActionMsg("Boosted successfully. Your item is now pushed higher in listings.");
        // move boosted item to front in current page for immediate feedback
        setProducts((prev) => {
          const target = prev.find((p) => p.id === id);
          if (!target) return prev;
          const rest = prev.filter((p) => p.id !== id);
          return [{ ...target, boosted_at: data.boosted_at || new Date().toISOString() }, ...rest];
        });
      } else if (res.status === 429) {
        const msg = data?.detail?.message || data?.message || "This product can be boosted once every 24 hours.";
        setActionMsg(msg);
      } else {
        setActionMsg(data?.detail || data?.message || "Boost failed");
      }
    } catch (e) {
      setActionMsg(e.message || "Boost failed");
    } finally {
      setBoostingId("");
    }
  }

  const placeholder = "https://placehold.co/400x400";
  const onSaleProducts = products.filter((p) => p.status !== "sold");
  const soldProducts = products.filter((p) => p.status === "sold");

  function renderProductCard(p) {
    // ✅ C1：列表优先 thumb_url
    const thumbRaw =
      p.thumb_url ||
      p.thumbnail_url ||
      p.thumbUrl ||
      p.thumbnailUrl ||
      "";

    const fullRaw =
      p.image_url ||
      p.imageUrl ||
      (p.images?.length ? p.images[0] : "");

    const imgSrc =
      resolveMediaUrl(thumbRaw) ||
      resolveMediaUrl(fullRaw) ||
      placeholder;

    return (
      <div key={p.id} className="my-products-card">
        <Link
          to={`/products/${p.id}`}
          className="my-products-card-image-wrap"
        >
          <img
            src={imgSrc}
            alt={p.title}
            loading="lazy"
            onError={(e) => {
              if (e.currentTarget.src !== placeholder) {
                e.currentTarget.src = placeholder;
              }
            }}
          />
        </Link>

        <div className="my-products-card-body">
          <h3>{p.title}</h3>
          {p.status === "pending" && (
            <span style={{
              display: "inline-block", padding: "2px 10px", borderRadius: 999,
              background: "#fffbeb", color: "#b45309", fontSize: 12, fontWeight: 600, marginBottom: 4,
            }}>
              Pending review
            </span>
          )}
          {p.status === "rejected" && (
            <span style={{
              display: "inline-block", padding: "2px 10px", borderRadius: 999,
              background: "#fef2f2", color: "#b91c1c", fontSize: 12, fontWeight: 600, marginBottom: 4,
            }}>
              Rejected
            </span>
          )}
          {p.status === "sold" && (
            <span style={{
              display: "inline-block", padding: "2px 10px", borderRadius: 999,
              background: "#ecfdf5", color: "#047857", fontSize: 12, fontWeight: 600, marginBottom: 4,
            }}>
              Sold
            </span>
          )}
          <p className="my-products-card-price">£{p.price}</p>
          <p className="my-products-card-meta">
            {CATEGORY_DISPLAY[p.category] ?? p.category} · {p.condition}
          </p>

          <div className="my-products-card-actions">
            <Link
              to={`/my-products/${p.id}/edit`}
              className="my-products-btn my-products-btn-edit"
            >
              Edit
            </Link>

            <button
              type="button"
              className="my-products-btn my-products-btn-boost"
              onClick={() => handleBoost(p.id)}
              disabled={
                boostingId === p.id ||
                p.status === "sold" ||
                p.status === "removed"
              }
              title={
                p.status === "sold" || p.status === "removed"
                  ? "Sold or removed products cannot be boosted"
                  : "Boost this product"
              }
            >
              {boostingId === p.id ? "Boosting..." : "Boost"}
            </button>

            <button
              type="button"
              className="my-products-btn my-products-btn-delete"
              onClick={() => handleDelete(p.id, p.title)}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-products">
      <div className="my-products-header">
        <h1>My Products</h1>
        <Link to="/home" className="my-products-back">
          Back to Home
        </Link>
      </div>

      {loading && <p className="my-products-msg">Loading...</p>}
      {error && <p className="my-products-error">{error}</p>}
      {!error && actionMsg && <p className="my-products-msg">{actionMsg}</p>}

      {!loading && !error && products.length === 0 && (
        <p className="my-products-msg">
          You have not published any products yet.
        </p>
      )}

      {!loading && !error && products.length > 0 && (
        <>
          <section className="my-products-section">
            <h2 className="my-products-section-title">My listings</h2>
            {onSaleProducts.length === 0 ? (
              <p className="my-products-msg">No active listings.</p>
            ) : (
              <div className="my-products-list">
                {onSaleProducts.map((p) => renderProductCard(p))}
              </div>
            )}
          </section>

          <section className="my-products-section">
            <h2 className="my-products-section-title">Sold items</h2>
            {soldProducts.length === 0 ? (
              <p className="my-products-msg">No sold items yet.</p>
            ) : (
              <div className="my-products-list">
                {soldProducts.map((p) => renderProductCard(p))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default MyProducts;