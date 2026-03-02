import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { API_BASE } from "../api";

export default function Login() {
  // 表单状态
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // 交互状态
  const [touched, setTouched] = useState({ email: false, password: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/home";

  // 动态校验逻辑（.ac.uk / .edu）
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
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data.user));
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
        <div className="mx-auto h-12 w-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
        </div>
        <h2 className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">CampusTrade</h2>
        <p className="mt-2 text-sm text-gray-600">Sign in to access your campus marketplace</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">University Email</label>
              <div className="mt-1 relative">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => handleBlur("email")}
                  aria-invalid={touched.email && !!emailError}
                  aria-describedby={touched.email && emailError ? "email-error" : undefined}
                  className={`
                    appearance-none block w-full px-3 py-2 border rounded-lg shadow-sm placeholder-gray-400
                    focus:outline-none focus:ring-2 focus:ring-offset-0 sm:text-sm transition-colors
                    ${touched.email && emailError
                      ? "border-red-300 text-red-900 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"}
                  `}
                  placeholder="student@university.ac.uk"
                />
              </div>
              {touched.email && emailError && (
                <p className="mt-2 text-sm text-red-600" id="email-error" role="alert">
                  {emailError}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => handleBlur("password")}
                  aria-invalid={touched.password && !!passwordError}
                  aria-describedby={touched.password && passwordError ? "password-error" : undefined}
                  className={`
                    appearance-none block w-full px-3 py-2 border rounded-lg shadow-sm placeholder-gray-400
                    focus:outline-none focus:ring-2 focus:ring-offset-0 sm:text-sm transition-colors
                    ${touched.password && passwordError
                      ? "border-red-300 text-red-900 focus:ring-red-500 focus:border-red-500"
                      : "border-gray-300 focus:ring-indigo-500 focus:border-indigo-500"}
                  `}
                  placeholder="••••••••"
                />
              </div>
              {touched.password && passwordError && (
                <p className="mt-2 text-sm text-red-600" id="password-error" role="alert">
                  {passwordError}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer transition-colors"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900 cursor-pointer">
                  Remember me
                </label>
              </div>

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
            <div>
              <button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className={`
                  w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white
                  bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500
                  transition-all duration-200 ease-in-out
                  disabled:opacity-60 disabled:cursor-not-allowed
                `}
              >
                {isSubmitting ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-600">Don't have an account? </span>
            <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
              Register here
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-xs text-gray-500">
          By signing in you agree to our{" "}
          <a href="#terms" className="underline hover:text-gray-700">Terms of Service</a>{" "}
          and{" "}
          <a href="#privacy" className="underline hover:text-gray-700">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}