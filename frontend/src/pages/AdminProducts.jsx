import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./AdminUsers.css";

const PAGE_SIZE = 10;

export default function AdminProducts() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const abortRef = useRef(null);

  function fetchProducts(page = 1, q = search, st = statusFilter) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
    if (q && q.trim()) params.set("q", q.trim());
    if (st) params.set("status", st);
    authFetch(`${API_BASE}/admin/products?${params}`, { signal: abortRef.current.signal })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error(d.detail || "Failed"); });
        return res.json();
      })
      .then((json) => setData({ items: json.items, total: json.total, page: json.page, size: json.size }))
      .catch((e) => { if (e.name !== "AbortError") setError(e.message || "Failed"); })
      .finally(() => { setLoading(false); abortRef.current = null; });
  }

  useEffect(() => {
    fetchProducts(1, search, statusFilter);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  async function handleTakedown(productId) {
    const reason = window.prompt("Takedown reason (optional):", "");
    if (reason === null) return;
    setActionLoading(productId);
    try {
      const res = await authFetch(`${API_BASE}/admin/products/${productId}/takedown`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "Failed");
      fetchProducts(data.page, search, statusFilter);
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRestore(productId) {
    setActionLoading(productId);
    try {
      const res = await authFetch(`${API_BASE}/admin/products/${productId}/restore`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || "Failed");
      fetchProducts(data.page, search, statusFilter);
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  const statusColor = (s) => {
    if (s === "removed") return { background: "#fef2f2", color: "#b91c1c" };
    if (s === "rejected") return { background: "#fef2f2", color: "#b91c1c" };
    if (s === "available") return { background: "#f0fdf4", color: "#15803d" };
    if (s === "pending") return { background: "#fffbeb", color: "#b45309" };
    if (s === "sold") return { background: "#f1f5f9", color: "#64748b" };
    return {};
  };

  return (
    <div className="admin-users">
      <div className="admin-users-header">
        <h1>Product Management</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <Link to="/admin/review" className="admin-users-back">Review</Link>
          <Link to="/admin/users" className="admin-users-back">Users</Link>
          <Link to="/admin/reports" className="admin-users-back">Reports</Link>
          <Link to="/home" className="admin-users-back">Home</Link>
        </div>
      </div>

      <div className="admin-users-toolbar">
        <input
          type="text"
          placeholder="Search by title"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
        />
        <button type="button" onClick={() => setSearch(searchInput)}>Search</button>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd", fontSize: 14 }}>
          <option value="">All statuses</option>
          <option value="pending">Pending review</option>
          <option value="available">Available</option>
          <option value="sold">Sold</option>
          <option value="reserved">Reserved</option>
          <option value="rejected">Rejected</option>
          <option value="removed">Removed</option>
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
                  <th>Title</th>
                  <th>Seller</th>
                  <th>Price</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Reports</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td><Link to={`/products/${p.id}`} style={{ color: "#4f46e5" }}>{p.title}</Link></td>
                    <td>{p.seller_username || p.seller_id}</td>
                    <td>£{p.price}</td>
                    <td>{p.category}</td>
                    <td>
                      <span style={{
                        display: "inline-block", padding: "2px 10px", borderRadius: 999,
                        fontSize: 12, fontWeight: 600, ...statusColor(p.status),
                      }}>
                        {p.status}
                      </span>
                    </td>
                    <td>{p.report_count > 0 ? <span style={{ color: "#ef4444", fontWeight: 600 }}>{p.report_count}</span> : 0}</td>
                    <td className="admin-users-actions">
                      {p.status !== "removed" ? (
                        <button type="button" className="btn-ban" disabled={actionLoading === p.id}
                          onClick={() => handleTakedown(p.id)}>Takedown</button>
                      ) : (
                        <button type="button" className="btn-unban" disabled={actionLoading === p.id}
                          onClick={() => handleRestore(p.id)}>Restore</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p className="admin-users-msg">No products found.</p>}

          <div className="admin-users-pagination">
            <button type="button" disabled={data.page <= 1} onClick={() => fetchProducts(data.page - 1, search, statusFilter)}>Previous</button>
            <span>{data.page} / {totalPages}</span>
            <button type="button" disabled={data.page >= totalPages} onClick={() => fetchProducts(data.page + 1, search, statusFilter)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
