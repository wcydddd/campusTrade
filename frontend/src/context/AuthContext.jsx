import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getMe } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((next) => {
    setUserState(next);
    if (next) {
      localStorage.setItem("user", JSON.stringify(next));
    }
  }, []);

  // App 启动时：有 token 则拉一次当前用户，刷新状态
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem("token");

    if (!token || token.trim() === "") {
      setUserState(null);
      setLoading(false);
      return;
    }

    getMe()
      .then((me) => {
        if (!cancelled) {
          setUserState(me);
          localStorage.setItem("user", JSON.stringify(me));
        }
      })
      .catch(() => {
        if (!cancelled) setUserState(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // 401 统一处理：任意接口返回 401 时 api 层会派发 auth:logout，这里同步清空 user
  useEffect(() => {
    const handleLogout = () => setUserState(null);
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  // 登录成功后派发 auth:login，这里拉一次当前用户以更新 context（避免只写了 localStorage 但 context 仍为 null）
  useEffect(() => {
    const handleLogin = () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      getMe()
        .then((me) => {
          setUserState(me);
          localStorage.setItem("user", JSON.stringify(me));
        })
        .catch(() => setUserState(null));
    };
    window.addEventListener("auth:login", handleLogin);
    return () => window.removeEventListener("auth:login", handleLogin);
  }, []);

  /** 手动刷新当前用户（如编辑资料后可调用） */
  const refreshUser = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return setUserState(null);
    getMe()
      .then((me) => {
        setUserState(me);
        localStorage.setItem("user", JSON.stringify(me));
      })
      .catch(() => setUserState(null));
  }, []);

  const value = {
    user,
    setUser,
    loading,
    isAuthenticated: !!user,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
