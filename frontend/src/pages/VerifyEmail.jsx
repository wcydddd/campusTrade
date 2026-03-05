import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { API_BASE } from "../api";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const emailFromUrl = params.get("email") || "";

  const [email, setEmail] = useState(emailFromUrl);
  const [code, setCode] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [countdown, setCountdown] = useState(0);
  const [verified, setVerified] = useState(false);

  // 发送验证码倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  const handleSendCode = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "Please enter your university email." });
      return;
    }
    setMessage({ type: "", text: "" });
    setSendLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/send-verification-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Failed to send code");
      }
      setMessage({ type: "success", text: "Verification code sent to your email." });
      setCountdown(60);
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Failed to send code" });
    } finally {
      setSendLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setMessage({ type: "error", text: "Please enter your email." });
      return;
    }
    if (!code.trim() || code.trim().length !== 6) {
      setMessage({ type: "error", text: "Please enter the 6-digit code from your email." });
      return;
    }
    setMessage({ type: "", text: "" });
    setVerifyLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.message || "Verification failed");
      }
      setVerified(true);
      setMessage({ type: "success", text: "Email verified successfully. You can sign in now." });
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Verification failed" });
    } finally {
      setVerifyLoading(false);
    }
  };

  if (verified) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 font-sans text-gray-900">
        <div className="w-full max-w-md bg-white border border-gray-100 rounded-xl shadow-sm p-6">
          <h2 className="text-xl font-semibold">Email Verified</h2>
          <p className="mt-3 text-sm text-green-600">{message.text}</p>
          <div className="mt-6 flex gap-4 text-sm">
            <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
              Sign in
            </Link>
            <Link to="/" className="font-medium text-indigo-600 hover:text-indigo-500">
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 font-sans text-gray-900">
      <div className="w-full max-w-md bg-white border border-gray-100 rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold">Verify your email</h2>
        <p className="mt-2 text-sm text-gray-600">
          Enter your university email and the 6-digit code we sent you.
        </p>

        <form className="mt-6 space-y-4">
          <div>
            <label htmlFor="verify-email" className="block text-sm font-medium text-gray-700">
              University Email
            </label>
            <input
              id="verify-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.ac.uk"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendLoading || countdown > 0}
              className="flex-1 py-2 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {countdown > 0 ? `Resend in ${countdown}s` : sendLoading ? "Sending..." : "Send verification code"}
            </button>
          </div>

          <div>
            <label htmlFor="verify-code" className="block text-sm font-medium text-gray-700">
              Verification code (6 digits)
            </label>
            <input
              id="verify-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <button
            type="submit"
            onClick={handleVerify}
            disabled={verifyLoading || code.trim().length !== 6}
            className="w-full py-2.5 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifyLoading ? "Verifying..." : "Verify email"}
          </button>
        </form>

        {message.text && (
          <p
            className={`mt-4 text-sm ${message.type === "error" ? "text-red-600" : "text-green-600"}`}
            role="alert"
          >
            {message.text}
          </p>
        )}

        <div className="mt-6 flex gap-4 text-sm">
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Back to Sign in
          </Link>
          <Link to="/register" className="font-medium text-indigo-600 hover:text-indigo-500">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
