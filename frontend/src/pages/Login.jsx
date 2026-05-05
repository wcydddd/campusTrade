import React, { useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { API_BASE, getStoredToken, saveAuthSession } from "../api";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";
import "./Login.css";

function MailIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="login-input-icon">
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
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
        <path
          fillRule="evenodd"
          d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
      <path
        fillRule="evenodd"
        d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
        clipRule="evenodd"
      />
      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
    </svg>
  );
}

export default function Login() {
  const token = getStoredToken();
  if (token) return <Navigate to="/home" replace />;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const [touched, setTouched] = useState({ email: false, password: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/home";

  const emailRegex = /^[^\s@]+@[^\s@]+\.(ac\.uk|edu)$/i;

  const emailError = !email
    ? "Email is required"
    : !emailRegex.test(email)
      ? "Please use a university email (.ac.uk / .edu)"
      : "";

  const passwordError = !password
    ? "Password is required"
    : password.length < 8
      ? "Password must be at least 8 characters"
      : "";

  const isFormValid = !emailError && !passwordError;

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setError("");
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        const minutes = data.retry_after ? Math.ceil(Number(data.retry_after) / 60) : 5;
        throw new Error(`Too many attempts. Please try again in ${minutes} minute(s).`);
      }
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Login failed");
      }
      saveAuthSession(data.access_token, data.user, rememberMe);
      window.dispatchEvent(new CustomEvent("auth:login"));
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-wrapper">
        {/* Header: Logo + Titles */}
        <div className="login-header">
          <img
            src={campusTradeLogo}
            alt="CampusTrade logo"
            className="login-logo-img"
          />
          <span className="login-brand-tag">UOL Campus</span>
          <h1 className="login-title">CampusTrade</h1>
          <p className="login-subtitle">Every treasure here has a story.</p>
        </div>

        {/* Card */}
        <div className="login-card">
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className="login-field">
              <label className="login-label">University Email</label>
              <div className={`login-input-wrap ${touched.email && emailError ? "login-input-wrap--error" : ""}`}>
                <MailIcon />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => handleBlur("email")}
                  className="login-input"
                  placeholder="Enter your university email (UOL)"
                />
              </div>
              {touched.email && emailError && (
                <p className="login-field-error">{emailError}</p>
              )}
            </div>

            {/* Password */}
            <div className="login-field">
              <label className="login-label">Password</label>
              <div className={`login-input-wrap ${touched.password && passwordError ? "login-input-wrap--error" : ""}`}>
                <LockIcon />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => handleBlur("password")}
                  className="login-input"
                  placeholder="••••••••"
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
              {touched.password && passwordError && (
                <p className="login-field-error">{passwordError}</p>
              )}
            </div>

            {/* Remember + Forgot */}
            <div className="login-meta-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="login-checkbox"
                />
                <span>Remember me</span>
              </label>
              <Link to="/forgot-password" className="login-forgot-link">
                Forgot your password?
              </Link>
            </div>

            {/* Error */}
            {error && (
              <div className="login-error-box">
                <p>{error}</p>
                {(error.includes("Email not verified") || error.includes("verify your email")) && (
                  <Link
                    to={"/verify-email" + (email.trim() ? "?email=" + encodeURIComponent(email.trim()) : "")}
                    className="login-verify-link"
                  >
                    Go to verify email →
                  </Link>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="login-submit-btn"
            >
              {isSubmitting ? (
                <span className="login-btn-loading">
                  <span className="login-spinner" />
                  Signing in...
                </span>
              ) : (
                "🛒 Sign in"
              )}
            </button>
          </form>

          {/* Register */}
          <p className="login-register-row">
            Don't have an account?
            <Link to="/register" className="login-register-link">
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
