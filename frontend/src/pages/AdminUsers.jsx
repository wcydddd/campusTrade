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

const CheckIcon = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 8 6 12 14 4" />
  </svg>
);

function roleTagClass(role) {
  if (role === "admin") return "au-tag au-tag--admin";
  if (role === "moderator") return "au-tag au-tag--moderator";
  return "au-tag au-tag--user";
}

export default function AdminUsers() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const abortRef = useRef(null);

  function fetchUsers(page = 1, q = search) {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ page: String(page), size: String(PAGE_SIZE) });
    if (q && q.trim()) params.set("q", q.trim());
    authFetch(`${API_BASE}/admin/users?${params}`, { signal: abortRef.current.signal })
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error(d.detail || d.message || "Failed"); });
        return res.json();
      })
      .then((json) => {
        setData({ items: json.items, total: json.total, page: json.page, size: json.size });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message || "Failed to load");
      })
      .finally(() => {
        setLoading(false);
        abortRef.current = null;
      });
  }

  useEffect(() => {
    fetchUsers(1, search);
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, [search]);

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  async function handleBan(userId) {
    setActionLoading(userId);
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${userId}/ban`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || json.message || "Failed");
      fetchUsers(data.page, search);
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUnban(userId) {
    setActionLoading(userId);
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${userId}/unban`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || json.message || "Failed");
      fetchUsers(data.page, search);
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRole(userId, role) {
    setActionLoading(userId);
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${userId}/role`, {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || json.message || "Failed");
      fetchUsers(data.page, search);
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleVerify(userId, isVerified) {
    setActionLoading(userId);
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${userId}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ is_verified: isVerified }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || json.message || "Failed");
      fetchUsers(data.page, search);
    } catch (e) {
      alert(e.message || "Failed");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="au-page">
      {/* Header */}
      <div className="au-header">
        <h1 className="au-title">User Management</h1>
        <div className="au-nav">
          <Link to="/home" className="au-nav-link">Home</Link>
        </div>
      </div>

      {/* Search */}
      <div className="au-search">
        <div className="au-search-wrap">
          <SearchIcon />
          <input
            className="au-search-input"
            type="text"
            placeholder="Search by email or username"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
          />
        </div>
        <button type="button" className="au-search-btn" onClick={() => setSearch(searchInput)}>Search</button>
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
                  <th>Email</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Verified</th>
                  <th>Banned</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((u) => (
                  <tr key={u.id} className={u.banned ? "au-row-banned" : ""}>
                    <td>{u.email}</td>
                    <td>{u.username}</td>
                    <td>
                      <span className={roleTagClass(u.role)}>{u.role}</span>
                    </td>
                    <td>
                      <span className="au-status">
                        {u.is_verified ? (
                          <>
                            <span className="au-status-dot au-status-dot--green" />
                            <span className="au-status-text--green"><CheckIcon /> Yes</span>
                          </>
                        ) : (
                          <>
                            <span className="au-status-dot au-status-dot--gray" />
                            <span className="au-status-text--gray">No</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="au-status">
                        {u.banned ? (
                          <>
                            <span className="au-status-dot au-status-dot--red" />
                            <span className="au-status-text--red">Yes</span>
                          </>
                        ) : (
                          <>
                            <span className="au-status-dot au-status-dot--gray" />
                            <span className="au-status-text--gray">No</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      <div className="au-actions">
                        {u.is_verified ? (
                          <button type="button" className="au-btn-unverify" disabled={actionLoading === u.id} onClick={() => handleVerify(u.id, false)}>Unverify</button>
                        ) : (
                          <button type="button" className="au-btn-verify" disabled={actionLoading === u.id} onClick={() => handleVerify(u.id, true)}>Verify</button>
                        )}
                        {u.banned ? (
                          <button type="button" className="au-btn-unban" disabled={actionLoading === u.id} onClick={() => handleUnban(u.id)}>Unban</button>
                        ) : (
                          <button type="button" className="au-btn-ban" disabled={actionLoading === u.id} onClick={() => handleBan(u.id)}>Ban</button>
                        )}
                        <select
                          className="au-role-select"
                          value={u.role}
                          disabled={actionLoading === u.id}
                          onChange={(e) => handleRole(u.id, e.target.value)}
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.items.length === 0 && <p className="au-empty">No users found.</p>}
          </div>

          <div className="au-pagination">
            <button type="button" disabled={data.page <= 1} onClick={() => fetchUsers(data.page - 1, search)}>Previous</button>
            <span>{data.page} / {totalPages}</span>
            <button type="button" disabled={data.page >= totalPages} onClick={() => fetchUsers(data.page + 1, search)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
