import { useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE } from "../api";

function isUniversityEmail(email) {
  return /@.+\.(edu|ac\.uk|edu\.cn)$/i.test(email);
}

export default function Register() {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 font-sans text-gray-900">
      <div
        style={{
          width: 360,
          background: "white",
          padding: 30,
          borderRadius: 12,
          boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: 6 }}>Create Account</h2>
        <p style={{ textAlign: "center", marginBottom: 18, fontSize: 13, color: "#666" }}>
          Use your university email to register.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            placeholder="University Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 12,
              borderRadius: 6,
              border: "1px solid #ccc",
            }}
          />
          <input
            placeholder="Username (min 8 chars)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 12,
              borderRadius: 6,
              border: "1px solid #ccc",
            }}
          />

          <input
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 12,
              borderRadius: 6,
              border: "1px solid #ccc",
            }}
          />

          <input
            type="password"
            placeholder="Confirm Password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              marginBottom: 12,
              borderRadius: 6,
              border: "1px solid #ccc",
            }}
          />

          <label style={{ fontSize: 14, display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />{" "}
            Agree to terms
          </label>

          {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}
          {ok && (
            <p style={{ color: "green", fontSize: 13 }}>
              {ok}{" "}
              <Link to={"/verify-email?email=" + encodeURIComponent(email.trim())} style={{ color: "#4f46e5", fontWeight: 500 }}>
                Verify email now →
              </Link>
            </p>
          )}

          <button
            disabled={loading}
            style={{
              width: "100%",
              padding: 12,
              marginTop: 10,
              background: loading ? "#9aa7f0" : "#667eea",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontWeight: "bold",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Creating..." : "Register"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <span className="text-gray-600">Already have an account? </span>
          <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}