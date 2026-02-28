import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./AdminUsers.css";

const PAGE_SIZE = 10;

export default function AdminUsers() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [actionLoading, setActionLoading] = useState(null); // id of row being acted on
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
        method: "PATCH",
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
    <div className="admin-users">
      <div className="admin-users-header">
        <h1>User management</h1>
        <Link to="/home" className="admin-users-back">Back to Home</Link>
      </div>

      <div className="admin-users-toolbar">
        <input
          type="text"
          placeholder="Search by email or username"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
        />
        <button type="button" onClick={() => setSearch(searchInput)}>Search</button>
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
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.username}</td>
                    <td>{u.role}</td>
                    <td>{u.is_verified ? "Yes" : "No"}</td>
                    <td>{u.banned ? "Yes" : "No"}</td>
                    <td className="admin-users-actions">
                      {u.is_verified ? (
                        <button type="button" className="btn-unverify" disabled={actionLoading === u.id} onClick={() => handleVerify(u.id, false)}>Unverify</button>
                      ) : (
                        <button type="button" className="btn-verify" disabled={actionLoading === u.id} onClick={() => handleVerify(u.id, true)}>Verify</button>
                      )}
                      {u.banned ? (
                        <button type="button" className="btn-unban" disabled={actionLoading === u.id} onClick={() => handleUnban(u.id)}>Unban</button>
                      ) : (
                        <button type="button" className="btn-ban" disabled={actionLoading === u.id} onClick={() => handleBan(u.id)}>Ban</button>
                      )}
                      <select
                        value={u.role}
                        disabled={actionLoading === u.id}
                        onChange={(e) => handleRole(u.id, e.target.value)}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.items.length === 0 && <p className="admin-users-msg">No users found.</p>}

          <div className="admin-users-pagination">
            <button type="button" disabled={data.page <= 1} onClick={() => fetchUsers(data.page - 1, search)}>Previous</button>
            <span> {data.page} / {totalPages} </span>
            <button type="button" disabled={data.page >= totalPages} onClick={() => fetchUsers(data.page + 1, search)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
