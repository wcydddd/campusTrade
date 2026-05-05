import { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";
import "./Login.css";

function isUniversityEmail(email) {
  return /@.+\.(edu|ac\.uk|edu\.cn)$/i.test(email);
}

function MailIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="login-input-icon">
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="login-input-icon">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="login-input-icon">
      <path
        fillRule="evenodd"
        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
        <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
    </svg>
  );
}

export default function Register() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agree, setAgree] = useState(false);
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setOk("");

    if (!email.trim()) return setError("Email is required.");
    if (!isUniversityEmail(email)) return setError("Please use a university email.");
    if (!username.trim() || username.trim().length < 2) return setError("Username must be at least 2 characters.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    if (!agree) return setError("Please agree to the terms.");

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          username: username.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const minutes = data.retry_after ? Math.ceil(Number(data.retry_after) / 60) : 5;
        throw new Error(`Too many attempts. Please try again in ${minutes} minute(s).`);
      }
      if (!res.ok) {
        throw new Error(data.message || data.detail || "Register failed.");
      }

      setOk("Registered! Please verify your email with the code we will send you.");
    } catch (err) {
      setError(err.message || "Register failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-wrapper">
        <div className="login-header">
          <img src={campusTradeLogo} alt="CampusTrade logo" className="login-logo-img" />
          <span className="login-brand-tag">UOL Campus</span>
          <h1 className="login-title">CampusTrade</h1>
          <p className="login-subtitle">Open a stall, find new homes for your stuff.</p>
        </div>

        <div className="login-card">
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="login-field">
              <label className="login-label">University Email</label>
              <div className="login-input-wrap">
                <MailIcon />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="login-input"
                  placeholder="Enter your university email"
                />
              </div>
            </div>

            {/* Username */}
            <div className="login-field">
              <label className="login-label">Username</label>
              <div className="login-input-wrap">
                <UserIcon />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="login-input"
                  placeholder="Pick a username"
                />
              </div>
            </div>

            {/* Password */}
            <div className="login-field">
              <label className="login-label">Password</label>
              <div className="login-input-wrap">
                <LockIcon />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-input"
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="login-field">
              <label className="login-label">Confirm Password</label>
              <div className="login-input-wrap">
                <LockIcon />
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="login-input"
                  placeholder="Re-enter your password"
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                  aria-label={showConfirm ? "Hide password" : "Show password"}
                >
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
            </div>

            {/* Agree to terms */}
            <label className="login-remember">
              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="login-checkbox"
              />
              <span>Agree to terms</span>
            </label>

            {/* Error / Success */}
            {error && (
              <div className="login-error-box">
                <p>{error}</p>
              </div>
            )}
            {ok && (
              <div className="login-success-box">
                <p>{ok}</p>
                <Link
                  to={"/verify-email?email=" + encodeURIComponent(email.trim())}
                  className="login-verify-link"
                >
                  Verify email now →
                </Link>
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading} className="login-submit-btn">
              {loading ? (
                <span className="login-btn-loading">
                  <span className="login-spinner" />
                  Registering...
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          <p className="login-register-row">
            Already have an account?
            <Link to="/login" className="login-register-link">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
