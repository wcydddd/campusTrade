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

function reportStatusTagClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "pending") return "au-tag au-tag--pending";
  if (s === "resolved") return "au-tag au-tag--available";
  if (s === "dismissed") return "au-tag au-tag--sold";
  return "au-tag au-tag--user";
}

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

  return (
    <div className="au-page">
      <div className="au-header">
        <h1 className="au-title">Report Management</h1>
        <div className="au-nav">
          <Link to="/home" className="au-nav-link">Home</Link>
        </div>
      </div>

      <div className="au-search-row">
        <label className="au-filter-label" htmlFor="admin-reports-status">Status</label>
        <select
          id="admin-reports-status"
          className="au-role-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>
      </div>

      {error && <p className="au-error">{error}</p>}
      {loading && <p className="au-loading">Loading...</p>}

      {!loading && (
        <>
          <div className="au-table-card">
            <p className="au-table-meta">{data.total} total, page {data.page} / {totalPages}</p>
            <table className="au-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Reporter</th>
                  <th>Reason</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th>Admin note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/products/${r.product_id}`} className="au-cell-link">
                        {r.product_title || r.product_id}
                      </Link>
                    </td>
                    <td>{r.reporter_username || r.reporter_id}</td>
                    <td>{REASON_LABELS[r.reason] || r.reason}</td>
                    <td className="au-table-cell-ellipsis" title={r.description || ""}>
                      {r.description || "—"}
                    </td>
                    <td>
                      <span className={reportStatusTagClass(r.status)}>{r.status}</span>
                    </td>
                    <td className="au-table-cell-ellipsis au-table-cell-ellipsis--narrow" title={r.admin_note || ""}>
                      {r.admin_note || "—"}
                    </td>
                    <td>
                      <div className="au-actions">
                        {r.status === "pending" && (
                          <>
                            <button
                              type="button"
                              className="au-btn-ban"
                              disabled={actionLoading === r.id}
                              onClick={() => handleAction(r.id, "takedown")}
                            >
                              Takedown
                            </button>
                            <button
                              type="button"
                              className="au-btn-unverify"
                              disabled={actionLoading === r.id}
                              onClick={() => handleAction(r.id, "dismissed")}
                            >
                              Ignore
                            </button>
                          </>
                        )}
                        {r.status !== "pending" && (
                          <span className="au-status-text--gray" style={{ fontSize: 12, fontWeight: 600 }}>Done</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && <p className="au-empty">No reports found.</p>}
          </div>

          <div className="au-pagination">
            <button type="button" disabled={data.page <= 1} onClick={() => fetchReports(data.page - 1, statusFilter)}>Previous</button>
            <span>{data.page} / {totalPages}</span>
            <button type="button" disabled={data.page >= totalPages} onClick={() => fetchReports(data.page + 1, statusFilter)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
