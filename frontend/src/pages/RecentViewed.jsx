import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import ProductCard from "../components/ProductCard";
import UserCenterSidebar from "../components/UserCenterSidebar";

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function RecentViewed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`${API_BASE}/products/history/me?limit=30`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setItems(Array.isArray(data?.items) ? data.items : []);
        } else if (!cancelled) {
          setError(data?.detail || data?.message || "Failed to load browsing history");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load browsing history");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const products = useMemo(() => {
    const placeholder = "https://placehold.co/400x400";
    return items.map((it) => {
      const p = it.product || {};
      const thumbRaw = p.thumb_url || p.thumbnail_url || "";
      const fullRaw = p.image_url || p.imageUrl || (p.images?.length ? p.images[0] : "");
      return {
        id: p.id,
        name: p.title,
        price: p.price,
        condition: p.condition || "good",
        category: p.category,
        status: p.status || "available",
        is_favorited: !!p.is_favorited,
        thumb: resolveMediaUrl(thumbRaw) || resolveMediaUrl(fullRaw) || placeholder,
        image: resolveMediaUrl(fullRaw) || resolveMediaUrl(thumbRaw) || placeholder,
      };
    });
  }, [items]);

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto flex gap-6 pt-6 px-4 pb-10">
        <UserCenterSidebar />

        <section className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6">
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight m-0">Recently Viewed</h1>
            <Link
              to="/home"
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors no-underline"
            >
              &larr; Back to Home
            </Link>
          </div>

          {/* Tabs */}
          <div className="px-6 mt-4 flex items-end gap-6 border-b border-gray-100">
            <button
              type="button"
              className="relative pb-3 text-sm font-bold text-gray-900 bg-transparent border-none cursor-pointer px-0 after:content-[''] after:absolute after:left-1/2 after:-translate-x-1/2 after:bottom-0 after:w-8 after:h-[3px] after:rounded-full after:bg-amber-400"
            >
              All
            </button>
          </div>

          {/* Content */}
          <div className="px-6 pb-6">
            {loading && <p className="text-gray-400 mt-5">Loading...</p>}
            {error && <p className="text-red-700 mt-5">{error}</p>}

            {!loading && !error && products.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24">
                <svg
                  className="w-16 h-16 text-gray-200 mb-3"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <p className="text-sm text-gray-400 m-0">No browsing history yet.</p>
              </div>
            )}

            {!loading && !error && products.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-6">
                {products.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

