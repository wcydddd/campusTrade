import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./AdminUsers.css";

const PAGE_SIZE = 10;

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
    <div className="admin-users">
      <div className="admin-users-header">
        <h1>Product Review</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <Link to="/admin/products" className="admin-users-back">Products</Link>
          <Link to="/admin/users" className="admin-users-back">Users</Link>
          <Link to="/home" className="admin-users-back">Home</Link>
        </div>
      </div>

      {error && <p className="admin-users-error">{error}</p>}
      {loading && <p className="admin-users-msg">Loading...</p>}

      {!loading && (
        <>
          <p className="admin-users-meta">{data.total} pending product{data.total !== 1 ? "s" : ""}</p>

          {data.items.length === 0 ? (
            <p className="admin-users-msg" style={{ color: "#16a34a", fontWeight: 600 }}>
              All clear — no products awaiting review.
            </p>
          ) : (
            <div className="admin-users-table-wrap">
              <table className="admin-users-table">
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
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/products/${p.id}`} style={{ color: "#4f46e5" }}>{p.title}</Link>
                      </td>
                      <td>{p.seller_username || p.seller_id}</td>
                      <td>&pound;{p.price}</td>
                      <td>{p.category}</td>
                      <td style={{ fontSize: 12, color: "#64748b" }}>{p.created_at?.slice(0, 19) || "—"}</td>
                      <td className="admin-users-actions">
                        <button
                          type="button"
                          className="btn-unban"
                          disabled={actionLoading === p.id}
                          onClick={() => handleReview(p.id, "approve")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn-ban"
                          disabled={actionLoading === p.id}
                          onClick={() => handleReview(p.id, "reject")}
                        >
                          Reject
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.total > PAGE_SIZE && (
            <div className="admin-users-pagination">
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
