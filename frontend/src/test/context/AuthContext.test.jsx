import { act, renderHook, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../../context/AuthContext";

const apiMocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  getStoredToken: vi.fn(),
  setStoredUser: vi.fn(),
}));

vi.mock("../../api", () => ({
  getMe: apiMocks.getMe,
  getStoredToken: apiMocks.getStoredToken,
  setStoredUser: apiMocks.setStoredUser,
}));

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    apiMocks.getMe.mockReset();
    apiMocks.getStoredToken.mockReset();
    apiMocks.setStoredUser.mockReset();
  });

  it("defaults to unauthenticated when no stored token exists", async () => {
    apiMocks.getStoredToken.mockReturnValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(apiMocks.getMe).not.toHaveBeenCalled();
  });

  it("restores the current user when a stored token exists", async () => {
    const me = { id: "u-1", username: "alice", role: "user" };
    apiMocks.getStoredToken.mockReturnValue("token-123");
    apiMocks.getMe.mockResolvedValue(me);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.user).toEqual(me));

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.loading).toBe(false);
    expect(apiMocks.getMe).toHaveBeenCalledTimes(1);
    expect(apiMocks.setStoredUser).toHaveBeenCalledWith(me);
  });

  it("syncs storage when setUser is called manually", async () => {
    apiMocks.getStoredToken.mockReturnValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const nextUser = { id: "u-2", username: "bob", role: "admin" };
    act(() => {
      result.current.setUser(nextUser);
    });

    expect(result.current.user).toEqual(nextUser);
    expect(result.current.isAuthenticated).toBe(true);
    expect(apiMocks.setStoredUser).toHaveBeenLastCalledWith(nextUser);
  });

  it("clears the user on auth:logout and refreshes on auth:login", async () => {
    const restored = { id: "u-1", username: "alice", role: "user" };
    const refreshed = { id: "u-1", username: "alice-updated", role: "user" };

    apiMocks.getStoredToken.mockReturnValue("token-123");
    apiMocks.getMe
      .mockResolvedValueOnce(restored)
      .mockResolvedValueOnce(refreshed);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.user).toEqual(restored));

    act(() => {
      window.dispatchEvent(new CustomEvent("auth:logout"));
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);

    act(() => {
      window.dispatchEvent(new CustomEvent("auth:login"));
    });

    await waitFor(() => expect(result.current.user).toEqual(refreshed));
    expect(apiMocks.getMe).toHaveBeenCalledTimes(2);
    expect(apiMocks.setStoredUser).toHaveBeenLastCalledWith(refreshed);
  });
});
