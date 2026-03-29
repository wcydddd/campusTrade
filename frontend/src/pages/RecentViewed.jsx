import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import ProductCard from "../components/ProductCard";

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
    <div style={{ maxWidth: 1080, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>Recently Viewed</h1>
        <Link to="/home">Back to Home</Link>
      </div>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {!loading && !error && products.length === 0 && (
        <p style={{ color: "#64748b" }}>No browsing history yet.</p>
      )}
      {!loading && !error && products.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

