import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE, authFetch, getStoredToken, logout } from "../api";
import UserCenterSidebar from "../components/UserCenterSidebar";
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

  if (!user && !loading && !error) return null;

  const avatarUrl = user?.avatar_url
    ? (user.avatar_url.startsWith("http") ? user.avatar_url : `${API_BASE}${user.avatar_url}`)
    : null;

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto flex gap-6 pt-6 px-4 pb-10">
        <UserCenterSidebar />

        <section className="flex-1 min-w-0 bg-white rounded-2xl shadow-sm overflow-hidden">
          {/* ── Hero profile card ── */}
          <div className="relative bg-gradient-to-br from-amber-50 via-yellow-50 to-white px-6 pt-1 pb-6">
            <div className="h-1 w-full bg-gradient-to-r from-amber-200 to-yellow-100 rounded-b-full absolute top-0 left-0 right-0" />

            <div className="flex items-center justify-between mt-5 mb-5">
              <h1 className="text-lg font-extrabold text-gray-900 tracking-tight m-0">Profile</h1>
              <Link
                to="/home"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors no-underline"
              >
                &larr; Back to Home
              </Link>
            </div>

            {loading && <p className="text-gray-400">Loading...</p>}
            {error && <p className="me-profile-error">{error}</p>}

            {!loading && !error && user && (
              <div className="flex items-center gap-6">
                {/* Avatar – large */}
                <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 shrink-0 ring-4 ring-white shadow">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM12 14a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-3xl font-bold text-gray-900 m-0 truncate">{user.username || "User"}</p>
                  <p className="text-sm text-gray-400 mt-1 mb-0">{user.email}</p>
                  {user.bio && (
                    <p className="text-sm text-gray-500 mt-1 mb-0 line-clamp-2">{user.bio}</p>
                  )}
                </div>


              </div>
            )}
          </div>

          {/* ── Info grid ── */}
          {!loading && !error && user && (
            <div className="grid grid-cols-3 gap-4 px-6 py-5 border-b border-gray-100">
              <div className="bg-gray-50 rounded-xl px-4 py-4 text-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider m-0 mb-1">Email</p>
                <p className="text-sm font-bold text-gray-900 m-0 truncate" title={user.email}>{user.email}</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-4 text-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider m-0 mb-1">Role</p>
                <p className="text-sm font-bold text-gray-900 m-0 capitalize">{user.role}</p>
              </div>
              <div className="bg-gray-50 rounded-xl px-4 py-4 text-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider m-0 mb-1">Verified</p>
                <p className="m-0">
                  <span className={`text-sm font-bold ${user.is_verified ? "text-emerald-600" : "text-amber-500"}`}>
                    {user.is_verified ? "Yes" : "No"}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* ── Edit forms ── */}
          {!loading && !error && user && (
            <div className="p-6" id="profile-edit-section">
              <div className="me-profile-card">
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
                        {avatarSaving ? "Uploading…" : "Upload avatar"}
                      </button>
                    </form>
                  </div>
                </section>

                <section className="me-profile-section">
                  <h3>Username / Bio</h3>
                  <form onSubmit={handleProfileSubmit}>
                    <label className="text-sm font-medium text-gray-600 mb-1 block">Username</label>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="me-profile-input"
                      minLength={2}
                      maxLength={30}
                    />
                    <label className="text-sm font-medium text-gray-600 mb-1 block">Bio</label>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="me-profile-input me-profile-bio"
                      maxLength={500}
                      placeholder="Write a short bio…"
                    />
                    <button type="submit" disabled={profileSaving}>{profileSaving ? "Saving…" : "Save changes"}</button>
                  </form>
                </section>

                {profileMsg.text && (
                  <p className={profileMsg.type === "error" ? "me-profile-error" : "me-profile-success"}>{profileMsg.text}</p>
                )}

                <div className="me-profile-links">
                  <Link to="/me/change-password" className="me-profile-link">Change password</Link>
                  <button type="button" className="me-profile-logout" onClick={handleLogout}>Sign out</button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
