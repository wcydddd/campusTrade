import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import ProductCard from "../components/ProductCard";

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function SellerProfile() {
  const { sellerId } = useParams();
  const [seller, setSeller] = useState(null);
  const [products, setProducts] = useState([]);
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const [sellerRes, productsRes, repRes] = await Promise.all([
          authFetch(`${API_BASE}/auth/public/${sellerId}`),
          authFetch(`${API_BASE}/products/seller/${sellerId}`),
          fetch(`${API_BASE}/reviews/user/${sellerId}?limit=10`),
        ]);

        if (!sellerRes.ok) {
          const d = await sellerRes.json().catch(() => ({}));
          throw new Error(d.detail || "Seller not found");
        }
        if (!productsRes.ok) {
          const d = await productsRes.json().catch(() => ({}));
          throw new Error(d.detail || "Failed to load seller products");
        }

        const sellerData = await sellerRes.json();
        const list = await productsRes.json();
        const repData = await repRes.json().catch(() => null);
        if (cancelled) return;

        setSeller(sellerData);
        setProducts(Array.isArray(list) ? list : []);
        setRep(repData && repData.summary ? repData : null);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load seller profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const normalizedProducts = useMemo(() => {
    const placeholder = "https://placehold.co/400x400";
    return products.map((p) => {
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
  }, [products]);

  if (loading) return <div style={{ padding: 24 }}>Loading seller profile...</div>;
  if (error) return <div style={{ padding: 24, color: "#b91c1c" }}>{error}</div>;
  if (!seller) return <div style={{ padding: 24 }}>Seller not found.</div>;

  const avatar = seller.avatar_url
    ? (seller.avatar_url.startsWith("http") ? seller.avatar_url : `${API_BASE}${seller.avatar_url}`)
    : "https://placehold.co/120x120";

  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Seller Profile</h1>
        <Link to="/home">Back to Home</Link>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 20, border: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <img
            src={avatar}
            alt={seller.username || "seller"}
            style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover" }}
            onError={(e) => {
              e.currentTarget.src = "https://placehold.co/120x120";
            }}
          />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {seller.username}
              {seller.is_verified ? <span style={{ marginLeft: 8, fontSize: 14, color: "#16a34a" }}>Verified</span> : null}
            </div>
            <p style={{ margin: "6px 0 0", color: "#4b5563" }}>{seller.bio || "This seller has not added a bio yet."}</p>
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginBottom: 20, border: "1px solid #e5e7eb" }}>
        <h3 style={{ marginTop: 0 }}>Reputation</h3>
        <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>
            {rep?.summary ? rep.summary.avg_rating.toFixed(2) : "0.00"}
            <span style={{ fontSize: 14, fontWeight: 600, color: "#64748b", marginLeft: 8 }}>/ 5</span>
          </div>
          <div style={{ color: "#475569" }}>
            {rep?.summary ? rep.summary.total_reviews : 0} review(s)
          </div>
        </div>
        {rep?.items?.length ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {rep.items.map((r) => (
              <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a" }}>
                    {r.reviewer_username || "User"} · {r.rating}/5
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                  </div>
                </div>
                {r.comment ? (
                  <p style={{ margin: "8px 0 0", color: "#334155" }}>{r.comment}</p>
                ) : (
                  <p style={{ margin: "8px 0 0", color: "#94a3b8", fontStyle: "italic" }}>No comment</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ marginTop: 10, marginBottom: 0, color: "#6b7280" }}>No reviews yet.</p>
        )}
      </div>

      <h2 style={{ marginBottom: 12 }}>On-sale Products</h2>
      {normalizedProducts.length === 0 ? (
        <p style={{ color: "#6b7280" }}>No available products from this seller at the moment.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {normalizedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

