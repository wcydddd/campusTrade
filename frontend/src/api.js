// Dev: Vite proxy /api -> backend 8000 (avoids CORS); prod: env var or same host:8000
const _backendOrigin =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "" : `http://${window.location.hostname}:8000`);
export const API_BASE =
  _backendOrigin || (typeof window !== "undefined" ? "/api" : "http://127.0.0.1:8000");
// WebSocket: dev uses current host + /api via Vite proxy
export const WS_BASE =
  import.meta.env.VITE_WS_URL ||
  (import.meta.env.DEV && typeof window !== "undefined"
    ? `ws://${window.location.host}/api`
    : (API_BASE.startsWith("http") ? API_BASE.replace(/^http/, "ws") : `ws://${window.location?.host || "127.0.0.1:5173"}/api`));

const TOKEN_KEY = "token";
const USER_KEY = "user";

function getStorageCandidates() {
  if (typeof window === "undefined") return [];
  return [window.localStorage, window.sessionStorage];
}

function getActiveAuthStorage() {
  if (typeof window === "undefined") return null;
  if (window.localStorage.getItem(TOKEN_KEY)) return window.localStorage;
  if (window.sessionStorage.getItem(TOKEN_KEY)) return window.sessionStorage;
  if (window.localStorage.getItem(USER_KEY)) return window.localStorage;
  if (window.sessionStorage.getItem(USER_KEY)) return window.sessionStorage;
  return null;
}

export function getStoredToken() {
  const active = getActiveAuthStorage();
  if (active) return active.getItem(TOKEN_KEY);
  return null;
}

export function getStoredUser() {
  const active = getActiveAuthStorage();
  if (!active) return null;
  const raw = active.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  const active = getActiveAuthStorage() || (typeof window !== "undefined" ? window.localStorage : null);
  if (!active) return;
  if (!user) {
    active.removeItem(USER_KEY);
    return;
  }
  active.setItem(USER_KEY, JSON.stringify(user));
}

export function saveAuthSession(token, user, rememberMe = false) {
  if (typeof window === "undefined") return;
  getStorageCandidates().forEach((storage) => {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(USER_KEY);
  });

  const storage = rememberMe ? window.localStorage : window.sessionStorage;
  storage.setItem(TOKEN_KEY, token);
  storage.setItem(USER_KEY, JSON.stringify(user));
}

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await parseJsonSafe(res);

  if (!res.ok) {
    const msg = data?.detail || data?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/** Clear local auth state and dispatch auth:logout (called on 401 or manual logout) */
export function logout() {
  getStorageCandidates().forEach((storage) => {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(USER_KEY);
  });
  window.dispatchEvent(new CustomEvent("auth:logout"));
}

/**
 * Authenticated fetch wrapper. Accepts full URL, returns Response.
 * On 401: clears token/user and dispatches auth:logout; caller still receives 401 res.
 * On 429: attempts to parse JSON and attach to res._data for caller convenience.
 */
export async function authFetch(url, options = {}) {
  const token = getStoredToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  // 401: clear auth state
  if (res.status === 401) {
    logout();
    return res;
  }

  // 429: parse body and attach to res._data (optional convenience for callers)
  if (res.status === 429) {
    try {
      const cloned = res.clone();
      const text = await cloned.text();
      res._data = text ? JSON.parse(text) : null;
    } catch {
      res._data = null;
    }
  }

  return res;
}

/** Fetch current user info */
export async function getMe() {
  const res = await authFetch(`${API_BASE}/auth/me`);
  const data = await parseJsonSafe(res);
  if (!res.ok) {
    const err = new Error(data?.detail || data?.message || "Failed to load user");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
