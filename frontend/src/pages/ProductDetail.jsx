import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { API_BASE, authFetch } from "../api";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [buyError, setBuyError] = useState("");
  const [buying, setBuying] = useState(false);
  const [isMyProduct, setIsMyProduct] = useState(null);
  const [isFavorited, setIsFavorited] = useState(null);
  const [favoriting, setFavoriting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchProduct() {
      try {
        const res = await fetch(`${API_BASE}/products/${id}`);
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 404) setProduct(null);
          else setError("Failed to load product");
          return;
        }
        const data = await res.json();
        setProduct({
          id: data.id,
          name: data.title,
          price: data.price,
          condition: data.condition || "good",
          description: data.description,
          status: data.status || "available",
          seller_id: data.seller_id,
          image: data.images?.length
            ? (data.images[0].startsWith("http") ? data.images[0] : `${API_BASE}${data.images[0]}`)
            : "https://dummyimage.com/600x400/cccccc/000000&text=CampusTrade",
        });
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load product");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (id) fetchProduct();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!product || product.status !== "available") {
      setIsMyProduct(false);
      return;
    }
    let cancelled = false;
    setIsMyProduct(null);
    async function checkIsMyProduct() {
      try {
        const res = await authFetch(`${API_BASE}/products/user/me`);
        if (cancelled) return;
        if (!res.ok) {
          setIsMyProduct(false);
          return;
        }
        const myProducts = await res.json();
        const found = Array.isArray(myProducts) && myProducts.some((p) => String(p.id) === String(product.id));
        if (!cancelled) setIsMyProduct(found);
      } catch {
        if (!cancelled) setIsMyProduct(false);
      }
    }
    checkIsMyProduct();
    return () => { cancelled = true; };
  }, [product?.id, product?.status]);

  useEffect(() => {
    if (!product?.id) return;
    let cancelled = false;
    setIsFavorited(null);
    async function checkFavorited() {
      try {
        const res = await authFetch(`${API_BASE}/favorites`);
        if (cancelled) return;
        if (!res.ok) {
          setIsFavorited(false);
          return;
        }
        const list = await res.json();
        const found = Array.isArray(list) && list.some((p) => String(p.id) === String(product.id));
        if (!cancelled) setIsFavorited(found);
      } catch {
        if (!cancelled) setIsFavorited(false);
      }
    }
    checkFavorited();
    return () => { cancelled = true; };
  }, [product?.id]);

  async function toggleFavorite() {
    setFavoriting(true);
    try {
      if (isFavorited) {
        const res = await authFetch(`${API_BASE}/products/${product.id}/favorite`, { method: "DELETE" });
        if (res.ok) setIsFavorited(false);
      } else {
        const res = await authFetch(`${API_BASE}/products/${product.id}/favorite`, { method: "POST" });
        if (res.ok) setIsFavorited(true);
      }
    } finally {
      setFavoriting(false);
    }
  }

  const fallbackImg =
    "https://dummyimage.com/600x400/cccccc/000000&text=CampusTrade";

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
          onError={(e) => {
            e.currentTarget.src = fallbackImg;
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
        {product.description && (
          <p style={{ marginBottom: 20, color: "#555" }}>{product.description}</p>
        )}

        {product.status && product.status !== "available" && (
          <p style={{ marginBottom: 12, color: "#b45309", fontWeight: 500 }}>
            Status: {product.status === "reserved" ? "已预订" : "已售出"}
          </p>
        )}

        {buyError && (
          <p style={{ marginBottom: 12, color: "#dc2626" }}>{buyError}</p>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {product.status === "available" && (
            <>
              {isMyProduct === true && (
                <p style={{ marginBottom: 12, color: "#6b7280", fontStyle: "italic" }}>
                  This is your listing. You cannot buy your own product.
                </p>
              )}
              {isMyProduct === false && (
                <button
                    onClick={async () => {
                      setBuying(true);
                      setBuyError("");
                      try {
                        const res = await authFetch(`${API_BASE}/orders`, {
                          method: "POST",
                          body: JSON.stringify({ product_id: product.id }),
                        });
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err.detail || "Failed to create order");
                        }
                        navigate("/orders");
                      } catch (e) {
                        setBuyError(e.message || "Failed to create order");
                      } finally {
                        setBuying(false);
                      }
                    }}
                    disabled={buying}
                    style={{
                      padding: "10px 20px",
                      fontSize: 16,
                      cursor: "pointer",
                      background: "#2563eb",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                    }}
                  >
                    {buying ? "Creating..." : "Buy Now"}
                  </button>
              )}
              {isMyProduct === null && (
                <span style={{ color: "#9ca3af", fontSize: 14 }}>Checking...</span>
              )}
            </>
          )}
          {isFavorited != null && (
            <button
              onClick={toggleFavorite}
              disabled={favoriting}
              style={{
                padding: "10px 20px",
                fontSize: 16,
                cursor: "pointer",
                border: "1px solid #e11d48",
                borderRadius: 8,
                background: isFavorited ? "#e11d48" : "#fff",
                color: isFavorited ? "#fff" : "#e11d48",
              }}
            >
              {favoriting ? "..." : isFavorited ? "♥ Favorited" : "♡ Add to Favorites"}
            </button>
          )}
          <button
            onClick={() => navigate(`/chat/${product.id}`)}
            style={{
              padding: "10px 20px",
              fontSize: 16,
              cursor: "pointer",
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          >
            Chat with Seller
          </button>
        </div>
      </div>
    </div>
  );
}