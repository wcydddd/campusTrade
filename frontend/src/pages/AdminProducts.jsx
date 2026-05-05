import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./AdminUsers.css";

const PAGE_SIZE = 10;

const SearchIcon = () => (
  <svg className="au-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
}

function productStatusTagClass(status) {
  const s = (status || "").toLowerCase();
  if (s === "available") return "au-tag au-tag--available";
  if (s === "sold") return "au-tag au-tag--sold";
  if (s === "pending") return "au-tag au-tag--pending";
  if (s === "removed" || s === "rejected") return "au-tag au-tag--removed";
  if (s === "reserved") return "au-tag au-tag--reserved";
  return "au-tag au-tag--user";
}

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

  return (
    <div className="au-page">
      <div className="au-header">
        <h1 className="au-title">Product Management</h1>
        <div className="au-nav">
          <Link to="/home" className="au-nav-link">Home</Link>
        </div>
      </div>

      <div className="au-search-row">
        <div className="au-search">
          <div className="au-search-wrap">
            <SearchIcon />
            <input
              className="au-search-input"
              type="text"
              placeholder="Search by title"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
            />
          </div>
          <button type="button" className="au-search-btn" onClick={() => setSearch(searchInput)}>Search</button>
        </div>
        <select
          className="au-role-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending review</option>
          <option value="available">Available</option>
          <option value="sold">Sold</option>
          <option value="reserved">Reserved</option>
          <option value="rejected">Rejected</option>
          <option value="removed">Removed</option>
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
                  <th>Image</th>
                  <th>Product</th>
                  <th>Seller</th>
                  <th>Price</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Reports</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => {
                  const thumbSrc = resolveMediaUrl(p.thumb_url);
                  return (
                    <tr key={p.id}>
                      <td>
                        {thumbSrc ? (
                          <img
                            className="au-product-thumb"
                            src={thumbSrc}
                            alt=""
                            onError={(e) => {
                              e.currentTarget.replaceWith(
                                Object.assign(document.createElement("span"), {
                                  className: "au-product-thumb--placeholder",
                                  textContent: "—",
                                }),
                              );
                            }}
                          />
                        ) : (
                          <span className="au-product-thumb--placeholder">—</span>
                        )}
                      </td>
                      <td>
                        <Link to={`/products/${p.id}`} className="au-cell-link">{p.title}</Link>
                      </td>
                      <td>{p.seller_username || p.seller_id}</td>
                      <td>£{p.price}</td>
                      <td>{p.category || "—"}</td>
                      <td>
                        <span className={productStatusTagClass(p.status)}>{p.status}</span>
                      </td>
                      <td>
                        <span className="au-status">
                          {p.report_count > 0 ? (
                            <>
                              <span className="au-status-dot au-status-dot--red" />
                              <span className="au-status-text--red">{p.report_count}</span>
                            </>
                          ) : (
                            <>
                              <span className="au-status-dot au-status-dot--gray" />
                              <span className="au-status-text--gray">0</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="au-actions">
                          {p.status !== "removed" ? (
                            <button
                              type="button"
                              className="au-btn-ban"
                              disabled={actionLoading === p.id}
                              onClick={() => handleTakedown(p.id)}
                            >
                              Takedown
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="au-btn-verify"
                              disabled={actionLoading === p.id}
                              onClick={() => handleRestore(p.id)}
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.items.length === 0 && <p className="au-empty">No products found.</p>}
          </div>

          <div className="au-pagination">
            <button type="button" disabled={data.page <= 1} onClick={() => fetchProducts(data.page - 1, search, statusFilter)}>Previous</button>
            <span>{data.page} / {totalPages}</span>
            <button type="button" disabled={data.page >= totalPages} onClick={() => fetchProducts(data.page + 1, search, statusFilter)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
