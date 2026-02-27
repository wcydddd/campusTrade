import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

const API_BASE = "http://localhost:8080"; // TODO: 改成后端地址（建议后面用 env 管理）

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [msg, setMsg] = useState("Verifying your email...");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!token) {
      setMsg("Missing token. Please open the verification link from your email.");
      return;
    }

    fetch(`${API_BASE}/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.detail || "Verification failed.");
        return data;
      })
      .then(() => {
        setOk(true);
        setMsg("Email verified successfully! ✅");
      })
      .catch((e) => setMsg(e.message || "Verification failed."));
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 font-sans text-gray-900">
      <div className="w-full max-w-md bg-white border border-gray-100 rounded-xl shadow-sm p-6">
        <h2 className="text-xl font-semibold">Email Verification</h2>
        <p className="mt-3 text-sm text-gray-700">{msg}</p>

        <div className="mt-6 flex gap-4 text-sm">
          <Link to="/register" className="text-indigo-600 hover:text-indigo-500 font-medium">
            Back to Register
          </Link>
          <Link to="/login" className="text-indigo-600 hover:text-indigo-500 font-medium">
            Go to Login
          </Link>
          {ok ? (
            <Link to="/" className="text-indigo-600 hover:text-indigo-500 font-medium">
              Go Home
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}