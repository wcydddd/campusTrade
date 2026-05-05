import { act, renderHook, waitFor } from "@testing-library/react";
import { UnreadProvider, useUnread } from "../../context/UnreadContext";

const { authState, wsState, apiMocks } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: true,
  },
  wsState: {
    lastMessage: null,
    sendMessage: vi.fn(),
  },
  apiMocks: {
    authFetch: vi.fn(),
  },
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("../../context/WebSocketContext", () => ({
  useWs: () => wsState,
}));

vi.mock("../../api", () => ({
  API_BASE: "http://example.test/api",
  authFetch: apiMocks.authFetch,
}));

function wrapper({ children }) {
  return <UnreadProvider>{children}</UnreadProvider>;
}

describe("UnreadContext", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    wsState.lastMessage = null;
    wsState.sendMessage.mockReset();
    apiMocks.authFetch.mockReset();
  });

  it("defaults safely and avoids requests when unauthenticated", async () => {
    authState.isAuthenticated = false;

    const { result } = renderHook(() => useUnread(), { wrapper });

    await waitFor(() => expect(result.current.unreadCount).toBe(0));

    expect(apiMocks.authFetch).not.toHaveBeenCalled();
  });

  it("loads the initial unread count when authenticated", async () => {
    apiMocks.authFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ unread_count: 7 }),
    });

    const { result } = renderHook(() => useUnread(), { wrapper });

    await waitFor(() => expect(result.current.unreadCount).toBe(7));

    expect(apiMocks.authFetch).toHaveBeenCalledWith(
      "http://example.test/api/messages/unread-count",
    );
  });

  it("updates the unread count from websocket unread_update messages", async () => {
    apiMocks.authFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ unread_count: 2 }),
    });

    const { result, rerender } = renderHook(() => useUnread(), { wrapper });

    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    wsState.lastMessage = { type: "unread_update", unread_count: 9 };
    rerender();

    await waitFor(() => expect(result.current.unreadCount).toBe(9));
  });

  it("uses websocket read notifications when sendMessage succeeds", async () => {
    apiMocks.authFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ unread_count: 4 }),
    });
    wsState.sendMessage.mockReturnValue(true);

    const { result } = renderHook(() => useUnread(), { wrapper });

    await waitFor(() => expect(result.current.unreadCount).toBe(4));

    apiMocks.authFetch.mockClear();

    await act(async () => {
      await result.current.markConversationRead("seller-1", "prod-1");
    });

    expect(wsState.sendMessage).toHaveBeenCalledWith({
      type: "read",
      other_user_id: "seller-1",
      product_id: "prod-1",
    });
    expect(apiMocks.authFetch).not.toHaveBeenCalled();
  });

  it("falls back to REST and updates the total unread count when websocket send fails", async () => {
    wsState.sendMessage.mockReturnValue(false);
    apiMocks.authFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unread_count: 5 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total_unread: 1 }),
      });

    const { result } = renderHook(() => useUnread(), { wrapper });

    await waitFor(() => expect(result.current.unreadCount).toBe(5));

    await act(async () => {
      await result.current.markConversationRead("seller-2");
    });

    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(apiMocks.authFetch).toHaveBeenLastCalledWith(
      "http://example.test/api/messages/conversations/seller-2/read",
      { method: "POST" },
    );
  });
});
