import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import "./MyOrders.css";

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

function labelStatus(s) {
  return s ? String(s) : "—";
}

export default function OrderDetail() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await authFetch(`${API_BASE}/orders/${orderId}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(d.detail || d.message || `Failed to load order (HTTP ${res.status})`);
          setData(null);
          return;
        }
        setData(d);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (orderId) load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const isBuyer = useMemo(() => {
    if (!user?.id || !data?.buyer?.id) return false;
    return String(user.id) === String(data.buyer.id);
  }, [user?.id, data?.buyer?.id]);

  const me = isBuyer ? data?.buyer : data?.seller;
  const other = isBuyer ? data?.seller : data?.buyer;

  const product = data?.product || {};
  const images = Array.isArray(product.images) ? product.images : [];
  const hero = resolveMediaUrl(images[0]) || "https://placehold.co/600x400";

  if (loading) {
    return (
      <div className="my-orders">
        <div className="my-orders-top">
          <h1>Order Detail</h1>
          <Link to="/my-orders" className="my-orders-back">Back to My Orders</Link>
        </div>
        <p className="my-orders-msg">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="my-orders">
        <div className="my-orders-top">
          <h1>Order Detail</h1>
          <Link to="/my-orders" className="my-orders-back">Back to My Orders</Link>
        </div>
        <p className="my-orders-error">{error || "Order not found"}</p>
      </div>
    );
  }

  return (
    <div className="my-orders">
      <div className="my-orders-top">
        <h1>Order Detail</h1>
        <button
          type="button"
          className="logout-btn"
          onClick={() => navigate("/my-orders")}
          style={{ width: "auto" }}
        >
          Back to My Orders
        </button>
      </div>

      <div className="order-card" style={{ cursor: "default" }}>
        <img
          src={hero}
          alt=""
          className="order-card-img"
          onError={(e) => {
            e.currentTarget.src = "https://placehold.co/600x400";
          }}
          style={{ width: 120, height: 120 }}
        />
        <div className="order-card-body">
          <h3 style={{ marginBottom: 6 }}>{product.title || "Product"}</h3>
          <p className="order-card-price">£{data.final_price ?? product.price ?? "-"}</p>
          <p className="order-card-meta" style={{ marginTop: 6 }}>
            <b>Order ID:</b> {data.id}
          </p>
          <p className="order-card-meta">
            <b>Status:</b> {labelStatus(data.status)}
          </p>
          <p className="order-card-meta">
            <b>Created at:</b> {data.created_at ? new Date(data.created_at).toLocaleString() : "—"}
          </p>
          <p className="order-card-meta">
            <b>Updated at:</b> {data.updated_at ? new Date(data.updated_at).toLocaleString() : "—"}
          </p>
        </div>
      </div>

      <div className="order-card" style={{ cursor: "default" }}>
        <div className="order-card-body" style={{ width: "100%" }}>
          <h3 style={{ marginBottom: 10 }}>Product Info</h3>
          <p className="order-card-meta"><b>Description:</b> {product.description || "—"}</p>
          <p className="order-card-meta"><b>Category:</b> {product.category || "—"}</p>
          <p className="order-card-meta"><b>Condition:</b> {product.condition || "—"}</p>
          <p className="order-card-meta"><b>Seller ID:</b> {product.seller_id || data?.seller?.id || "—"}</p>
        </div>
      </div>

      <div className="order-card" style={{ cursor: "default" }}>
        <div className="order-card-body" style={{ width: "100%" }}>
          <h3 style={{ marginBottom: 10 }}>{isBuyer ? "Seller Info" : "Buyer Info"}</h3>
          <p className="order-card-meta"><b>Username:</b> {other?.username || "—"}</p>
          <p className="order-card-meta"><b>Email:</b> {other?.email || "—"}</p>
          {other?.avatar_url ? (
            <img
              src={resolveMediaUrl(other.avatar_url)}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 9999, objectFit: "cover", marginTop: 8 }}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : null}
          {other?.contact ? (
            <p className="order-card-meta"><b>Contact:</b> {other.contact}</p>
          ) : null}
        </div>
      </div>

      <div className="order-card" style={{ cursor: "default" }}>
        <div className="order-card-body" style={{ width: "100%" }}>
          <h3 style={{ marginBottom: 10 }}>Transaction</h3>
          <p className="order-card-meta"><b>Final price:</b> £{data.final_price ?? product.price ?? "-"}</p>
          <p className="order-card-meta"><b>Reviewed by me:</b> {data.reviewed_by_me ? "Yes" : "No"}</p>
          <p className="order-card-meta"><b>Reviewed by other:</b> {data.reviewed_by_other ? "Yes" : "No"}</p>
          <p className="order-card-meta"><b>Both reviewed:</b> {data.both_reviewed ? "Yes" : "No"}</p>
        </div>
      </div>
    </div>
  );
}

