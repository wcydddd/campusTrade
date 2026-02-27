/**
 * 后端 API 基地址
 * 开发：.env.development 中 VITE_API_URL，默认 http://localhost:8000
 * 生产：构建时设置 VITE_API_URL
 */
export const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * 带认证头的 fetch 封装（用于需要登录的接口）
 */
export async function authFetch(url, options = {}) {
  const token = localStorage.getItem("token");
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  return res;
}
