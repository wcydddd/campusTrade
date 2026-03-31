import { useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { API_BASE } from "../api";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState({ password: false, confirm: false });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const passwordError = !password
    ? "Password is required"
    : password.length < 8
      ? "Password must be at least 8 characters"
      : "";

  const confirmError = !confirmPassword
    ? "Please confirm your password"
    : confirmPassword !== password
      ? "Passwords do not match"
      : "";

  const isFormValid = !passwordError && !confirmError && !!token;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setTouched({ password: true, confirm: true });
    setError("");
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || "Failed to reset password.");
      }
      setSuccess(true);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <h2 className="text-2xl font-extrabold text-gray-900">Invalid Reset Link</h2>
          <p className="mt-3 text-sm text-gray-600">This password reset link is invalid or has expired.</p>
          <Link to="/forgot-password" className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
            Request a new reset link →
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="flex justify-center mb-2">
            <img src={campusTradeLogo} alt="CampusTrade logo" className="h-auto w-24 max-w-full object-contain -mb-8 sm:w-28 sm:-mb-10" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Password Reset!</h2>
        </div>
        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl sm:px-10 border border-gray-100 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-gray-600">Your password has been reset successfully.</p>
            <button
              onClick={() => navigate("/login")}
              className="mt-6 w-full py-2.5 bg-[#fff0a0] text-gray-900 border-2 border-white rounded-lg hover:bg-[#ffe566] active:bg-[#FFD600] transition"
            >
              Go to Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-2">
          <img src={campusTradeLogo} alt="CampusTrade logo" className="h-auto w-24 max-w-full object-contain -mb-8 sm:w-28 sm:-mb-10" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Set New Password</h2>
        <p className="mt-2 text-sm text-gray-600">Enter your new password below</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, password: true }))}
                className={`w-full mt-1 px-3 py-2 border rounded-lg shadow-sm focus:ring-2 transition ${
                  touched.password && passwordError ? "border-red-300 focus:ring-red-500" : "border-gray-300 focus:ring-indigo-500"
                }`}
                placeholder="••••••••"
              />
              {touched.password && passwordError && <p className="mt-2 text-sm text-red-600">{passwordError}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => setTouched((p) => ({ ...p, confirm: true }))}
                className={`w-full mt-1 px-3 py-2 border rounded-lg shadow-sm focus:ring-2 transition ${
                  touched.confirm && confirmError ? "border-red-300 focus:ring-red-500" : "border-gray-300 focus:ring-indigo-500"
                }`}
                placeholder="••••••••"
              />
              {touched.confirm && confirmError && <p className="mt-2 text-sm text-red-600">{confirmError}</p>}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="w-full py-2.5 bg-[#fff0a0] text-gray-900 border-2 border-white rounded-lg hover:bg-[#ffe566] active:bg-[#FFD600] transition disabled:opacity-60"
            >
              {isSubmitting ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          <div className="mt-6 text-center text-sm">
            <Link to="/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
              ← Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
