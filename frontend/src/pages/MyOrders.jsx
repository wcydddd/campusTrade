import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
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
  const [tab, setTab] = useState("buyer");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  async function updateStatus(orderId, action) {
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
            return (
              <div key={order.id} className="order-card">
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
                      <button className="btn-confirm" onClick={() => updateStatus(order.id, "confirm")}>Confirm</button>
                      <button className="btn-cancel" onClick={() => updateStatus(order.id, "cancel")}>Cancel</button>
                    </>
                  )}
                  {order.status === "confirmed" && (
                    <button className="btn-complete" onClick={() => updateStatus(order.id, "complete")}>Complete</button>
                  )}
                  {tab === "buyer" && order.status === "pending" && (
                    <button className="btn-cancel" onClick={() => updateStatus(order.id, "cancel")}>Cancel</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
