import React, { useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { API_BASE, getStoredToken, saveAuthSession } from "../api";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";

export default function Login() {
  const token = getStoredToken();
  if (token) return <Navigate to="/home" replace />;

  // Form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // UI state
  const [touched, setTouched] = useState({ email: false, password: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/home";

  // Email validation
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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-2">
          <img
            src={campusTradeLogo}
            alt="CampusTrade logo"
            className="h-auto w-24 max-w-full object-contain -mb-8 sm:w-28 sm:-mb-10"
          />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">CampusTrade</h2>
        <p className="mt-2 text-sm text-gray-600">Sign in to access your campus marketplace</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                University Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur("email")}
                className={`w-full mt-1 px-3 py-2 border rounded-lg shadow-sm focus:ring-2 transition
                  ${touched.email && emailError
                    ? "border-red-300 focus:ring-red-500"
                    : "border-gray-300 focus:ring-indigo-500"}
                `}
                placeholder="student@university.ac.uk"
              />
              {touched.email && emailError && (
                <p className="mt-2 text-sm text-red-600">{emailError}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => handleBlur("password")}
                className={`w-full mt-1 px-3 py-2 border rounded-lg shadow-sm focus:ring-2 transition
                  ${touched.password && passwordError
                    ? "border-red-300 focus:ring-red-500"
                    : "border-gray-300 focus:ring-indigo-500"}
                `}
                placeholder="••••••••"
              />
              {touched.password && passwordError && (
                <p className="mt-2 text-sm text-red-600">{passwordError}</p>
              )}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between text-sm">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="mr-2"
                />
                Remember me
              </label>

              <div className="text-sm">
                <button
                  type="button"
                  onClick={() => alert("Forgot Password is coming soon (UI only for now).")}
                  className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
                >
                  Forgot your password?
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm">
                <p className="text-red-600" role="alert">
                  {error}
                </p>
                {(error.includes("Email not verified") || error.includes("verify your email")) && (
                  <Link
                    to={"/verify-email" + (email.trim() ? "?email=" + encodeURIComponent(email.trim()) : "")}
                    className="inline-block mt-2 font-medium text-indigo-600 hover:text-indigo-500"
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
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {/* Register link */}
          <div className="mt-6 text-center text-sm">
            <span className="text-gray-600">Don't have an account? </span>
            <Link
              to="/register"
              className="text-indigo-600 hover:text-indigo-500 font-medium"
            >
              Register here
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
