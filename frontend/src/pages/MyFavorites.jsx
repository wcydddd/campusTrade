import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
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
    <div className="my-favorites">
      <div className="my-favorites-top">
        <h1>My Favorites</h1>
        <Link to="/home" className="my-favorites-back">Back to Home</Link>
      </div>

      {loading && <p className="my-favorites-msg">Loading...</p>}
      {error && <p className="my-favorites-error">{error}</p>}

      {!loading && !error && products.length === 0 && (
        <p className="my-favorites-msg">No favorites yet. Browse products and tap the heart!</p>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="my-favorites-grid">
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
  );
}
