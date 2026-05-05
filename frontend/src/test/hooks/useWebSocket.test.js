import { act, renderHook } from "@testing-library/react";
import useWebSocket from "../../hooks/useWebSocket";

const { tokenState, apiMocks } = vi.hoisted(() => ({
  tokenState: { value: null },
  apiMocks: {
    getStoredToken: vi.fn(),
  },
}));

vi.mock("../../api", () => ({
  WS_BASE: "ws://example.test/api",
  getStoredToken: apiMocks.getStoredToken,
}));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.send = vi.fn();
    this.close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.();
    });
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    MockWebSocket.instances.push(this);
  }

  static reset() {
    MockWebSocket.instances = [];
  }
}

function openSocket(socket) {
  act(() => {
    socket.readyState = MockWebSocket.OPEN;
    socket.onopen?.();
  });
}

function closeSocket(socket) {
  act(() => {
    socket.readyState = MockWebSocket.CLOSED;
    socket.onclose?.();
  });
}

function messageSocket(socket, data) {
  act(() => {
    socket.onmessage?.({ data });
  });
}

describe("useWebSocket", () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
    tokenState.value = null;
    apiMocks.getStoredToken.mockReset();
    apiMocks.getStoredToken.mockImplementation(() => tokenState.value);

    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();

    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: originalWebSocket,
    });
  });

  it("creates a websocket connection when a token is available", async () => {
    tokenState.value = "token-123";

    const { result } = renderHook(() => useWebSocket("/ws"));

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe(
      "ws://example.test/api/ws?token=token-123",
    );

    openSocket(MockWebSocket.instances[0]);
    expect(result.current.isConnected).toBe(true);
  });

  it("does not create a websocket connection when no token is available", () => {
    const { result } = renderHook(() => useWebSocket("/ws"));

    expect(MockWebSocket.instances).toHaveLength(0);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.lastMessage).toBeNull();
  });

  it("updates lastMessage when an incoming websocket message arrives", async () => {
    tokenState.value = "token-123";

    const { result } = renderHook(() => useWebSocket("/ws"));
    const socket = MockWebSocket.instances[0];

    openSocket(socket);
    expect(result.current.isConnected).toBe(true);

    messageSocket(socket, JSON.stringify({ type: "chat", text: "hello" }));

    expect(result.current.lastMessage).toEqual({ type: "chat", text: "hello" });
  });

  it("sendMessage sends serialized data through the open socket", async () => {
    tokenState.value = "token-123";

    const { result } = renderHook(() => useWebSocket("/ws"));
    const socket = MockWebSocket.instances[0];

    openSocket(socket);
    expect(result.current.isConnected).toBe(true);

    let sent;
    act(() => {
      sent = result.current.sendMessage({ type: "read", id: 7 });
    });

    expect(sent).toBe(true);
    expect(socket.send).toHaveBeenCalledWith('{"type":"read","id":7}');
  });

  it("disconnect closes the socket and prevents further sends", async () => {
    tokenState.value = "token-123";

    const { result } = renderHook(() => useWebSocket("/ws"));
    const socket = MockWebSocket.instances[0];

    openSocket(socket);
    expect(result.current.isConnected).toBe(true);

    act(() => {
      result.current.disconnect();
    });

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(false);
    expect(result.current.sendMessage("after-close")).toBe(false);
  });

  it("sends heartbeat pings and reconnects after an unexpected close", async () => {
    tokenState.value = "token-123";

    const { result } = renderHook(() => useWebSocket("/ws"));
    const firstSocket = MockWebSocket.instances[0];

    openSocket(firstSocket);
    expect(result.current.isConnected).toBe(true);

    act(() => {
      vi.advanceTimersByTime(30_000);
    });

    expect(firstSocket.send).toHaveBeenCalledWith('{"type":"ping"}');

    closeSocket(firstSocket);
    expect(result.current.isConnected).toBe(false);

    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1].url).toBe(
      "ws://example.test/api/ws?token=token-123",
    );
  });

  it("reacts to auth login and logout events as implemented", async () => {
    const { result } = renderHook(() => useWebSocket("/ws"));

    expect(MockWebSocket.instances).toHaveLength(0);

    tokenState.value = "fresh-token";
    act(() => {
      window.dispatchEvent(new CustomEvent("auth:login"));
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    const socket = MockWebSocket.instances[0];
    openSocket(socket);
    expect(result.current.isConnected).toBe(true);

    act(() => {
      window.dispatchEvent(new CustomEvent("auth:logout"));
    });

    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(result.current.isConnected).toBe(false);
  });
});
