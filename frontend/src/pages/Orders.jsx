import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch, API_BASE } from "../api";
import "./Orders.css";

const STATUS_LABEL = {
  pending: "待确认",
  confirmed: "已确认",
  completed: "已完成",
  cancelled: "已取消",
};

export default function Orders() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [role, setRole] = useState(""); // "buyer" | "seller" | ""
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioning, setActioning] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchOrders() {
      setLoading(true);
      try {
        const url = role ? `${API_BASE}/orders/my?role=${role}` : `${API_BASE}/orders/my`;
        const res = await authFetch(url);
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401) {
            navigate("/login");
            return;
          }
          setError("Failed to load orders");
          return;
        }
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load orders");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchOrders();
    return () => { cancelled = true; };
  }, [role, navigate]);

  async function doAction(orderId, action) {
    setActioning(orderId);
    setError("");
    try {
      const res = await authFetch(`${API_BASE}/orders/${orderId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Action failed`);
      }
      const updated = await res.json();
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o))
      );
    } catch (e) {
      setError(e.message || "Action failed");
    } finally {
      setActioning(null);
    }
  }

  const userId = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      return u?.id || u?.user_id || "";
    } catch {
      return "";
    }
  })();

  const isSeller = (o) => o.seller_id === userId;
  const isBuyer = (o) => o.buyer_id === userId;

  const canConfirm = (o) =>
    o.status === "pending" && isSeller(o);
  const canComplete = (o) =>
    o.status === "confirmed" && (isBuyer(o) || isSeller(o));
  const canCancel = (o) =>
    (o.status === "pending" || o.status === "confirmed") &&
    (isBuyer(o) || isSeller(o));

  return (
    <div className="orders-page">
      <div className="orders-header">
        <button className="back-btn" onClick={() => navigate("/home")}>
          ← Back to Home
        </button>
        <h1>My Orders</h1>
        <div className="role-tabs">
          <button
            className={role === "" ? "active" : ""}
            onClick={() => setRole("")}
          >
            All
          </button>
          <button
            className={role === "buyer" ? "active" : ""}
            onClick={() => setRole("buyer")}
          >
            As Buyer
          </button>
          <button
            className={role === "seller" ? "active" : ""}
            onClick={() => setRole("seller")}
          >
            As Seller
          </button>
        </div>
      </div>

      {error && <p className="orders-error">{error}</p>}
      {loading && <p className="orders-loading">Loading orders...</p>}

      {!loading && orders.length === 0 && (
        <p className="orders-empty">No orders found.</p>
      )}

      {!loading && orders.length > 0 && (
        <div className="orders-list">
          {orders.map((o) => (
            <div key={o.id} className="order-card">
              <div className="order-product">
                <span className="order-title">{o.product_title}</span>
                <span className="order-price">£{o.product_price}</span>
              </div>
              <div className="order-meta">
                <span className={`order-status status-${o.status}`}>
                  {STATUS_LABEL[o.status] || o.status}
                </span>
                <span className="order-date">
                  {new Date(o.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="order-actions">
                {canConfirm(o) && (
                  <button
                    className="btn-confirm"
                    onClick={() => doAction(o.id, "confirm")}
                    disabled={actioning === o.id}
                  >
                    {actioning === o.id ? "..." : "Confirm"}
                  </button>
                )}
                {canComplete(o) && (
                  <button
                    className="btn-complete"
                    onClick={() => doAction(o.id, "complete")}
                    disabled={actioning === o.id}
                  >
                    {actioning === o.id ? "..." : "Complete"}
                  </button>
                )}
                {canCancel(o) && (
                  <button
                    className="btn-cancel"
                    onClick={() => doAction(o.id, "cancel")}
                    disabled={actioning === o.id}
                  >
                    {actioning === o.id ? "..." : "Cancel"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
