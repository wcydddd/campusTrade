import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./AdminReview.css";

const PAGE_SIZE = 10;

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

export default function AdminReview() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const abortRef = useRef(null);

  function fetchPending(page = 1) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
    authFetch(`${API_BASE}/admin/products/pending?${params}`, { signal: abortRef.current.signal })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error(d.detail || "Failed"); });
        return res.json();
      })
      .then((json) => setData({ items: json.items, total: json.total, page: json.page, size: json.size }))
      .catch((e) => { if (e.name !== "AbortError") setError(e.message || "Failed"); })
      .finally(() => { setLoading(false); abortRef.current = null; });
  }

  useEffect(() => {
    fetchPending(1);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  async function handleReview(productId, action) {
    let reason = "";
    if (action === "reject") {
      reason = window.prompt("Rejection reason:", "Does not meet listing requirements");
      if (reason === null) return;
    }

    setActionLoading(productId);
    try {
      const res = await authFetch(`${API_BASE}/admin/products/${productId}/review`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "Failed");
      fetchPending(data.page);
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="ar-page">
      {/* Header */}
      <div className="ar-header">
        <div className="ar-title-row">
          <h1 className="ar-title">Product Review</h1>
          {!loading && data.total > 0 && (
            <span className="ar-badge">
              <span className="ar-badge-dot" />
              {data.total} pending
            </span>
          )}
        </div>
        <nav className="ar-nav">
          <Link to="/home" className="ar-nav-link">Home</Link>
        </nav>
      </div>

      {/* Error */}
      {error && <div className="ar-error">{error}</div>}

      {/* Loading */}
      {loading && <p className="ar-loading">Loading...</p>}

      {/* Content */}
      {!loading && (
        <>
          {data.items.length === 0 ? (
            <p className="ar-clear">All clear — no products awaiting review.</p>
          ) : (
            <div className="ar-table-card">
              <table className="ar-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Seller</th>
                    <th>Price</th>
                    <th>Category</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => {
                    const thumb = Array.isArray(p.images) && p.images.length > 0
                      ? resolveMediaUrl(p.images[0])
                      : null;
                    return (
                      <tr key={p.id}>
                        <td>
                          <div className="ar-title-cell">
                            {thumb ? (
                              <img src={thumb} alt="" className="ar-thumb" />
                            ) : (
                              <div className="ar-thumb-placeholder">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="3" width="18" height="18" rx="2" />
                                  <circle cx="8.5" cy="8.5" r="1.5" />
                                  <path d="M21 15l-5-5L5 21" />
                                </svg>
                              </div>
                            )}
                            <Link to={`/products/${p.id}`} className="ar-title-link">{p.title}</Link>
                          </div>
                        </td>
                        <td>{p.seller_username || p.seller_id}</td>
                        <td><span className="ar-price">&pound;{p.price}</span></td>
                        <td>{p.category}</td>
                        <td><span className="ar-date">{p.created_at?.slice(0, 10) || "—"}</span></td>
                        <td>
                          <div className="ar-actions">
                            <button
                              type="button"
                              className="ar-btn-approve"
                              disabled={actionLoading === p.id}
                              onClick={() => handleReview(p.id, "approve")}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="ar-btn-reject"
                              disabled={actionLoading === p.id}
                              onClick={() => handleReview(p.id, "reject")}
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {data.total > PAGE_SIZE && (
            <div className="ar-pagination">
              <button type="button" disabled={data.page <= 1} onClick={() => fetchPending(data.page - 1)}>Previous</button>
              <span>{data.page} / {totalPages}</span>
              <button type="button" disabled={data.page >= totalPages} onClick={() => fetchPending(data.page + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
