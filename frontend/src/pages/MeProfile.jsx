import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API_BASE, authFetch } from "../api";
import "./MeProfile.css";

export default function MeProfile() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await authFetch(`${API_BASE}/auth/me`);
        if (!cancelled && res.ok) {
          const data = await res.json();
          setUser(data);
        } else if (!cancelled && !res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.detail || data.message || "Failed to load");
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="me-profile"><p>Loading...</p></div>;
  if (error) return <div className="me-profile"><p className="me-profile-error">{error}</p><Link to="/home">Back to Home</Link></div>;
  if (!user) return null;

  return (
    <div className="me-profile">
      <div className="me-profile-card">
        <h1>My profile</h1>
        <p className="me-profile-hint">Data from GET /auth/me</p>
        <dl className="me-profile-dl">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Username</dt>
          <dd>{user.username}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
          <dt>Verified</dt>
          <dd>{user.is_verified ? "Yes" : "No"}</dd>
        </dl>
        <Link to="/home" className="me-profile-back">Back to Home</Link>
      </div>
    </div>
  );
}
