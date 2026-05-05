import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import "./OrderDetail.css";

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

function statusClass(s) {
  const map = { pending: "od-status--pending", confirmed: "od-status--confirmed", completed: "od-status--completed", cancelled: "od-status--cancelled" };
  return map[s] || "od-status--pending";
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
    return () => { cancelled = true; };
  }, [orderId]);

  const isBuyer = useMemo(() => {
    if (!user?.id || !data?.buyer?.id) return false;
    return String(user.id) === String(data.buyer.id);
  }, [user?.id, data?.buyer?.id]);

  const other = isBuyer ? data?.seller : data?.buyer;
  const peerProfileId = other?.id != null ? String(other.id) : "";
  const product = data?.product || {};
  const images = Array.isArray(product.images) ? product.images : [];
  const hero = resolveMediaUrl(images[0]) || "https://placehold.co/600x400";

  if (loading) {
    return (
      <div className="od-page">
        <div className="od-header">
          <button type="button" className="od-back" onClick={() => navigate("/my-orders")}>
            <span className="od-back-arrow">‹</span> Back
          </button>
          <h1 className="od-title">Order Detail</h1>
        </div>
        <p className="od-loading">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="od-page">
        <div className="od-header">
          <button type="button" className="od-back" onClick={() => navigate("/my-orders")}>
            <span className="od-back-arrow">‹</span> Back
          </button>
          <h1 className="od-title">Order Detail</h1>
        </div>
        <p className="od-error">{error || "Order not found"}</p>
      </div>
    );
  }

  return (
    <div className="od-page">
      {/* Header */}
      <div className="od-header">
        <button type="button" className="od-back" onClick={() => navigate("/my-orders")}>
          <span className="od-back-arrow">‹</span> Back
        </button>
        <h1 className="od-title">Order Detail</h1>
      </div>

      {/* Card 1: Product Snapshot */}
      <div className="od-card">
        <div className="od-hero">
          <img
            src={hero}
            alt=""
            className="od-hero-img"
            onError={(e) => { e.currentTarget.src = "https://placehold.co/600x400"; }}
          />
          <div className="od-hero-info">
            <h3 className="od-hero-name">{product.title || "Product"}</h3>
            <p className="od-hero-price">
              <span className="od-hero-price-sym">£</span>
              {data.final_price ?? product.price ?? "-"}
            </p>
          </div>
        </div>
      </div>

      {/* Card 2: Order Status & Details */}
      <div className="od-card">
        <h4 className="od-card-title">Order Info</h4>
        <div className="od-rows">
          <div className="od-row">
            <span className="od-row-label">Status</span>
            <span className={`od-status-badge ${statusClass(data.status)}`}>
              {data.status ? String(data.status) : "—"}
            </span>
          </div>
          <div className="od-row">
            <span className="od-row-label">Order ID</span>
            <span className="od-row-value">{data.id}</span>
          </div>
          <div className="od-row">
            <span className="od-row-label">Created at</span>
            <span className="od-row-value">{data.created_at ? new Date(data.created_at).toLocaleString() : "—"}</span>
          </div>
          <div className="od-row">
            <span className="od-row-label">Updated at</span>
            <span className="od-row-value">{data.updated_at ? new Date(data.updated_at).toLocaleString() : "—"}</span>
          </div>
        </div>
      </div>

      {/* Card 3: Product & Seller/Buyer Details */}
      <div className="od-card">
        <h4 className="od-card-title">
          {isBuyer ? "Product & Seller" : "Product & Buyer"}
        </h4>
        <div className="od-rows">
          {/* Description — stacked layout */}
          {product.description && (
            <div className="od-desc-row">
              <div className="od-desc-label">Description</div>
              <p className="od-desc-text">{product.description}</p>
            </div>
          )}

          <div className="od-row">
            <span className="od-row-label">Category</span>
            <span className="od-row-value">{product.category || "—"}</span>
          </div>
          <div className="od-row">
            <span className="od-row-label">Condition</span>
            <span className="od-row-value">{product.condition || "—"}</span>
          </div>
          <div className="od-row">
            <span className="od-row-label">Username</span>
            <span className="od-row-value">
              {peerProfileId && other?.username ? (
                <Link className="od-peer-profile-link" to={`/seller/${peerProfileId}`}>
                  {other.username}
                </Link>
              ) : (
                other?.username || "—"
              )}
            </span>
          </div>
          {peerProfileId && (
            <div className="od-row">
              <span className="od-row-label">Store</span>
              <span className="od-row-value">
                <Link className="od-peer-profile-link" to={`/seller/${peerProfileId}`}>
                  {isBuyer ? "View seller's listings →" : "View buyer's listings →"}
                </Link>
              </span>
            </div>
          )}
          <div className="od-row">
            <span className="od-row-label">Email</span>
            <span className="od-row-value">{other?.email || "—"}</span>
          </div>

          {other?.avatar_url && (
            <div className="od-avatar-row">
              {peerProfileId ? (
                <Link className="od-peer-profile-block" to={`/seller/${peerProfileId}`}>
                  <img
                    src={resolveMediaUrl(other.avatar_url)}
                    alt=""
                    className="od-avatar-img"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <span className="od-row-value">{other?.username || ""}</span>
                </Link>
              ) : (
                <>
                  <img
                    src={resolveMediaUrl(other.avatar_url)}
                    alt=""
                    className="od-avatar-img"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                  <span className="od-row-value">{other?.username || ""}</span>
                </>
              )}
            </div>
          )}

          {other?.contact && (
            <div className="od-row">
              <span className="od-row-label">Contact</span>
              <span className="od-row-value">{other.contact}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card 4: Transaction Summary */}
      <div className="od-card">
        <h4 className="od-card-title">Transaction</h4>
        <div className="od-rows">
          <div className="od-row">
            <span className="od-row-label">Final price</span>
            <span className="od-row-value od-row-value--bold">
              £{data.final_price ?? product.price ?? "-"}
            </span>
          </div>
          <div className="od-row">
            <span className="od-row-label">Reviewed by me</span>
            <span className={`od-row-value ${data.reviewed_by_me ? "od-review-yes" : "od-review-no"}`}>
              {data.reviewed_by_me ? "Yes" : "No"}
            </span>
          </div>
          <div className="od-row">
            <span className="od-row-label">Reviewed by other</span>
            <span className={`od-row-value ${data.reviewed_by_other ? "od-review-yes" : "od-review-no"}`}>
              {data.reviewed_by_other ? "Yes" : "No"}
            </span>
          </div>
          <div className="od-row">
            <span className="od-row-label">Both reviewed</span>
            <span className={`od-row-value ${data.both_reviewed ? "od-review-yes" : "od-review-no"}`}>
              {data.both_reviewed ? "Yes" : "No"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
