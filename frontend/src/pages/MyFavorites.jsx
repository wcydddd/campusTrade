import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import UserCenterSidebar from "../components/UserCenterSidebar";
import { API_BASE, authFetch } from "../api";
import "./MyFavorites.css";

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function MyFavorites() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`${API_BASE}/favorites`);
        if (!cancelled && res.ok) {
          const list = await res.json();
          const normalized = (Array.isArray(list) ? list : []).map((p) => {
            const placeholder = "https://placehold.co/400x400";
            const thumbRaw = p.thumb_url || p.thumbnail_url || "";
            const fullRaw = p.image_url || p.imageUrl || (p.images?.length ? p.images[0] : "");
            return {
              id: p.id,
              name: p.title,
              price: p.price,
              condition: p.condition || "good",
              category: p.category,
              is_favorited: true,
              thumb: resolveMediaUrl(thumbRaw) || resolveMediaUrl(fullRaw) || placeholder,
              image: resolveMediaUrl(fullRaw) || resolveMediaUrl(thumbRaw) || placeholder,
            };
          });
          setProducts(normalized);
        } else if (!cancelled) {
          const d = await res.json().catch(() => ({}));
          setError(d.detail || "Failed to load favorites");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load favorites");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f4f4]">
      <div className="max-w-7xl mx-auto flex gap-6 pt-6 px-4 pb-10">
        <UserCenterSidebar />

        {/* ---- Main Content ---- */}
        <section className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6">
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">My Favorites</h1>
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
            {error && <p className="text-red-500 mt-5">{error}</p>}

            {!loading && !error && products.length === 0 && (
              <div className="flex flex-col items-center justify-center py-32">
                <svg
                  className="w-20 h-20 text-gray-300 mb-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                <p className="text-gray-400 text-base">No favorites yet.</p>
                <p className="text-gray-300 text-sm mt-1">Browse products and tap the heart!</p>
              </div>
            )}

            {!loading && !error && products.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-6">
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onUnfavorited={(id) => setProducts((prev) => prev.filter((x) => x.id !== id))}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
