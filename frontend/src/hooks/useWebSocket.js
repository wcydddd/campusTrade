import { useState, useEffect, useRef, useCallback } from "react";
import { WS_BASE, getStoredToken } from "../api";

const HEARTBEAT_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Global WebSocket hook.
 *
 * - JWT token passed as query parameter during handshake.
 * - Heartbeat ping/pong with automatic teardown on timeout.
 * - Exponential back-off reconnection on unexpected close.
 * - Syncs with auth:login / auth:logout custom events.
 */
export default function useWebSocket(path = "/ws") {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);

  const wsRef = useRef(null);
  const hbTimer = useRef(null);
  const pongTimer = useRef(null);
  const reconTimer = useRef(null);
  const attemptsRef = useRef(0);
  const closedByUser = useRef(false);
  const alive = useRef(true);

  const clearAllTimers = () => {
    clearInterval(hbTimer.current);
    clearTimeout(pongTimer.current);
    clearTimeout(reconTimer.current);
  };

  const connectFnRef = useRef(null);

  connectFnRef.current = () => {
    const token = getStoredToken();
    if (!token || !alive.current) return;

    // Detach old WS so its onclose won't trigger reconnect
    const old = wsRef.current;
    if (old) {
      old.onopen = null;
      old.onmessage = null;
      old.onclose = null;
      old.onerror = null;
      try { old.close(); } catch { /* ignore */ }
    }
    clearAllTimers();

    const url = `${WS_BASE}${path}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!alive.current || wsRef.current !== ws) return;
      setIsConnected(true);
      attemptsRef.current = 0;

      clearInterval(hbTimer.current);
      hbTimer.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
          pongTimer.current = setTimeout(() => ws.close(), PONG_TIMEOUT_MS);
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    ws.onmessage = (e) => {
      if (!alive.current || wsRef.current !== ws) return;
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "pong") {
          clearTimeout(pongTimer.current);
          return;
        }
        setLastMessage(msg);
      } catch {
        setLastMessage({ type: "raw", payload: e.data });
      }
    };

    ws.onclose = () => {
      // If this WS has already been replaced by a newer one, do nothing
      if (wsRef.current !== ws) return;
      if (!alive.current) return;

      setIsConnected(false);
      clearInterval(hbTimer.current);

      if (!closedByUser.current) {
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** attemptsRef.current,
          RECONNECT_MAX_MS,
        );
        attemptsRef.current += 1;
        reconTimer.current = setTimeout(
          () => connectFnRef.current?.(),
          delay,
        );
      }
    };

    ws.onerror = () => {};
  };

  const connect = useCallback(() => connectFnRef.current?.(), []);

  const disconnect = useCallback(() => {
    closedByUser.current = true;
    clearAllTimers();
    const ws = wsRef.current;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      wsRef.current = null;
      try { ws.close(); } catch { /* ignore */ }
    }
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((data) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(typeof data === "string" ? data : JSON.stringify(data));
    return true;
  }, []);

  useEffect(() => {
    alive.current = true;
    closedByUser.current = false;

    if (getStoredToken()) connect();

    const onLogin = () => {
      closedByUser.current = false;
      connect();
    };
    const onLogout = () => disconnect();

    window.addEventListener("auth:login", onLogin);
    window.addEventListener("auth:logout", onLogout);

    return () => {
      alive.current = false;
      disconnect();
      window.removeEventListener("auth:login", onLogin);
      window.removeEventListener("auth:logout", onLogout);
    };
  }, [connect, disconnect]);

  return { isConnected, lastMessage, sendMessage, connect, disconnect };
}
