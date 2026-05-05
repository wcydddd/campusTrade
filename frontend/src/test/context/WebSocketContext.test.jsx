import { render, renderHook, screen } from "@testing-library/react";
import { WebSocketProvider, useWs } from "../../context/WebSocketContext";

const { hookValue, mockUseWebSocket } = vi.hoisted(() => ({
  hookValue: {
    isConnected: true,
    lastMessage: { type: "chat", text: "hello" },
    sendMessage: vi.fn(() => true),
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
  mockUseWebSocket: vi.fn(),
}));

vi.mock("../../hooks/useWebSocket", () => ({
  default: mockUseWebSocket,
}));

function wrapper({ children }) {
  return <WebSocketProvider>{children}</WebSocketProvider>;
}

function Consumer() {
  const ws = useWs();
  return (
    <div>
      <span>{ws.isConnected ? "connected" : "disconnected"}</span>
      <span>{ws.lastMessage?.type ?? "none"}</span>
    </div>
  );
}

describe("WebSocketContext", () => {
  beforeEach(() => {
    hookValue.isConnected = true;
    hookValue.lastMessage = { type: "chat", text: "hello" };
    hookValue.sendMessage.mockReset();
    hookValue.sendMessage.mockReturnValue(true);
    hookValue.connect.mockReset();
    hookValue.disconnect.mockReset();
    mockUseWebSocket.mockReset();
    mockUseWebSocket.mockReturnValue(hookValue);
  });

  it("renders the provider safely and exposes the hook value to consumers", () => {
    render(
      <WebSocketProvider>
        <Consumer />
      </WebSocketProvider>,
    );

    expect(screen.getByText("connected")).toBeInTheDocument();
    expect(screen.getByText("chat")).toBeInTheDocument();
    expect(mockUseWebSocket).toHaveBeenCalledWith("/ws");
  });

  it("returns the websocket API from useWs inside the provider", () => {
    const { result } = renderHook(() => useWs(), { wrapper });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.lastMessage).toEqual({ type: "chat", text: "hello" });
    expect(result.current.sendMessage("payload")).toBe(true);
    expect(hookValue.sendMessage).toHaveBeenCalledWith("payload");
  });

  it("throws when useWs is used outside the provider", () => {
    expect(() => renderHook(() => useWs())).toThrow(
      "useWs must be used within <WebSocketProvider>",
    );
  });
});
