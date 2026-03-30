import { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api";
import campusTradeLogo from "../assets/uol-secondhand-logo.png";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const emailRegex = /^[^\s@]+@[^\s@]+\.(ac\.uk|edu)$/i;
  const emailError = !email
    ? "Email is required"
    : !emailRegex.test(email)
      ? "Please use a university email (.ac.uk / .edu)"
      : "";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (emailError) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.status === 429) {
        throw new Error("Too many requests. Please try again later.");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Something went wrong.");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err.message || "Failed to send reset email.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
          <div className="flex justify-center mb-2">
            <img src={campusTradeLogo} alt="CampusTrade logo" className="h-auto w-24 max-w-full object-contain -mb-8 sm:w-28 sm:-mb-10" />
          </div>
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Check Your Email</h2>
        </div>
        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl sm:px-10 border border-gray-100 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              If <strong>{email}</strong> is registered, we've sent a password reset link to that address. Please check your inbox (and spam folder).
            </p>
            <p className="mt-4 text-xs text-gray-400">The link will expire in 30 minutes.</p>
            <Link to="/login" className="mt-6 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
              ← Back to Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-gray-900">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-2">
          <img src={campusTradeLogo} alt="CampusTrade logo" className="h-auto w-24 max-w-full object-contain -mb-8 sm:w-28 sm:-mb-10" />
        </div>
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Reset Password</h2>
        <p className="mt-2 text-sm text-gray-600">Enter your university email and we'll send you a reset link</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700">University Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 transition"
                placeholder="student@university.ac.uk"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={!!emailError || isSubmitting}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Send Reset Link"}
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
