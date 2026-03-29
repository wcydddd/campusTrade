import { useState, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import "./MyOrders.css";

const STATUS_LABEL = {
  pending: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_CLASS = {
  pending: "status-pending",
  confirmed: "status-confirmed",
  completed: "status-completed",
  cancelled: "status-cancelled",
};

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function MyOrders() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState("buyer");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewOrder, setReviewOrder] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMsg, setReviewMsg] = useState("");

  const orderRefs = useRef({});
  const switchedTabRef = useRef(false);

  const focusOrderId = useMemo(() => {
    const sp = new URLSearchParams(location.search || "");
    const v = sp.get("focus");
    return v || "";
  }, [location.search]);

  const [focusedId, setFocusedId] = useState("");

  useEffect(() => {
    // focus 变化时重置“一次性自动切 tab”
    switchedTabRef.current = false;
    setFocusedId(focusOrderId || "");
  }, [focusOrderId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`${API_BASE}/orders?role=${tab}`);
        if (!cancelled && res.ok) {
          setOrders(await res.json());
        } else if (!cancelled) {
          const d = await res.json().catch(() => ({}));
          setError(d.detail || "Failed to load orders");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tab]);

  useEffect(() => {
    if (loading || error || !focusedId) return;
    const el = orderRefs.current[focusedId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // 高亮几秒
      const t = setTimeout(() => setFocusedId(""), 2800);
      return () => clearTimeout(t);
    }
    // 当前 tab 没找到，就自动切换一次到另一 tab 再找
    if (!switchedTabRef.current) {
      switchedTabRef.current = true;
      setTab((prev) => (prev === "buyer" ? "seller" : "buyer"));
    }
  }, [loading, error, focusedId, tab, orders]);

  async function updateStatus(orderId, action) {
    // 防止按钮点击触发卡片跳转
    try {
      const res = await authFetch(`${API_BASE}/orders/${orderId}/${action}`, { method: "PATCH" });
      if (res.ok) {
        const updated = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: updated.status ?? action.replace("confirm", "confirmed").replace("complete", "completed").replace("cancel", "cancelled") } : o)));
      } else {
        const d = await res.json().catch(() => ({}));
        alert(d.detail || "Operation failed");
      }
    } catch (e) {
      alert(e.message || "Operation failed");
    }
  }

  function openReview(order) {
    setReviewMsg("");
    setReviewOrder(order);
    setReviewRating(5);
    setReviewComment("");
    setReviewOpen(true);
  }

  async function submitReview() {
    if (!reviewOrder?.id) return;
    setReviewSubmitting(true);
    setReviewMsg("");
    try {
      const res = await authFetch(`${API_BASE}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          order_id: reviewOrder.id,
          rating: Number(reviewRating),
          comment: reviewComment.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.detail || data.message || "Failed to submit review";
        setReviewMsg(msg);
        // 如果后端提示已评价过，也直接隐藏按钮，避免反复点
        if (res.status === 409) {
          setOrders((prev) =>
            prev.map((o) => (o.id === reviewOrder.id ? { ...o, _reviewed_by_me: true } : o))
          );
        }
        return;
      }
      setReviewMsg("Review submitted");
      setOrders((prev) =>
        prev.map((o) => (o.id === reviewOrder.id ? { ...o, _reviewed_by_me: true } : o))
      );
      setTimeout(() => {
        setReviewOpen(false);
        setReviewOrder(null);
      }, 800);
    } catch (e) {
      setReviewMsg(e.message || "Failed to submit review");
    } finally {
      setReviewSubmitting(false);
    }
  }

  const fallbackImg = "https://placehold.co/80x80";

  return (
    <div className="my-orders">
      <div className="my-orders-top">
        <h1>My Orders</h1>
        <Link to="/home" className="my-orders-back">Back to Home</Link>
      </div>

      <div className="my-orders-tabs">
        <button className={`tab-btn ${tab === "buyer" ? "tab-active" : ""}`} onClick={() => setTab("buyer")}>
          As Buyer
        </button>
        <button className={`tab-btn ${tab === "seller" ? "tab-active" : ""}`} onClick={() => setTab("seller")}>
          As Seller
        </button>
      </div>

      {loading && <p className="my-orders-msg">Loading...</p>}
      {error && <p className="my-orders-error">{error}</p>}

      {!loading && !error && orders.length === 0 && (
        <p className="my-orders-msg">No orders yet.</p>
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="my-orders-list">
          {orders.map((order) => {
            const img = resolveMediaUrl(order.product_image || order.product?.images?.[0]) || fallbackImg;
            const isFocused = focusedId && order.id === focusedId;
            return (
              <div
                key={order.id}
                className="order-card"
                role="button"
                tabIndex={0}
                ref={(node) => {
                  if (node) orderRefs.current[order.id] = node;
                }}
                onClick={() => navigate(`/orders/${order.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate(`/orders/${order.id}`);
                }}
                style={
                  isFocused
                    ? { border: "2px solid #4f46e5", boxShadow: "0 0 0 4px rgba(79,70,229,0.15)" }
                    : undefined
                }
              >
                <img src={img} alt="" className="order-card-img" onError={(e) => { e.currentTarget.src = fallbackImg; }} />
                <div className="order-card-body">
                  <h3>{order.product_title || order.product?.title || "Product"}</h3>
                  <p className="order-card-price">£{order.price ?? order.product?.price ?? "-"}</p>
                  <p className="order-card-meta">
                    {tab === "buyer" ? `Seller: ${order.seller_name || "—"}` : `Buyer: ${order.buyer_name || "—"}`}
                  </p>
                  <span className={`order-status ${STATUS_CLASS[order.status] || ""}`}>
                    {STATUS_LABEL[order.status] || order.status}
                  </span>
                </div>
                <div className="order-card-actions">
                  {tab === "seller" && order.status === "pending" && (
                    <>
                      <button className="btn-confirm" onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "confirm"); }}>Confirm</button>
                      <button className="btn-cancel" onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "cancel"); }}>Cancel</button>
                    </>
                  )}
                  {order.status === "confirmed" && (
                    <button className="btn-complete" onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "complete"); }}>Complete</button>
                  )}
                  {tab === "buyer" && order.status === "pending" && (
                    <button className="btn-cancel" onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "cancel"); }}>Cancel</button>
                  )}
                  {order.status === "completed" && !order.reviewed_by_me && !order._reviewed_by_me && (
                    <button className="btn-complete" onClick={(e) => { e.stopPropagation(); openReview(order); }}>Review</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {reviewOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setReviewOpen(false)}
        >
          <div
            style={{
              width: "min(560px, 100%)",
              background: "#fff",
              borderRadius: 14,
              padding: 16,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0 }}>Leave a review</h3>
              <button
                type="button"
                onClick={() => setReviewOpen(false)}
                style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer" }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p style={{ margin: "10px 0 14px", color: "#475569" }}>
              {tab === "buyer" ? "Review seller" : "Review buyer"} · Order #{reviewOrder?.id?.slice?.(-6) || ""}
            </p>

            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Rating (1-5)</label>
            <select
              value={reviewRating}
              onChange={(e) => setReviewRating(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 12 }}
            >
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Comment (optional)</label>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={4}
              style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #e5e7eb", resize: "vertical" }}
              placeholder="Share your experience..."
            />

            {reviewMsg && (
              <p style={{ marginTop: 10, color: reviewMsg.toLowerCase().includes("submitted") ? "#16a34a" : "#ef4444", fontWeight: 700 }}>
                {reviewMsg}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={() => setReviewOpen(false)} disabled={reviewSubmitting}>
                Cancel
              </button>
              <button type="button" onClick={submitReview} disabled={reviewSubmitting}>
                {reviewSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
