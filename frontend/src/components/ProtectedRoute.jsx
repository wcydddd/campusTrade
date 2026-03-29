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
      // 没 token：直接拦截
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

        // 存一份给页面用（Home/logout 也会清）
        setStoredUser(me);

        if (requireVerified && me?.is_verified === false) {
          setBlockedByVerify(true);
          setOk(false);
        } else {
          setBlockedByVerify(false);
          setOk(true);
        }
      } catch (e) {
        // token 无效/过期：自动登出
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

  if (checking) return null; // 你也可以换成 Loading...

  if (blockedByVerify) {
    // 未验证：引导去 verify-email（把 email 带上更友好）
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
