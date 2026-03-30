import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getMe, getStoredToken, setStoredUser } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((next) => {
    setUserState(next);
    setStoredUser(next);
  }, []);

  // On app startup: fetch current user if token exists
  useEffect(() => {
    let cancelled = false;
    const token = getStoredToken();

    if (!token || token.trim() === "") {
      setUserState(null);
      setLoading(false);
      return;
    }

    getMe()
      .then((me) => {
        if (!cancelled) {
          setUserState(me);
          setStoredUser(me);
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

  // Global 401 handler: clear user when api layer dispatches auth:logout
  useEffect(() => {
    const handleLogout = () => setUserState(null);
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  // After login: fetch current user to update context (localStorage may have been set but context is still null)
  useEffect(() => {
    const handleLogin = () => {
      const token = getStoredToken();
      if (!token) return;
      getMe()
        .then((me) => {
          setUserState(me);
          setStoredUser(me);
        })
        .catch(() => setUserState(null));
    };
    window.addEventListener("auth:login", handleLogin);
    return () => window.removeEventListener("auth:login", handleLogin);
  }, []);

  /** Manually refresh current user (e.g. after profile edit) */
  const refreshUser = useCallback(() => {
    const token = getStoredToken();
    if (!token) return setUserState(null);
    getMe()
      .then((me) => {
        setUserState(me);
        setStoredUser(me);
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
