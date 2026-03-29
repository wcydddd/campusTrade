import { createContext, useContext } from "react";
import useWebSocket from "../hooks/useWebSocket";

const WebSocketContext = createContext(null);

/**
 * Wraps the entire app so that a single WebSocket connection is shared
 * across all components. Place this inside AuthProvider so it can
 * react to the shared auth storage and auth:login / auth:logout events.
 */
export function WebSocketProvider({ children }) {
  const ws = useWebSocket("/ws");
  return (
    <WebSocketContext.Provider value={ws}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Consume the global WebSocket connection from any component.
 *
 * @returns {{ isConnected, lastMessage, sendMessage, connect, disconnect }}
 */
export function useWs() {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error("useWs must be used within <WebSocketProvider>");
  }
  return ctx;
}
