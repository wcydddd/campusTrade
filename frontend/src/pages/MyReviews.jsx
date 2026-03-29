import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";

export default function MyReviews() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`${API_BASE}/reviews/me?limit=200`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setItems(Array.isArray(data.items) ? data.items : []);
        } else if (!cancelled) {
          setError(data.detail || data.message || "Failed to load reviews");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load reviews");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>My Reviews</h1>
        <Link to="/home">Back to Home</Link>
      </div>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p style={{ color: "#64748b" }}>You haven't left any reviews yet.</p>
      )}

      {!loading && !error && items.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((r) => (
            <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>
                  To: {r.reviewee_username || "User"} · {r.rating}/5
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                </div>
              </div>
              {r.comment ? (
                <p style={{ margin: "10px 0 0", color: "#334155" }}>{r.comment}</p>
              ) : (
                <p style={{ margin: "10px 0 0", color: "#94a3b8", fontStyle: "italic" }}>No comment</p>
              )}
              <div style={{ marginTop: 10, fontSize: 12, color: "#94a3b8" }}>
                <button
                  type="button"
                  onClick={() => navigate(`/my-orders?focus=${encodeURIComponent(r.order_id || "")}`)}
                  style={{
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: "#4f46e5",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: 12,
                  }}
                  title="Go to this order"
                >
                  Order: {String(r.order_id || "").slice(-8)}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

