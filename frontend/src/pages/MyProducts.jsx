import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./MyProducts.css";

function MyProducts() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authFetch(`${API_BASE}/products/user/me`);
        if (!cancelled && res.ok) {
          const list = await res.json();
          setProducts(list);
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
    return () => { cancelled = true; };
  }, []);

  async function handleDelete(id, title) {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try {
      const res = await authFetch(`${API_BASE}/products/${id}`, { method: "DELETE" });
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

  return (
    <div className="my-products">
      <div className="my-products-header">
        <h1>My Products</h1>
        <Link to="/home" className="my-products-back">Back to Home</Link>
      </div>

      {loading && <p className="my-products-msg">Loading...</p>}
      {error && <p className="my-products-error">{error}</p>}

      {!loading && !error && products.length === 0 && (
        <p className="my-products-msg">You have not published any products yet.</p>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="my-products-list">
          {products.map((p) => (
            <div key={p.id} className="my-products-card">
              <Link to={`/products/${p.id}`} className="my-products-card-image-wrap">
                <img
                  src={
                    p.images?.length
                      ? p.images[0].startsWith("http")
                        ? p.images[0]
                        : `${API_BASE}${p.images[0]}`
                      : "https://placehold.co/400x400"
                  }
                  alt={p.title}
                />
              </Link>
              <div className="my-products-card-body">
                <h3>{p.title}</h3>
                <p className="my-products-card-price">£{p.price}</p>
                <p className="my-products-card-meta">{p.category} · {p.condition}</p>
                <div className="my-products-card-actions">
                  <Link to={`/my-products/${p.id}/edit`} className="my-products-btn my-products-btn-edit">
                    Edit
                  </Link>
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
          ))}
        </div>
      )}
    </div>
  );
}

export default MyProducts;
