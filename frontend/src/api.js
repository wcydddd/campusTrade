export const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

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

/** 清除本地登录态并派发 auth:logout（401 时自动调用，或用户点击登出时调用） */
export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.dispatchEvent(new CustomEvent("auth:logout"));
}

/**
 * 带认证头的 fetch，传入完整 URL，返回 Response。
 * 若响应为 401，会清除 token/user 并派发 auth:logout，调用方仍会收到 401 的 res。
 */
export async function authFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    logout();
  }
  return res;
}

/** 获取当前用户信息 */
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