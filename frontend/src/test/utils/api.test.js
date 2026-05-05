import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadApiModule() {
  vi.resetModules();
  return import("../../api.js");
}

describe("api utilities", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  it("uses VITE_API_URL when configured", async () => {
    vi.stubEnv("VITE_API_URL", "https://backend.example");

    const { API_BASE } = await loadApiModule();

    expect(API_BASE).toBe("https://backend.example");
  });

  it("falls back to the implemented proxy/default API_BASE behaviour when no env override is set", async () => {
    const { API_BASE } = await loadApiModule();
    const expected = import.meta.env.DEV
      ? "/api"
      : `http://${window.location.hostname}:8000`;

    expect(API_BASE).toBe(expected);
  });

  it("returns the token from localStorage when present", async () => {
    localStorage.setItem("token", "local-token");

    const { getStoredToken } = await loadApiModule();

    expect(getStoredToken()).toBe("local-token");
  });

  it("prefers localStorage over sessionStorage for the stored token", async () => {
    localStorage.setItem("token", "local-token");
    sessionStorage.setItem("token", "session-token");

    const { getStoredToken } = await loadApiModule();

    expect(getStoredToken()).toBe("local-token");
  });

  it("falls back to sessionStorage when localStorage has no token", async () => {
    sessionStorage.setItem("token", "session-token");

    const { getStoredToken } = await loadApiModule();

    expect(getStoredToken()).toBe("session-token");
  });

  it("stores user data in the active auth storage", async () => {
    sessionStorage.setItem("token", "session-token");
    const user = { id: "u-1", username: "alice" };

    const { setStoredUser } = await loadApiModule();
    setStoredUser(user);

    expect(sessionStorage.getItem("user")).toBe(JSON.stringify(user));
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("defaults to localStorage when storing a user without an active auth storage", async () => {
    const user = { id: "u-2", username: "bob" };

    const { setStoredUser } = await loadApiModule();
    setStoredUser(user);

    expect(localStorage.getItem("user")).toBe(JSON.stringify(user));
  });

  it("attaches the Authorization header when a token exists", async () => {
    localStorage.setItem("token", "abc123");
    global.fetch.mockResolvedValue({ status: 200 });

    const { authFetch } = await loadApiModule();
    await authFetch("http://example.test/api/products", { method: "GET" });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://example.test/api/products",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer abc123",
        }),
      }),
    );
  });

  it("does not attach Authorization when no token exists", async () => {
    global.fetch.mockResolvedValue({ status: 200 });

    const { authFetch } = await loadApiModule();
    await authFetch("http://example.test/api/products");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://example.test/api/products",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("clears auth storage and dispatches auth:logout when authFetch receives 401", async () => {
    localStorage.setItem("token", "local-token");
    localStorage.setItem("user", JSON.stringify({ id: "u-1" }));
    sessionStorage.setItem("token", "session-token");
    sessionStorage.setItem("user", JSON.stringify({ id: "u-2" }));
    global.fetch.mockResolvedValue({ status: 401 });

    const logoutListener = vi.fn();
    window.addEventListener("auth:logout", logoutListener);

    const { authFetch } = await loadApiModule();
    const response = await authFetch("http://example.test/api/me");

    expect(response.status).toBe(401);
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("user")).toBeNull();
    expect(logoutListener).toHaveBeenCalledTimes(1);

    window.removeEventListener("auth:logout", logoutListener);
  });

  it("logout clears auth storage and dispatches auth:logout", async () => {
    localStorage.setItem("token", "local-token");
    sessionStorage.setItem("user", JSON.stringify({ id: "u-1" }));

    const logoutListener = vi.fn();
    window.addEventListener("auth:logout", logoutListener);

    const { logout } = await loadApiModule();
    logout();

    expect(localStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("user")).toBeNull();
    expect(logoutListener).toHaveBeenCalledTimes(1);

    window.removeEventListener("auth:logout", logoutListener);
  });
});
