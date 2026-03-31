import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import UserCenterSidebar from "../components/UserCenterSidebar";
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

// Resolve relative media URLs to absolute
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
    // C1: prefer thumb_url for list view
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
      <div
        key={p.id}
        className="bg-white border border-gray-100 rounded-xl overflow-hidden flex flex-col"
      >
        <Link to={`/products/${p.id}`} className="block aspect-square overflow-hidden">
          <img
            src={imgSrc}
            alt={p.title}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              if (e.currentTarget.src !== placeholder) {
                e.currentTarget.src = placeholder;
              }
            }}
          />
        </Link>

        <div className="p-3 flex-1 flex flex-col">
          <h3 className="text-sm font-bold text-gray-900 truncate mb-1">{p.title}</h3>

          {p.status === "pending" && (
            <span className="inline-block w-fit bg-amber-50 text-amber-600 text-xs font-semibold px-2.5 py-0.5 rounded-full mb-1">
              Pending review
            </span>
          )}
          {p.status === "rejected" && (
            <span className="inline-block w-fit bg-red-50 text-red-700 text-xs font-semibold px-2.5 py-0.5 rounded-full mb-1">
              Rejected
            </span>
          )}
          {p.status === "sold" && (
            <span className="inline-block w-fit bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-0.5 rounded-full mb-1">
              Sold
            </span>
          )}

          <p className="text-xl font-bold text-orange-500 mt-1 mb-0.5">£{p.price}</p>
          <span className="inline-block w-fit bg-gray-50 text-gray-500 px-2 py-0.5 rounded-full text-xs mb-2">
            {CATEGORY_DISPLAY[p.category] ?? p.category} · {p.condition}
          </span>

          <div className="mt-auto pt-3 border-t border-gray-50 flex items-center gap-2">
            <Link
              to={`/my-products/${p.id}/edit`}
              className="rounded-full px-3 py-1.5 text-sm font-medium border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 no-underline transition-colors"
            >
              Edit
            </Link>

            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-sm font-medium bg-yellow-400 text-black hover:bg-yellow-500 border-0 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="rounded-full px-3 py-1.5 text-sm font-medium text-red-500 bg-red-50 hover:bg-red-100 border-0 cursor-pointer transition-colors ml-auto"
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
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto flex gap-6 pt-6 px-4">
        <UserCenterSidebar />

        <div className="flex-1 bg-white rounded-2xl p-6 shadow-sm">
          <div className="my-products-header">
            <h1>My Products</h1>
            <Link
              to="/home"
              className="text-gray-400 hover:text-gray-600 text-sm no-underline"
            >
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
              <section className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 border-l-4 border-yellow-400 pl-2">
                  My listings
                </h2>
                {onSaleProducts.length === 0 ? (
                  <div className="py-16 flex flex-col items-center justify-center">
                    <svg
                      width="48" height="48" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
                      strokeLinejoin="round" className="text-gray-300 mb-3"
                    >
                      <path d="M20 7l-8-4-8 4m16 0v10l-8 4m8-14l-8 4m0 0L4 7m8 4v10m0-10L4 7v10l8 4" />
                    </svg>
                    <p className="text-gray-400 text-sm">No active listings.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mt-4">
                    {onSaleProducts.map((p) => renderProductCard(p))}
                  </div>
                )}
              </section>

              <section className="mb-6">
                <h2 className="text-xl font-bold text-gray-900 border-l-4 border-yellow-400 pl-2">
                  Sold items
                </h2>
                {soldProducts.length === 0 ? (
                  <div className="py-16 flex flex-col items-center justify-center">
                    <svg
                      width="48" height="48" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
                      strokeLinejoin="round" className="text-gray-300 mb-3"
                    >
                      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                      <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                    <p className="text-gray-400 text-sm">No sold items yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 mt-4">
                    {soldProducts.map((p) => renderProductCard(p))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default MyProducts;
