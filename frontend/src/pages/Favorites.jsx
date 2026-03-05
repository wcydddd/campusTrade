import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { API_BASE, authFetch } from "../api";
import "./Home.css";

export default function Favorites() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [favoritedIds, setFavoritedIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    async function fetchFavorites() {
      setLoading(true);
      try {
        const res = await authFetch(`${API_BASE}/favorites`);
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401) {
            navigate("/login");
            return;
          }
          setError("Failed to load favorites");
          return;
        }
        const list = await res.json();
        const items = Array.isArray(list) ? list : [];
        setProducts(items);
        setFavoritedIds(new Set(items.map((p) => String(p.id))));
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load favorites");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchFavorites();
    return () => { cancelled = true; };
  }, [navigate]);

  const normalizedProducts = products.map((p) => ({
    id: p.id,
    name: p.title,
    price: p.price,
    condition: p.condition || "good",
    category: p.category,
    image: p.images?.length
      ? (p.images[0].startsWith("http") ? p.images[0] : `${API_BASE}${p.images[0]}`)
      : "https://placehold.co/400x400",
  }));

  async function handleToggleFavorite(productId) {
    const id = String(productId);
    const isFav = favoritedIds.has(id);
    try {
      if (isFav) {
        const res = await authFetch(`${API_BASE}/products/${productId}/favorite`, { method: "DELETE" });
        if (res.ok) {
          setFavoritedIds((prev) => {
            const s = new Set(prev);
            s.delete(id);
            return s;
          });
          setProducts((prev) => prev.filter((p) => String(p.id) !== id));
        }
      } else {
        const res = await authFetch(`${API_BASE}/products/${productId}/favorite`, { method: "POST" });
        if (res.ok) setFavoritedIds((prev) => new Set([...prev, id]));
      }
    } catch (_) {}
  }

  return (
    <div className="home">
      <div className="home-header">
        <div>
          <button
            onClick={() => navigate("/home")}
            style={{ marginBottom: 8, padding: "8px 16px", cursor: "pointer" }}
          >
            ← Back to Home
          </button>
          <h1 className="home-title">My Favorites</h1>
          <p className="home-subtitle">Products you have saved for later.</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button className="logout-btn" onClick={() => navigate("/home")} style={{ background: "#2563eb" }}>
            Home
          </button>
          <button className="logout-btn" onClick={() => navigate("/orders")} style={{ background: "#059669" }}>
            My Orders
          </button>
        </div>
      </div>

      <div className="product-list">
        {loading && <p style={{ marginTop: 20 }}>Loading favorites...</p>}
        {error && <p style={{ marginTop: 20, color: "red" }}>{error}</p>}
        {!loading && !error && normalizedProducts.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            isFavorited={favoritedIds.has(String(product.id))}
            onToggleFavorite={handleToggleFavorite}
          />
        ))}
        {!loading && !error && normalizedProducts.length === 0 && (
          <p style={{ marginTop: 20 }}>No favorites yet. Add some from the homepage!</p>
        )}
      </div>
    </div>
  );
}
