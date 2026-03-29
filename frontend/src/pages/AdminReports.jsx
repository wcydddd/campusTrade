import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./AdminUsers.css";

const PAGE_SIZE = 10;

const REASON_LABELS = {
  spam: "Spam",
  fraud: "Fraud / Scam",
  inappropriate: "Inappropriate",
  prohibited_item: "Prohibited item",
  wrong_category: "Wrong category",
  other: "Other",
};

export default function AdminReports() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [actionLoading, setActionLoading] = useState(null);
  const abortRef = useRef(null);

  function fetchReports(page = 1, st = statusFilter) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
    if (st) params.set("status", st);
    authFetch(`${API_BASE}/admin/reports?${params}`, { signal: abortRef.current.signal })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error(d.detail || "Failed"); });
        return res.json();
      })
      .then((json) => setData({ items: json.items, total: json.total, page: json.page, size: json.size }))
      .catch((e) => { if (e.name !== "AbortError") setError(e.message || "Failed"); })
      .finally(() => { setLoading(false); abortRef.current = null; });
  }

  useEffect(() => {
    fetchReports(1, statusFilter);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [statusFilter]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  async function handleAction(reportId, action) {
    const label = action === "takedown" ? "Takedown product" : "Ignore report";
    const note = window.prompt(`Admin note for "${label}" (optional):`, "");
    if (note === null) return;
    if (action === "takedown" && !window.confirm("This will take down the product. Continue?")) return;
    setActionLoading(reportId);
    try {
      const res = await authFetch(`${API_BASE}/admin/reports/${reportId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ status: action, admin_note: note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "Failed");
      fetchReports(data.page, statusFilter);
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  const statusColor = (s) => {
    if (s === "pending") return { background: "#fef9c3", color: "#854d0e" };
    if (s === "resolved") return { background: "#f0fdf4", color: "#15803d" };
    if (s === "dismissed") return { background: "#f1f5f9", color: "#64748b" };
    return {};
  };

  return (
    <div className="admin-users">
      <div className="admin-users-header">
        <h1>Report Management</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <Link to="/admin/users" className="admin-users-back">Users</Link>
          <Link to="/admin/products" className="admin-users-back">Products</Link>
          <Link to="/home" className="admin-users-back">Home</Link>
        </div>
      </div>

      <div className="admin-users-toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {error && <p className="admin-users-error">{error}</p>}
      {loading && <p className="admin-users-msg">Loading...</p>}

      {!loading && (
        <>
          <p className="admin-users-meta">{data.total} total, page {data.page} / {totalPages}</p>
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Reporter</th>
                  <th>Reason</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Admin Note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/products/${r.product_id}`} style={{ color: "#4f46e5" }}>
                        {r.product_title || r.product_id}
                      </Link>
                    </td>
                    <td>{r.reporter_username || r.reporter_id}</td>
                    <td>{REASON_LABELS[r.reason] || r.reason}</td>
                    <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.description || "-"}
                    </td>
                    <td>
                      <span style={{
                        display: "inline-block", padding: "2px 10px", borderRadius: 999,
                        fontSize: 12, fontWeight: 600, ...statusColor(r.status),
                      }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.admin_note || "-"}
                    </td>
                    <td className="admin-users-actions">
                      {r.status === "pending" && (
                        <>
                          <button type="button" className="btn-ban" disabled={actionLoading === r.id}
                            onClick={() => handleAction(r.id, "takedown")}>Takedown</button>
                          <button type="button" className="btn-unverify" disabled={actionLoading === r.id}
                            onClick={() => handleAction(r.id, "dismissed")}>Ignore</button>
                        </>
                      )}
                      {r.status !== "pending" && <span style={{ color: "#94a3b8", fontSize: 12 }}>Done</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p className="admin-users-msg">No reports found.</p>}

          <div className="admin-users-pagination">
            <button type="button" disabled={data.page <= 1} onClick={() => fetchReports(data.page - 1, statusFilter)}>Previous</button>
            <span>{data.page} / {totalPages}</span>
            <button type="button" disabled={data.page >= totalPages} onClick={() => fetchReports(data.page + 1, statusFilter)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
