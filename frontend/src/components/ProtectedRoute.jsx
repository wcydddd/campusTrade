import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { getMe, getStoredToken, getStoredUser, logout, setStoredUser } from "../api";

export default function ProtectedRoute({ children, requireVerified = false }) {
  const location = useLocation();
  const token = getStoredToken();

  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);
  const [blockedByVerify, setBlockedByVerify] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // No token: block immediately
      if (!token || token.trim() === "") {
        if (!cancelled) {
          setOk(false);
          setChecking(false);
        }
        return;
      }

      try {
        const me = await getMe(); // GET /users/me
        if (cancelled) return;

        // Cache for page use (cleared on Home/logout)
        setStoredUser(me);

        if (requireVerified && me?.is_verified === false) {
          setBlockedByVerify(true);
          setOk(false);
        } else {
          setBlockedByVerify(false);
          setOk(true);
        }
      } catch (e) {
        // Invalid/expired token: auto logout
        logout();
        if (!cancelled) setOk(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, requireVerified]);

  if (!token || token.trim() === "") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (checking) return null;

  if (blockedByVerify) {
    // Not verified: redirect to verify-email (include email for convenience)
    let email = "";
    try {
      const u = getStoredUser() || {};
      email = u?.email || "";
    } catch {}
    const to = email ? `/verify-email?email=${encodeURIComponent(email)}` : "/verify-email";
    return <Navigate to={to} replace />;
  }

  if (!ok) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
