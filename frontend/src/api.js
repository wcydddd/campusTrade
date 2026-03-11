// 开发环境走 Vite 代理 /api -> 后端 8000，避免跨域；生产环境用环境变量或同 host:8000
const _backendOrigin =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "" : `http://${window.location.hostname}:8000`);
export const API_BASE =
  _backendOrigin || (typeof window !== "undefined" ? "/api" : "http://127.0.0.1:8000");
// WebSocket：开发时用当前 host + /api，由 Vite 代理到后端
export const WS_BASE =
  import.meta.env.VITE_WS_URL ||
  (import.meta.env.DEV && typeof window !== "undefined"
    ? `ws://${window.location.host}/api`
    : (API_BASE.startsWith("http") ? API_BASE.replace(/^http/, "ws") : `ws://${window.location?.host || "127.0.0.1:5173"}/api`));

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
 *
 * ✅ Enhancement (B):
 * - 若响应为 429，会尝试解析 JSON 并挂到 res._data，方便调用方拿到更友好的提示信息
 */
export async function authFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  // 401: 清理登录态
  if (res.status === 401) {
    logout();
    return res;
  }

  // ✅ 429: 解析返回体（不改变返回类型；只是附加字段，页面可选用）
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