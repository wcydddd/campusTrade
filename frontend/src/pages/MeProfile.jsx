import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch, getStoredToken, logout } from "../api";
import "./MeProfile.css";

export default function MeProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState({ type: "", text: "" });
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    authFetch(`${API_BASE}/auth/me`)
      .then((res) => {
        if (!cancelled && !res.ok) return res.json().then((d) => { throw new Error(d.detail || d.message || "Failed to load"); });
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data);
          setUsername(data.username || "");
          setBio(data.bio || "");
        }
      })
      .catch((e) => { if (!cancelled) setError(e.message || "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleAvatarSubmit(e) {
    e.preventDefault();
    if (!avatarFile) return;
    setAvatarSaving(true);
    setProfileMsg({ type: "", text: "" });
    try {
      const formData = new FormData();
      formData.append("file", avatarFile);
      const token = getStoredToken();
      const res = await fetch(`${API_BASE}/auth/me/avatar`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.message || "Upload failed");
      setUser((prev) => (prev ? { ...prev, avatar_url: data.avatar_url } : null));
      setAvatarFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setProfileMsg({ type: "success", text: "Avatar updated." });
    } catch (err) {
      setProfileMsg({ type: "error", text: err.message || "Upload failed" });
    } finally {
      setAvatarSaving(false);
    }
  }

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileMsg({ type: "", text: "" });
    try {
      const res = await authFetch(`${API_BASE}/auth/me`, {
        method: "PATCH",
        body: JSON.stringify({ username: username.trim(), bio: bio.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.message || "Save failed");
      setUser((prev) => (prev ? { ...prev, username: data.username, bio: data.bio } : null));
      setProfileMsg({ type: "success", text: "Saved." });
    } catch (err) {
      setProfileMsg({ type: "error", text: err.message || "Save failed" });
    } finally {
      setProfileSaving(false);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  if (loading) return <div className="me-profile"><p>Loading...</p></div>;
  if (error) return <div className="me-profile"><p className="me-profile-error">{error}</p><Link to="/home">Back to Home</Link></div>;
  if (!user) return null;

  const avatarUrl = user.avatar_url
    ? (user.avatar_url.startsWith("http") ? user.avatar_url : `${API_BASE}${user.avatar_url}`)
    : null;

  return (
    <div className="me-profile">
      <div className="me-profile-card">
        <h1>Profile</h1>

        <section className="me-profile-section">
          <h3>Avatar</h3>
          <div className="me-profile-avatar-row">
            <div className="me-profile-avatar-preview">
              {avatarUrl ? <img src={avatarUrl} alt="avatar" /> : <span>No avatar</span>}
            </div>
            <form onSubmit={handleAvatarSubmit} className="me-profile-avatar-form">
              <div className="me-profile-file-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
                  className="me-profile-file-input"
                />
                <button
                  type="button"
                  className="me-profile-file-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </button>
                <span className="me-profile-file-name">
                  {avatarFile ? avatarFile.name : "No file chosen"}
                </span>
              </div>
              <button type="submit" disabled={!avatarFile || avatarSaving}>
                {avatarSaving ? "Uploading..." : "Upload avatar"}
              </button>
            </form>
          </div>
        </section>

        <section className="me-profile-section">
          <h3>Username / Bio</h3>
          <form onSubmit={handleProfileSubmit}>
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="me-profile-input"
              minLength={2}
              maxLength={30}
            />
            <label>Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="me-profile-input me-profile-bio"
              maxLength={500}
              placeholder="Optional"
            />
            <button type="submit" disabled={profileSaving}>{profileSaving ? "Saving..." : "Save"}</button>
          </form>
        </section>

        {profileMsg.text && (
          <p className={profileMsg.type === "error" ? "me-profile-error" : "me-profile-success"}>{profileMsg.text}</p>
        )}

        <dl className="me-profile-dl">
          <dt>Email</dt>
          <dd>{user.email}</dd>
          <dt>Role</dt>
          <dd>{user.role}</dd>
          <dt>Verified</dt>
          <dd>{user.is_verified ? "Yes" : "No"}</dd>
        </dl>

        <div className="me-profile-links">
          <Link to="/me/change-password" className="me-profile-link">Change password</Link>
          <button type="button" className="me-profile-logout" onClick={handleLogout}>Sign out</button>
        </div>

        <Link to="/home" className="me-profile-back">Back to Home</Link>
      </div>
    </div>
  );
}
