import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { API_BASE, authFetch } from "../api";
import { useAuth } from "./AuthContext";
import { useWs } from "./WebSocketContext";

const UnreadContext = createContext(null);

/**
 * Provides a global `unreadCount` that stays in sync via:
 *   1. Initial HTTP fetch on mount (GET /messages/unread-count)
 *   2. Real-time WebSocket pushes  (type: "unread_update")
 */
export function UnreadProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { lastMessage, sendMessage } = useWs();
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch initial count when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`${API_BASE}/messages/unread-count`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUnreadCount(data.unread_count ?? 0);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Listen for real-time unread_update from WebSocket
  useEffect(() => {
    if (lastMessage?.type === "unread_update" && typeof lastMessage.unread_count === "number") {
      setUnreadCount(lastMessage.unread_count);
    }
  }, [lastMessage]);

  /**
   * Mark a conversation as read (optionally only for one product).
   * Uses WebSocket when available, else REST.
   */
  const markConversationRead = useCallback(
    async (otherUserId, productId = null) => {
      const payload = { type: "read", other_user_id: otherUserId };
      if (productId) payload.product_id = productId;
      const sent = sendMessage(payload);
      if (!sent) {
        try {
          const url = productId
            ? `${API_BASE}/messages/conversations/${otherUserId}/read?product_id=${productId}`
            : `${API_BASE}/messages/conversations/${otherUserId}/read`;
          const res = await authFetch(url, { method: "POST" });
          if (res.ok) {
            const data = await res.json();
            setUnreadCount(data.total_unread ?? 0);
          }
        } catch {
          /* ignore */
        }
      }
    },
    [sendMessage],
  );

  return (
    <UnreadContext.Provider value={{ unreadCount, setUnreadCount, markConversationRead }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  const ctx = useContext(UnreadContext);
  if (!ctx) throw new Error("useUnread must be used within <UnreadProvider>");
  return ctx;
}
