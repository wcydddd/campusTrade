import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch, logout } from "../api";
import "./MeProfile.css";

export default function ChangePassword() {
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/auth/change-password`, {
        method: "POST",
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.message || "Update failed.");
      setSuccess("Password updated. Please sign in with your new password.");
      setTimeout(() => {
        logout();
        navigate("/login", { replace: true });
      }, 1500);
    } catch (err) {
      setError(err.message || "Update failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="me-profile">
      <div className="me-profile-card">
        <h1>Change password</h1>
        <p className="me-profile-hint">You will be signed out after changing. Please sign in again with your new password.</p>
        <form onSubmit={handleSubmit}>
          <label>Current password</label>
          <input
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            className="me-profile-input"
          />
          <label>New password (at least 8 characters)</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="me-profile-input"
          />
          <label>Confirm new password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="me-profile-input"
          />
          {error && <p className="me-profile-error">{error}</p>}
          {success && <p className="me-profile-success">{success}</p>}
          <div className="me-profile-actions">
            <button type="submit" disabled={loading}>{loading ? "Saving..." : "Save"}</button>
            <Link to="/me">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
